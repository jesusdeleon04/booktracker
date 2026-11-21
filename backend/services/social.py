"""
Tertulia: who can see whom, and what.

Every social route goes through these helpers, so the rules live in one place:

* Friendship is reciprocal: a `FriendLink` with status "accepted".
* A block hides both people from each other (search, profiles, requests,
  shares); the blocked person is never told.
* Book and poem shares are readable by the recipient only while the friendship
  lasts; the sender always keeps their record.
* Letters already delivered stay with their recipients (they are their
  correspondence), and are only ever readable by the sender and the recipient
  each copy belongs to.
"""
import re
import secrets
import unicodedata
from datetime import datetime, timedelta

from flask import abort, g
from sqlalchemy import and_, or_

import config
from models import Book, ReaderProfile, User, db
from services.users import current_user
from social_models import FriendLink, Notification, SocialProfile, UserBlock

VISIBILITY = ("everyone", "friends", "nobody")
USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9_.]{1,22})[a-z0-9]$")
RESERVED = {"admin", "booktracker", "soporte", "support", "tertulia", "root", "sistema", "system", "anonimo",
            "moderador", "staff", "api", "null", "undefined"}

LIMITS = {
    "friend_request": (40, timedelta(days=1)),
    "share": (120, timedelta(days=1)),
    "letter": (60, timedelta(days=1)),
    "email_lookup_hour": (10, timedelta(hours=1)),
    "email_lookup_day": (30, timedelta(days=1)),
}


def require_social():
    """Tertulia needs real accounts: it is off in single-user local mode."""
    if not config.AUTH_REQUIRED:
        abort(403, description="La Tertulia necesita cuentas: activa el modo multiusuario (BOOKTRACKER_AUTH=supabase).")
    return current_user()


def now():
    return datetime.utcnow()


# ── usernames & profiles ──────────────────────────────────────────────────


def _slug(text):
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text[:18]


def valid_username(name):
    name = (name or "").strip().lower().lstrip("@")
    if not USERNAME_RE.match(name) or ".." in name or name in RESERVED:
        return None
    return name


def _unique_username(base):
    base = base if len(base) >= 3 else (base + "lector")[:18]
    candidate = base
    for _ in range(12):
        if valid_username(candidate) and not SocialProfile.query.filter_by(username=candidate).first():
            return candidate
        candidate = f"{base[:16]}{secrets.randbelow(9000) + 1000}"
    return f"lector{secrets.token_hex(4)}"


def ensure_profile(user):
    """The social card of `user`, created on first use. Google's name and
    picture are refreshed in their own columns and never overwrite the user's
    own choices (display name lives in reader_profiles, avatar mode, bio)."""
    profile = db.session.get(SocialProfile, user.id)
    info = getattr(g, "_bt_auth", None) or {}
    if profile is None:
        reader = ReaderProfile.query.filter_by(user_id=user.id).first()
        seed = info.get("name") or (reader.display_name if reader else "") or (user.email or "").split("@")[0]
        profile = SocialProfile(user_id=user.id, username=_unique_username(_slug(seed)),
                                google_name=(info.get("name") or "")[:120] or None,
                                google_avatar_url=info.get("picture"), favorite_books=[])
        db.session.add(profile)
        db.session.commit()
    elif info and g.get("_bt_user") is user:
        changed = False
        if info.get("name") and profile.google_name != info["name"][:120]:
            profile.google_name, changed = info["name"][:120], True
        if info.get("picture") and profile.google_avatar_url != info["picture"]:
            profile.google_avatar_url, changed = info["picture"], True
        if changed:
            db.session.commit()
    return profile


def display_name(user, profile=None, reader=None):
    reader = reader if reader is not None else ReaderProfile.query.filter_by(user_id=user.id).first()
    profile = profile if profile is not None else db.session.get(SocialProfile, user.id)
    return ((reader.display_name if reader else None) or (profile.google_name if profile else None)
            or (f"@{profile.username}" if profile else "Lector"))


def avatar_url(profile):
    if profile is None or profile.avatar_mode == "none":
        return None
    if profile.avatar_mode == "custom" and profile.avatar_token:
        return f"/api/social/avatar/{profile.avatar_token}"
    return profile.google_avatar_url


# ── relationships ─────────────────────────────────────────────────────────


def pair(a, b):
    return (a, b) if a < b else (b, a)


def link_between(a, b):
    lo, hi = pair(a, b)
    return FriendLink.query.filter_by(user_low=lo, user_high=hi).first()


def are_friends(a, b):
    link = link_between(a, b)
    return bool(link and link.status == "accepted")


def blocked_between(a, b):
    """True if either person blocked the other."""
    return UserBlock.query.filter(
        or_(and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
            and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a))
    ).first() is not None


def i_blocked(me, other):
    return UserBlock.query.filter_by(blocker_id=me, blocked_id=other).first() is not None


def hidden_ids(me):
    """People this user must not see at all (anyone who blocked them, anyone they blocked)."""
    rows = UserBlock.query.filter(or_(UserBlock.blocker_id == me, UserBlock.blocked_id == me)).all()
    return {r.blocked_id if r.blocker_id == me else r.blocker_id for r in rows}


