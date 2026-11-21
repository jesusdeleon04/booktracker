"""
Supabase session validation.

The browser signs in with Supabase (Google or email) and sends its access token
as `Authorization: Bearer ...`. We ask Supabase's Auth server who the token
belongs to (so key rotation and revocation just work) and cache the answer for a
few minutes. No secret is needed: only the public project URL and publishable key.
"""
import hashlib
import threading
import time

import requests

import config

_TTL = 300
_cache = {}
_lock = threading.Lock()


def _prune(now):
    for k in [k for k, (_, exp) in _cache.items() if exp < now]:
        _cache.pop(k, None)


def verify(token):
    """Return {"uid", "email", "name"} for a valid access token, else None."""
    if not token or len(token) > 4096:
        return None
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and hit[1] > now:
            return hit[0]
    try:
        res = requests.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": config.SUPABASE_PUBLISHABLE_KEY},
            timeout=8,
        )
    except requests.RequestException:
        raise AuthUnavailable()
    if res.status_code in (401, 403):
        return None
    if res.status_code != 200:
        raise AuthUnavailable()
    data = res.json()
    uid = data.get("id")
    if not uid:
        return None
    meta = data.get("user_metadata") or {}
    info = {
        "uid": uid,
        "email": data.get("email"),
        "name": meta.get("full_name") or meta.get("name"),
        "picture": meta.get("avatar_url") or meta.get("picture"),
    }
    with _lock:
        if len(_cache) > 500:
            _prune(now)
        _cache[key] = (info, now + _TTL)
    return info


class AuthUnavailable(Exception):
    pass
