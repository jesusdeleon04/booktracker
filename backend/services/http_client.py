"""
Polite, cached HTTP client for the bibliographic APIs.

* Responses are cached in a small SQLite file (`data/api_cache.db`) with a TTL,
  so repeated searches and recommendations are instant and we stay well below
  the public APIs' rate limits.
* Concurrency per host is bounded (Open Library asks clients to be gentle).
* A circuit breaker disables a source for a while after quota errors (Google
  Books answers 429 when the anonymous quota is exhausted), so the app falls
  back to the other source without waiting on doomed requests.
"""
import hashlib
import json
import sqlite3
import threading
import time
from collections import OrderedDict
from urllib.parse import urlencode, urlparse

import requests

import config

_session = requests.Session()
_session.headers.update({"User-Agent": config.USER_AGENT, "Accept": "application/json"})

_HOST_LIMITS = {
    "openlibrary.org": threading.BoundedSemaphore(5),
    "www.googleapis.com": threading.BoundedSemaphore(6),
}
_DEFAULT_LIMIT = threading.BoundedSemaphore(4)
# Wikimedia counts every wiki as one client and asks for at most 3 parallel
# requests; we stay at 2 (Wikisource, Wikidata, Wikipedia, Commons share it).
_WIKIMEDIA_LIMIT = threading.BoundedSemaphore(2)
_WIKIMEDIA_SUFFIXES = (".wikisource.org", ".wikidata.org", ".wikipedia.org", ".wikimedia.org")

_memory = OrderedDict()
_memory_lock = threading.Lock()
_MEMORY_MAX = 600

_breaker = {}  # host -> {"until": ts, "reason": str}
_breaker_lock = threading.Lock()

_cache_init_lock = threading.Lock()
_cache_ready = False

MISS = object()


class SourceUnavailable(Exception):
    pass


def _conn():
    global _cache_ready
    conn = sqlite3.connect(config.CACHE_DB_PATH, timeout=10)
    if not _cache_ready:
        with _cache_init_lock:
            if not _cache_ready:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute(
                    "CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, url TEXT, status INTEGER, body TEXT, ts REAL)"
                )
                conn.commit()
                _cache_ready = True
    return conn


def _semaphore(host):
    if host.endswith(_WIKIMEDIA_SUFFIXES):
        return _WIKIMEDIA_LIMIT
    return _HOST_LIMITS.get(host, _DEFAULT_LIMIT)


def is_wikimedia(host):
    return host.endswith(_WIKIMEDIA_SUFFIXES)


def _key(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def _cache_get(url, ttl):
    k = _key(url)
    now = time.time()
    with _memory_lock:
        hit = _memory.get(k)
        if hit and now - hit[1] < ttl:
            _memory.move_to_end(k)
            return hit[0]
    try:
        conn = _conn()
        row = conn.execute("SELECT status, body, ts FROM cache WHERE k=?", (k,)).fetchone()
        conn.close()
    except sqlite3.Error:
        return MISS
    if not row or now - row[2] >= ttl:
        return MISS
    status, body, ts = row
    value = json.loads(body) if status == 200 else None
    _remember(k, value, ts)
    return value


def _remember(k, value, ts):
    with _memory_lock:
        _memory[k] = (value, ts)
        _memory.move_to_end(k)
        while len(_memory) > _MEMORY_MAX:
            _memory.popitem(last=False)


def _cache_put(url, status, value):
    k = _key(url)
    ts = time.time()
    _remember(k, value, ts)
    try:
        conn = _conn()
        conn.execute(
            "INSERT OR REPLACE INTO cache (k, url, status, body, ts) VALUES (?,?,?,?,?)",
            (k, url, status, json.dumps(value) if value is not None else "null", ts),
        )
        conn.commit()
        conn.close()
    except sqlite3.Error:
        pass


def cache_lookup(key, ttl):
    """Read an arbitrary cached value (e.g. one Wikidata entity out of a batch)."""
    value = _cache_get(key, ttl)
    return None if value is MISS else value


def cache_store(key, value):
    _cache_put(key, 200, value)


def breaker_status(host):
    with _breaker_lock:
        state = _breaker.get(host)
        if state and state["until"] > time.time():
            return state
    return None


def _trip(host, seconds, reason):
    with _breaker_lock:
        _breaker[host] = {"until": time.time() + seconds, "reason": reason}


def build_url(base, params=None):
    if not params:
        return base
    clean = {k: v for k, v in params.items() if v not in (None, "")}
    return base + ("&" if "?" in base else "?") + urlencode(clean)


def get_json(base, params=None, ttl=3 * 24 * 3600, timeout=10, cache_key_exclude=()):
    """
    GET a JSON document. Returns the parsed JSON, or None for 404/empty.
    Raises SourceUnavailable when the host is rate-limited/down.

    `cache_key_exclude` lets callers keep secrets (API keys) out of the cache key.
    """
    params = dict(params or {})
    public_params = {k: v for k, v in params.items() if k not in cache_key_exclude}
    url = build_url(base, params)
    cache_url = build_url(base, public_params)

    cached = _cache_get(cache_url, ttl)
    if cached is not MISS:
        return cached

    host = urlparse(base).netloc
    if breaker_status(host):
        raise SourceUnavailable(host)

    sem = _semaphore(host)
    last_error = None
    for attempt in range(2):
        with sem:
            try:
                res = _session.get(url, timeout=timeout)
            except requests.Timeout:
                # A slow query is not a dead host: give up on this request only.
                raise SourceUnavailable(host)
            except requests.RequestException as exc:
                last_error = exc
                res = None
        if res is None:
            time.sleep(0.4 * (attempt + 1))
            continue
        if res.status_code == 200:
            try:
                data = res.json()
            except ValueError:
                data = None
            _cache_put(cache_url, 200, data)
            return data
        if res.status_code == 404:
            _cache_put(cache_url, 404, None)
            return None
        if res.status_code in (403, 429):
            # Quota exhausted / rate limited: stop hammering this host for a while,
            # honouring Retry-After when the server sends it.
            wait = 15 * 60 if "googleapis" in host else 60
            try:
                wait = max(5, min(int(res.headers.get("Retry-After", "")), 15 * 60))
            except ValueError:
                pass
            _trip(host, wait, f"HTTP {res.status_code}")
            raise SourceUnavailable(host)
        if res.status_code >= 500:
            last_error = Exception(f"HTTP {res.status_code}")
            time.sleep(0.5 * (attempt + 1))
            continue
        return None
    if last_error is not None:
        # Repeated network errors: back off briefly.
        _trip(host, 20, str(last_error)[:120])
    raise SourceUnavailable(host)