def friend_ids(me):
    rows = FriendLink.query.filter(FriendLink.status == "accepted",
                                   or_(FriendLink.user_low == me, FriendLink.user_high == me)).all()
    return {r.user_high if r.user_low == me else r.user_low for r in rows}


def relationship(me, other):
    """self | friends | pending_out | pending_in | none | blocked (I blocked them)."""
    if me == other:
        return "self", None
    if i_blocked(me, other):
        return "blocked", None
    link = link_between(me, other)
    if not link or link.status == "declined":
        return "none", link
    if link.status == "accepted":
        return "friends", link
    return ("pending_out" if link.requested_by == me else "pending_in"), link


def require_friend(me, other_id):
    """Abort unless `other_id` is an existing, unblocked friend of `me`."""
    other = db.session.get(User, other_id) if isinstance(other_id, int) else None
    if other is None or blocked_between(me.id, other.id) or not are_friends(me.id, other.id):
        abort(403, description="Solo puedes compartir con amigos que te hayan aceptado.")
    return other


# ── cards ─────────────────────────────────────────────────────────────────


def _visible(level, is_friend, is_self):
    return is_self or level == "everyone" or (level == "friends" and is_friend)


def _fold(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def affinity(me_id, other_id, other_profile, is_friend):
    """A few shared literary interests, only from what `other` lets `me` see."""
    mine = ReaderProfile.query.filter_by(user_id=me_id).first()
    theirs = ReaderProfile.query.filter_by(user_id=other_id).first()
    if not mine or not theirs or not other_profile:
        return []
    out = []
    if _visible(other_profile.show_genres, is_friend, False):
        from services.taxonomy import genre_label

        common = [g for g in (theirs.genres or []) if g in set(mine.genres or [])]
        out += [genre_label(g) for g in common[:3]]
    if _visible(other_profile.show_authors, is_friend, False):
        names = {_fold(a.get("name")) for a in (mine.favorite_authors or []) if isinstance(a, dict)}
        out += [a["name"] for a in (theirs.favorite_authors or [])
                if isinstance(a, dict) and a.get("name") and _fold(a["name"]) in names][:2]
    return out[:4]


def person_card(me, user, profile=None, rel=None):
    """What `me` may see of `user` in lists and search results (never the e-mail)."""
    profile = profile or ensure_profile(user)
    rel = rel or relationship(me.id, user.id)[0]
    return {
        "id": user.id,
        "username": profile.username,
        "name": display_name(user, profile),
        "avatar": avatar_url(profile),
        "bio": profile.bio or "",
        "relationship": rel,
        "affinity": affinity(me.id, user.id, profile, rel == "friends") if rel != "self" else [],
    }


def full_profile(me, user):
    """Public view of a profile, filtered by its privacy settings."""
    profile = ensure_profile(user)
    rel, link = relationship(me.id, user.id)
    is_self = rel == "self"
    is_friend = rel == "friends"
    reader = ReaderProfile.query.filter_by(user_id=user.id).first()
    card = person_card(me, user, profile, rel)
    card["friendsSince"] = link.responded_at.isoformat() + "Z" if (is_friend and link and link.responded_at) else None
    card["requestId"] = link.id if rel in ("pending_in", "pending_out") and link else None
    if _visible(profile.show_genres, is_friend, is_self) and reader:
        from services.taxonomy import genre_label

        card["genres"] = [{"key": g, "label": genre_label(g)} for g in (reader.genres or [])][:12]
    if _visible(profile.show_authors, is_friend, is_self) and reader:
        card["authors"] = [a.get("name") for a in (reader.favorite_authors or []) if isinstance(a, dict) and a.get("name")][:12]
    if _visible(profile.show_books, is_friend, is_self):
        card["favoriteBooks"] = (profile.favorite_books or [])[:8]
    if _visible(profile.show_reading, is_friend, is_self):
        reading = Book.query.filter_by(user_id=user.id, status="reading").order_by(Book.updated_at.desc()).limit(4).all()
        card["reading"] = [{"title": b.title, "authors": (b.authors or [])[:2], "coverUrl": b.cover_url} for b in reading]
    return card


def can_view_profile(me, user):
    """Profiles are visible to friends, to people with a pending request between
    them, and to everyone else only if the owner is discoverable. Blocks hide."""
    if me.id == user.id:
        return True
    if blocked_between(me.id, user.id) and not i_blocked(me.id, user.id):
        return False
    profile = ensure_profile(user)
    link = link_between(me.id, user.id)
    return profile.discoverable or (link is not None and link.status in ("accepted", "pending"))


# ── notifications & limits ────────────────────────────────────────────────


def notify(user_id, kind, actor_id=None, ref_id=None):
    db.session.add(Notification(user_id=user_id, kind=kind, actor_id=actor_id, ref_id=ref_id))


def rate_limit(query, column, key, adding=1):
    """Abort with 429 when the rows this user created within the window (plus the
    ones about to be added) exceed the limit."""
    limit, window = LIMITS[key]
    count = query.filter(column >= now() - window).count()
    if count + adding > limit:
        abort(429, description="Has hecho muchas operaciones seguidas. Vuelve a intentarlo más tarde.")
