"""PoetryDB: classic English-language poetry (texts from Project Gutenberg)."""
from urllib.parse import quote

from .. import http_client

BASE = "https://poetrydb.org"
WEEK = 7 * 24 * 3600
FULL = "author,title,lines,linecount"
LIGHT = "author,title,linecount"


def _q(text):
    return quote((text or "").strip().replace("/", " ").replace(";", ","), safe="")


def _get(path, ttl=WEEK):
    data = http_client.get_json(f"{BASE}/{path}", ttl=ttl, timeout=20)
    if isinstance(data, dict):  # {"status": 404, "reason": "Not found"}
        return []
    return [_norm(p) for p in data or [] if isinstance(p, dict) and p.get("title")]


def _norm(p):
    try:
        p["linecount"] = int(p.get("linecount") or len(p.get("lines") or []))
    except (TypeError, ValueError):
        p["linecount"] = len(p.get("lines") or [])
    return p


def authors():
    data = http_client.get_json(f"{BASE}/author", ttl=30 * 24 * 3600, timeout=20)
    return (data or {}).get("authors") or []


def by_author(name, full=False):
    return _get(f"author/{_q(name)}:abs/{FULL if full else LIGHT}")


def by_title(text):
    """All poems whose title contains `text` (metadata only, small payload)."""
    return _get(f"title/{_q(text)}/{LIGHT}")


def by_lines(text):
    """All poems with a line containing `text` (metadata only)."""
    return _get(f"lines/{_q(text)}/{LIGHT}")


def poem(author, title):
    rows = _get(f"author,title/{_q(author)}:abs;{_q(title)}:abs/{FULL}")
    if not rows:
        rows = [p for p in _get(f"title/{_q(title)}:abs/{FULL}") if p.get("author") == author]
    return rows[0] if rows else None


def random(n=1):
    # The random endpoint must not be served from the cache.
    data = http_client.get_json(f"{BASE}/random/{int(n)}/{FULL}", ttl=0, timeout=20)
    return [_norm(p) for p in data or [] if isinstance(p, dict) and p.get("title")]


def source_url(author, title):
    return f"{BASE}/author,title/{_q(author)}:abs;{_q(title)}:abs"
