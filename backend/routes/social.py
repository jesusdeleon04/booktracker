"""
Tertulia API: profiles, people search, friendships, blocks, notifications and
"obsequios" (books and poems shared with friends).

All routes require a signed-in account (multi-user mode). Authorization is done
here, on the server, for every request: friendship, blocks and ownership are
checked against the database — never trusted from the client.
"""
import re
import secrets
from datetime import datetime

from flask import Blueprint, Response, request
from sqlalchemy import func, or_

from models import Book, ReaderProfile, User, db
from services import social as S
from services.http_client import SourceUnavailable
from services.serializers import iso
from social_models import FriendLink, Notification, SharedBook, SharedPoem, SocialLookup, SocialProfile, UserBlock

from .common import fail, ok

bp = Blueprint("social", __name__, url_prefix="/api/social")

REACTIONS = {
    "gracias": "Gracias",
    "me_encanta": "Me encanta la idea",
    "lo_leere": "Lo leeré pronto",
    "ya_lo_lei": "Ya lo había leído",
    "conmovido": "Me ha conmovido",
}
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$")
MAX_AVATAR = 3 * 1024 * 1024


# ── helpers ────────────────────────────────────────────────────────────────


def _payload():
    return request.get_json(silent=True) or {}


def _int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _page():
    return max(0, _int(request.args.get("offset"), 0)), min(50, max(1, _int(request.args.get("limit"), 20)))


def people(ids):
    """Small cards (id, @usuario, name, avatar) for many users in a few queries."""
    ids = {i for i in ids if i}
    if not ids:
        return {}
    users = {u.id: u for u in User.query.filter(User.id.in_(ids)).all()}
    profiles = {p.user_id: p for p in SocialProfile.query.filter(SocialProfile.user_id.in_(ids)).all()}
    readers = {r.user_id: r for r in ReaderProfile.query.filter(ReaderProfile.user_id.in_(ids)).all()}
    out = {}
    for uid, u in users.items():
        p = profiles.get(uid)
        out[uid] = {
            "id": uid,
            "username": p.username if p else None,
            "name": S.display_name(u, p, readers.get(uid) or False),
            "avatar": S.avatar_url(p),
        }
    return out


GONE = {"id": None, "username": None, "name": "Cuenta eliminada", "avatar": None}


def _my_profile(user, profile):
    reader = ReaderProfile.query.filter_by(user_id=user.id).first()
    return {
        "id": user.id,
        "username": profile.username,
        "displayName": (reader.display_name if reader else "") or "",
        "name": S.display_name(user, profile, reader or False),
        "googleName": profile.google_name,
        "googleAvatar": profile.google_avatar_url,
        "avatarMode": profile.avatar_mode,
        "hasCustomAvatar": bool(profile.avatar_data),
        "avatar": S.avatar_url(profile),
        "bio": profile.bio or "",
        "email": user.email,  # only ever returned to its owner
        "favoriteBooks": profile.favorite_books or [],
        "genres": (reader.genres if reader else []) or [],
        "authors": [a.get("name") for a in ((reader.favorite_authors if reader else []) or []) if isinstance(a, dict)],
        "privacy": {
            "discoverable": profile.discoverable,
            "emailLookup": profile.email_lookup,
            "showGenres": profile.show_genres,
            "showAuthors": profile.show_authors,
            "showBooks": profile.show_books,
            "showReading": profile.show_reading,
        },
    }


# ── my profile ────────────────────────────────────────────────────────────


@bp.get("/me")
def get_me():
    user = S.require_social()
    return ok(_my_profile(user, S.ensure_profile(user)))


@bp.patch("/me")
def update_me():
    user = S.require_social()
    profile = S.ensure_profile(user)
    data = _payload()
    if "username" in data:
        name = S.valid_username(data.get("username"))
        if not name:
            return fail("El nombre de usuario debe tener entre 3 y 24 caracteres: letras, números, «_» o «.».")
        taken = SocialProfile.query.filter(SocialProfile.username == name, SocialProfile.user_id != user.id).first()
        if taken:
            return fail("Ese nombre de usuario ya está en uso.", 409)
        profile.username = name
    if "displayName" in data:
        reader = ReaderProfile.query.filter_by(user_id=user.id).first()
        if reader:
            reader.display_name = (data.get("displayName") or "").strip()[:80] or None
    if "bio" in data:
        profile.bio = (data.get("bio") or "").strip()[:400] or None
    if "avatarMode" in data:
        mode = data.get("avatarMode")
        if mode not in ("google", "custom", "none") or (mode == "custom" and not profile.avatar_data):
            return fail("Modo de avatar no válido.")
        profile.avatar_mode = mode
    if "favoriteBookIds" in data:
        ids = [i for i in (data.get("favoriteBookIds") or []) if isinstance(i, int)][:8]
        books = {b.id: b for b in Book.query.filter(Book.user_id == user.id, Book.id.in_(ids)).all()} if ids else {}
        profile.favorite_books = [
            {"bookId": b.id, "title": b.title, "authors": (b.authors or [])[:2], "coverUrl": b.cover_url, "year": b.year}
            for b in (books.get(i) for i in ids) if b
        ]
    privacy = data.get("privacy") or {}
    for key, attr in (("discoverable", "discoverable"), ("emailLookup", "email_lookup")):
        if key in privacy:
            setattr(profile, attr, bool(privacy[key]))
    for key, attr in (("showGenres", "show_genres"), ("showAuthors", "show_authors"),
                      ("showBooks", "show_books"), ("showReading", "show_reading")):
        if key in privacy:
            if privacy[key] not in S.VISIBILITY:
                return fail("Valor de privacidad no válido.")
            setattr(profile, attr, privacy[key])
    db.session.commit()
    return ok(_my_profile(user, profile))


@bp.post("/me/avatar")
def upload_avatar():
    from .studio import _sniff

    user = S.require_social()
    profile = S.ensure_profile(user)
    file = request.files.get("file")
    if not file:
        return fail("No se recibió ninguna imagen.")
    blob = file.read(MAX_AVATAR + 1)
    if len(blob) > MAX_AVATAR:
        return fail("La imagen es demasiado grande (máximo 3 MB).", 413)
    mime, _ = _sniff(blob[:16])
    if not mime:
        return fail("Formato no compatible. Usa JPG, PNG, WebP o GIF.", 415)
    profile.avatar_data, profile.avatar_mime = blob, mime
    profile.avatar_token = secrets.token_hex(16)  # a new URL: old cached copies stop being used
    profile.avatar_mode = "custom"
    db.session.commit()
    return ok(_my_profile(user, profile))


@bp.delete("/me/avatar")
def delete_avatar():
    user = S.require_social()
    profile = S.ensure_profile(user)
    profile.avatar_data = profile.avatar_mime = profile.avatar_token = None
    profile.avatar_mode = "google"
    db.session.commit()
    return ok(_my_profile(user, profile))


@bp.get("/avatar/<token>")
def avatar(token):
    # Avatars are part of the public card (like a Google profile photo): served
    # by an unguessable URL so <img> can show them without a login header.
    profile = SocialProfile.query.filter_by(avatar_token=token).first() if len(token) == 32 else None
    if not profile or not profile.avatar_data or profile.avatar_mode != "custom":
        return fail("Imagen no encontrada.", 404)
    resp = Response(bytes(profile.avatar_data), mimetype=profile.avatar_mime)
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


# ── summary & notifications ───────────────────────────────────────────────


@bp.get("/summary")
def summary():
    from social_models import LetterRecipient

    user = S.require_social()
    profile = S.ensure_profile(user)
    hidden = S.hidden_ids(user.id)
    unread = Notification.query.filter(Notification.user_id == user.id, Notification.read_at.is_(None))
    if hidden:
        unread = unread.filter(or_(Notification.actor_id.is_(None), Notification.actor_id.notin_(hidden)))
    letters = LetterRecipient.query.filter_by(recipient_id=user.id, read_at=None, hidden_at=None).count()
    requests_in = FriendLink.query.filter(
        FriendLink.status == "pending", FriendLink.requested_by != user.id,
        or_(FriendLink.user_low == user.id, FriendLink.user_high == user.id),
    ).count()
    return ok({"username": profile.username, "notifications": unread.count(), "letters": letters,
               "requests": requests_in})


@bp.get("/notifications")
def notifications():
    user = S.require_social()
    offset, limit = _page()
    hidden = S.hidden_ids(user.id)
    q = Notification.query.filter(Notification.user_id == user.id)
    if hidden:
        q = q.filter(or_(Notification.actor_id.is_(None), Notification.actor_id.notin_(hidden)))
    rows = q.order_by(Notification.created_at.desc(), Notification.id.desc()).offset(offset).limit(limit + 1).all()
    more = len(rows) > limit
    rows = rows[:limit]
    cards = people(r.actor_id for r in rows)
    return ok({
        "items": [{"id": r.id, "kind": r.kind, "refId": r.ref_id, "createdAt": iso(r.created_at),
                   "read": r.read_at is not None, "actor": cards.get(r.actor_id, GONE)} for r in rows],
        "next": offset + limit if more else None,
    })


@bp.post("/notifications/read")
def mark_read():
    user = S.require_social()
    data = _payload()
    q = Notification.query.filter(Notification.user_id == user.id, Notification.read_at.is_(None))
    if not data.get("all"):
        ids = [i for i in (data.get("ids") or []) if isinstance(i, int)][:200]
        if not ids:
            return ok({"updated": 0})
        q = q.filter(Notification.id.in_(ids))
    n = q.update({"read_at": datetime.utcnow()}, synchronize_session=False)
    db.session.commit()
    return ok({"updated": n})


# ── finding people ────────────────────────────────────────────────────────


@bp.get("/search")
def search():
    user = S.require_social()
    S.ensure_profile(user)
    q = (request.args.get("q") or "").strip().lstrip("@").lower()
    if len(q) < 2:
        return ok([])
    esc = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    hidden = S.hidden_ids(user.id) | {user.id}
    rows = (
        db.session.query(SocialProfile, User)
        .join(User, User.id == SocialProfile.user_id)
        .outerjoin(ReaderProfile, ReaderProfile.user_id == SocialProfile.user_id)
        .filter(SocialProfile.discoverable.is_(True), SocialProfile.user_id.notin_(hidden))
        .filter(or_(
            SocialProfile.username.like(f"{esc}%", escape="\\"),
            func.lower(ReaderProfile.display_name).like(f"%{esc}%", escape="\\"),
            func.lower(SocialProfile.google_name).like(f"%{esc}%", escape="\\"),
        ))
        .order_by(SocialProfile.username)
        .limit(20)
        .all()
    )
    return ok([S.person_card(user, u, p) for p, u in rows])


@bp.post("/lookup")
def lookup_email():
    """Exact e-mail lookup. Rate-limited, and every failure looks the same so it
    can't be used to learn which addresses have an account."""
    user = S.require_social()
    email = (_payload().get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        return fail("Escribe un correo completo, por ejemplo nombre@dominio.com.")
    base = SocialLookup.query.filter_by(user_id=user.id)
    S.rate_limit(base, SocialLookup.created_at, "email_lookup_hour")
    S.rate_limit(base, SocialLookup.created_at, "email_lookup_day")
    db.session.add(SocialLookup(user_id=user.id))
    db.session.commit()
    other = User.query.filter(func.lower(User.email) == email).first()
    profile = db.session.get(SocialProfile, other.id) if other else None
    if (not other or other.id == user.id or not profile or not profile.email_lookup
            or S.blocked_between(user.id, other.id)):
        return fail("No encontramos a nadie que permita que lo encuentren con ese correo.", 404)
    return ok(S.person_card(user, other, profile))


@bp.get("/people/<username>")
def person(username):
    user = S.require_social()
    S.ensure_profile(user)
    profile = SocialProfile.query.filter_by(username=(username or "").lower().lstrip("@")).first()
    other = db.session.get(User, profile.user_id) if profile else None
    if not other or not S.can_view_profile(user, other):
        return fail("Este perfil no existe o no es visible.", 404)
    return ok(S.full_profile(user, other))


# ── friendships ───────────────────────────────────────────────────────────


@bp.get("/friends")
def friends():
    user = S.require_social()
    ids = S.friend_ids(user.id) - S.hidden_ids(user.id)
    links = {}
    if ids:
        for link in FriendLink.query.filter(FriendLink.status == "accepted",
                                            or_(FriendLink.user_low == user.id, FriendLink.user_high == user.id)):
            links[link.user_high if link.user_low == user.id else link.user_low] = link
    cards = sorted(people(ids).values(), key=lambda c: S._fold(c["name"]))
    for c in cards:
        link = links.get(c["id"])
        c["since"] = iso(link.responded_at) if link else None
    if request.args.get("all") == "1":
        return ok({"items": cards, "next": None})
    offset, limit = _page()
    return ok({"items": cards[offset:offset + limit], "next": offset + limit if offset + limit < len(cards) else None,
               "total": len(cards)})


@bp.get("/requests")
def list_requests():
    user = S.require_social()
    hidden = S.hidden_ids(user.id)
    rows = FriendLink.query.filter(FriendLink.status.in_(("pending", "declined")),
                                   or_(FriendLink.user_low == user.id, FriendLink.user_high == user.id)).all()
    received, sent = [], []
    for r in rows:
        other = r.user_high if r.user_low == user.id else r.user_low
        if other in hidden:
            continue
        if r.requested_by == user.id:
            # A declined request still looks pending to whoever sent it: nobody is told "no".
            sent.append((r, other))
        elif r.status == "pending":
            received.append((r, other))
    cards = people([o for _, o in received + sent])
    shape = lambda pairs: [{"id": r.id, "createdAt": iso(r.created_at), "person": cards.get(o, GONE)}
                           for r, o in sorted(pairs, key=lambda x: x[0].created_at or datetime.min, reverse=True)]
    return ok({"received": shape(received), "sent": shape(sent)})


@bp.post("/requests")
def send_request():
    user = S.require_social()
    S.ensure_profile(user)
    other_id = _int(_payload().get("userId"))
    if other_id == user.id:
        return fail("No puedes enviarte una solicitud a ti mismo.")
    other = db.session.get(User, other_id) if other_id else None
    if other is None or (S.blocked_between(user.id, other.id) and not S.i_blocked(user.id, other.id)):
        return fail("Esta persona no está disponible.", 404)
    if S.i_blocked(user.id, other.id):
        return fail("Has bloqueado a esta persona. Desbloquéala antes de enviarle una solicitud.", 409)
    profile = S.ensure_profile(other)
    link = S.link_between(user.id, other.id)
    if not (profile.discoverable or profile.email_lookup or link):
        return fail("Esta persona no está disponible.", 404)
    if link and link.status == "accepted":
        return fail("Ya sois amigos.", 409)
    if link and link.requested_by == user.id:
        return ok({"status": "pending", "requestId": link.id})  # idempotent (also when it was declined)
    if link and link.status == "pending":
        # They had already asked me: my request is an acceptance.
        link.status, link.responded_at = "accepted", datetime.utcnow()
        S.notify(other.id, "friend_accept", user.id, link.id)
        db.session.commit()
        return ok({"status": "accepted", "requestId": link.id})
    S.rate_limit(FriendLink.query.filter_by(requested_by=user.id), FriendLink.created_at, "friend_request")
    lo, hi = S.pair(user.id, other.id)
    if link:  # I had declined them before; now I'm the one asking
        link.requested_by, link.status, link.created_at, link.responded_at = user.id, "pending", datetime.utcnow(), None
    else:
        link = FriendLink(user_low=lo, user_high=hi, requested_by=user.id, status="pending")
        db.session.add(link)
    db.session.flush()
    S.notify(other.id, "friend_request", user.id, link.id)
    db.session.commit()
    return ok({"status": "pending", "requestId": link.id}, 201)


def _incoming(link_id, user):
    link = db.session.get(FriendLink, link_id)
    if (not link or link.status != "pending" or link.requested_by == user.id
            or user.id not in (link.user_low, link.user_high)):
        return None
    return link


@bp.post("/requests/<int:link_id>/accept")
def accept_request(link_id):
    user = S.require_social()
    link = _incoming(link_id, user)
    if not link:
        return fail("Esta solicitud ya no está pendiente.", 404)
    if S.blocked_between(link.user_low, link.user_high):
        return fail("Esta persona no está disponible.", 404)
    link.status, link.responded_at = "accepted", datetime.utcnow()
    S.notify(link.requested_by, "friend_accept", user.id, link.id)
    Notification.query.filter_by(user_id=user.id, kind="friend_request", ref_id=link.id, read_at=None).update(
        {"read_at": datetime.utcnow()}, synchronize_session=False)
    db.session.commit()
    return ok({"status": "accepted"})


@bp.post("/requests/<int:link_id>/decline")
def decline_request(link_id):
    user = S.require_social()
    link = _incoming(link_id, user)
    if not link:
        return fail("Esta solicitud ya no está pendiente.", 404)
    link.status, link.responded_at = "declined", datetime.utcnow()
    Notification.query.filter_by(user_id=user.id, kind="friend_request", ref_id=link.id, read_at=None).update(
        {"read_at": datetime.utcnow()}, synchronize_session=False)
    db.session.commit()
    return ok({"status": "declined"})


@bp.delete("/requests/<int:link_id>")
def cancel_request(link_id):
    user = S.require_social()
    link = db.session.get(FriendLink, link_id)
    if not link or link.requested_by != user.id or link.status == "accepted":
        return fail("No hay ninguna solicitud tuya pendiente con ese número.", 404)
    other = link.user_high if link.user_low == user.id else link.user_low
    Notification.query.filter_by(user_id=other, kind="friend_request", ref_id=link.id).delete(synchronize_session=False)
    db.session.delete(link)
    db.session.commit()
    return ok({"cancelled": True})


@bp.delete("/friends/<int:other_id>")
def remove_friend(other_id):
    user = S.require_social()
    link = S.link_between(user.id, other_id)
    if not link or link.status != "accepted":
        return fail("No sois amigos.", 404)
    db.session.delete(link)  # shares stop being readable; letters already delivered stay with their owners
    db.session.commit()
    return ok({"removed": True})


# ── blocks ────────────────────────────────────────────────────────────────


@bp.get("/blocks")
def list_blocks():
    user = S.require_social()
    rows = UserBlock.query.filter_by(blocker_id=user.id).order_by(UserBlock.created_at.desc()).all()
    cards = people(r.blocked_id for r in rows)
    return ok([{**cards.get(r.blocked_id, GONE), "since": iso(r.created_at)} for r in rows])


@bp.post("/blocks")
def block():
    user = S.require_social()
    other_id = _int(_payload().get("userId"))
    if not other_id or other_id == user.id or not db.session.get(User, other_id):
        return fail("No se puede bloquear a esa cuenta.")
    if not S.i_blocked(user.id, other_id):
        db.session.add(UserBlock(blocker_id=user.id, blocked_id=other_id))
    link = S.link_between(user.id, other_id)
    if link:
        db.session.delete(link)  # ends the friendship and any pending request
    db.session.commit()
    return ok({"blocked": True})


@bp.delete("/blocks/<int:other_id>")
def unblock(other_id):
    user = S.require_social()
    UserBlock.query.filter_by(blocker_id=user.id, blocked_id=other_id).delete(synchronize_session=False)
    db.session.commit()
    return ok({"blocked": False})


# ── obsequios: books and poems ────────────────────────────────────────────


def _recipients(user, raw, maximum=20):
    ids = []
    for value in raw or []:
        i = _int(value)
        if i and i not in ids:
            ids.append(i)
    if not ids:
        from flask import abort

        abort(400, description="Elige al menos un amigo.")
    if len(ids) > maximum:
        from flask import abort

        abort(400, description=f"Puedes elegir hasta {maximum} amigos a la vez.")
    return [S.require_friend(user, i) for i in ids]


def _client_key(data):
    key = str(data.get("clientKey") or "").strip()[:64]
    return key or secrets.token_hex(16)


def _note(data):
    return (data.get("note") or "").strip()[:1000] or None


@bp.post("/books")
def share_book():
    user = S.require_social()
    data = _payload()
    book = Book.query.filter_by(id=_int(data.get("bookId")), user_id=user.id).first()
    if not book:
        return fail("Ese libro no está en tu biblioteca.", 404)
    targets = _recipients(user, data.get("recipients"))
    key = _client_key(data)
    S.rate_limit(SharedBook.query.filter_by(sender_id=user.id), SharedBook.created_at, "share", len(targets))
    ids = []
    for target in targets:
        row = SharedBook.query.filter_by(sender_id=user.id, recipient_id=target.id, client_key=key).first()
        if row is None:
            row = SharedBook(
                sender_id=user.id, recipient_id=target.id, client_key=key, title=book.title, subtitle=book.subtitle,
                authors=book.authors or [], description=book.description, cover_url=book.cover_url, year=book.year,
                publisher=book.publisher, page_count=book.page_count, isbn13=book.isbn13, language=book.language,
                categories=book.categories or [], genres=book.genres or [], ol_work_key=book.ol_work_key,
                google_id=book.google_id,
                catalog_id=(f"ol:{book.ol_work_key}" if book.ol_work_key else (f"gb:{book.google_id}" if book.google_id else None)),
                sender_rating=book.rating if data.get("includeRating", True) else None, note=_note(data),
            )
            db.session.add(row)
            db.session.flush()
            S.notify(target.id, "book", user.id, row.id)
        ids.append(row.id)
    db.session.commit()
    return ok({"ids": ids, "count": len(ids)}, 201)


@bp.post("/poems")
def share_poem():
    from services.poetry import catalog

    user = S.require_social()
    data = _payload()
    pid = str(data.get("poemId") or "")[:700]
    targets = _recipients(user, data.get("recipients"))
    key = _client_key(data)
    S.rate_limit(SharedPoem.query.filter_by(sender_id=user.id), SharedPoem.created_at, "share", len(targets))
    # The server looks the poem up itself: the rights decision (and whether any
    # text is stored) never depends on what the browser sends.
    try:
        rec = catalog.get_poem(pid, "intl")
    except catalog.NotFound as exc:
        return fail(str(exc) or "Ese poema no existe.", 404)
    except SourceUnavailable:
        return fail("No podemos comprobar ese poema ahora mismo (la fuente no responde). Inténtalo en un momento.", 503)
    rights = rec.get("rights") or {}
    free = rights.get("status") in ("public_domain", "open_license")
    text = "\n".join(rec["lines"]) if (free and rights.get("universal") and rec.get("lines")) else None
    author = rec.get("author") or {}
    ids = []
    for target in targets:
        row = SharedPoem.query.filter_by(sender_id=user.id, recipient_id=target.id, client_key=key).first()
        if row is None:
            row = SharedPoem(
                sender_id=user.id, recipient_id=target.id, client_key=key, poem_id=pid, title=rec["title"][:500],
                alt_title=(rec.get("altTitle") or rec.get("subtitle") or None), author_name=author.get("name"),
                author_qid=author.get("qid"), author_birth=author.get("birthYear"), author_death=author.get("deathYear"),
                translator_name=(rec.get("translator") or {}).get("name"), language=rec.get("lang"),
                collection=(rec.get("collection") or None), year=rec.get("year"),
                source_name=(rec.get("source") or {}).get("name"), source_url=(rec.get("source") or {}).get("pageUrl"),
                rights_status=rights.get("status") or "unknown", rights_label=rights.get("label"),
                attribution=rec.get("attribution"), linecount=rec.get("linecount"), text=text, note=_note(data),
            )
            db.session.add(row)
            db.session.flush()
            S.notify(target.id, "poem", user.id, row.id)
        ids.append(row.id)
    db.session.commit()
    return ok({"ids": ids, "count": len(ids), "textShared": text is not None}, 201)


MODELS = {"book": SharedBook, "poem": SharedPoem}


def _share_json(row, kind, me_id, cards, full=False):
    received = row.recipient_id == me_id
    other = row.sender_id if received else row.recipient_id
    base = {
        "kind": kind, "id": row.id, "direction": "received" if received else "sent",
        "person": cards.get(other, GONE), "note": row.note or "", "createdAt": iso(row.created_at),
        "seen": row.seen_at is not None, "reaction": row.reaction, "reactionLabel": REACTIONS.get(row.reaction),
        "reply": row.reply or "", "repliedAt": iso(row.replied_at),
    }
    if kind == "book":
        base.update({
            "book": {
                "id": row.catalog_id or f"share:{row.id}", "title": row.title, "subtitle": row.subtitle or "",
                "authors": row.authors or [], "coverUrl": row.cover_url or "", "year": row.year,
                "publisher": row.publisher or "", "pageCount": row.page_count, "isbn13": row.isbn13 or "",
                "language": row.language or "", "categories": row.categories or [], "genres": row.genres or [],
                "olWorkKey": row.ol_work_key, "googleId": row.google_id,
                "description": (row.description or "") if full else (row.description or "")[:280],
            },
            "senderRating": row.sender_rating,
            "savedBookId": row.saved_book_id,
        })
    else:
        base.update({
            "poem": {
                "id": row.poem_id, "title": row.title, "altTitle": row.alt_title,
                "author": {"name": row.author_name, "qid": row.author_qid, "birthYear": row.author_birth,
                           "deathYear": row.author_death} if row.author_name else None,
                "translator": row.translator_name, "lang": row.language, "collection": row.collection, "year": row.year,
                "source": {"name": row.source_name, "pageUrl": row.source_url},
                "rights": {"status": row.rights_status, "label": row.rights_label}, "attribution": row.attribution,
                "linecount": row.linecount,
                "lines": (row.text.split("\n") if row.text else None) if full else
                         (row.text.split("\n")[:6] if row.text else None),
                "textShared": row.text is not None,
            },
            "saved": row.saved_at is not None,
        })
    return base


def _readable(row, me_id):
    """Recipient: only while still friends and not blocked. Sender: always."""
    if row.sender_id == me_id:
        return row.sender_hidden_at is None
    if row.recipient_id != me_id or row.recipient_hidden_at is not None:
        return False
    return S.are_friends(me_id, row.sender_id) and not S.blocked_between(me_id, row.sender_id)


@bp.get("/shared")
def list_shared():
    user = S.require_social()
    box = request.args.get("box", "received")
    kinds = [request.args.get("kind")] if request.args.get("kind") in MODELS else list(MODELS)
    offset, limit = _page()
    friends = S.friend_ids(user.id) - S.hidden_ids(user.id)
    rows = []
    for kind in kinds:
        model = MODELS[kind]
        if box == "sent":
            q = model.query.filter(model.sender_id == user.id, model.sender_hidden_at.is_(None))
        else:
            if not friends:
                continue
            q = model.query.filter(model.recipient_id == user.id, model.recipient_hidden_at.is_(None),
                                   model.sender_id.in_(friends))
        rows += [(kind, r) for r in q.order_by(model.created_at.desc()).limit(offset + limit + 1).all()]
    rows.sort(key=lambda kr: kr[1].created_at or datetime.min, reverse=True)
    page = rows[offset:offset + limit]
    cards = people({r.sender_id for _, r in page} | {r.recipient_id for _, r in page})
    unseen = 0
    if box != "sent" and friends:
        for model in MODELS.values():
            unseen += model.query.filter(model.recipient_id == user.id, model.recipient_hidden_at.is_(None),
                                         model.seen_at.is_(None), model.sender_id.in_(friends)).count()
    return ok({"items": [_share_json(r, k, user.id, cards) for k, r in page],
               "next": offset + limit if len(rows) > offset + limit else None, "unseen": unseen})


def _get_share(kind, share_id, user):
    model = MODELS.get(kind)
    row = db.session.get(model, share_id) if model else None
    if not row or not _readable(row, user.id):
        return None
    return row


@bp.get("/shared/<kind>/<int:share_id>")
def get_shared(kind, share_id):
    user = S.require_social()
    row = _get_share(kind, share_id, user)
    if not row:
        return fail("Este obsequio no existe o ya no está disponible.", 404)
    if row.recipient_id == user.id and row.seen_at is None:
        row.seen_at = datetime.utcnow()
        Notification.query.filter_by(user_id=user.id, kind=kind, ref_id=row.id, read_at=None).update(
            {"read_at": datetime.utcnow()}, synchronize_session=False)
        db.session.commit()
    cards = people([row.sender_id, row.recipient_id])
    return ok(_share_json(row, kind, user.id, cards, full=True))


@bp.post("/shared/<kind>/<int:share_id>/react")
def react(kind, share_id):
    user = S.require_social()
    row = _get_share(kind, share_id, user)
    if not row or row.recipient_id != user.id:
        return fail("Solo quien recibe un obsequio puede responder.", 404)
    data = _payload()
    reaction = data.get("reaction")
    if reaction is not None and reaction not in REACTIONS:
        return fail("Reacción no válida.")
    reply = (data.get("reply") or "").strip()[:500] if "reply" in data else row.reply
    first = row.reaction is None and not row.reply
    row.reaction = reaction if "reaction" in data else row.reaction
    row.reply = reply or None
    row.replied_at = datetime.utcnow()
    if first and (row.reaction or row.reply):
        S.notify(row.sender_id, f"{kind}_reply", user.id, row.id)
    db.session.commit()
    return ok(_share_json(row, kind, user.id, people([row.sender_id, row.recipient_id]), full=True))


@bp.post("/shared/<kind>/<int:share_id>/saved")
def mark_saved(kind, share_id):
    user = S.require_social()
    row = _get_share(kind, share_id, user)
    if not row or row.recipient_id != user.id:
        return fail("Este obsequio no existe o ya no está disponible.", 404)
    if kind == "book":
        book = Book.query.filter_by(id=_int(_payload().get("bookId")), user_id=user.id).first()
        if not book:
            return fail("Ese libro no está en tu biblioteca.", 404)
        row.saved_book_id = book.id
    else:
        row.saved_at = datetime.utcnow()
    db.session.commit()
    return ok({"saved": True})


@bp.post("/shared/<kind>/<int:share_id>/hide")
def hide_shared(kind, share_id):
    """Each person removes it from *their* view only; when both did, it's deleted."""
    user = S.require_social()
    model = MODELS.get(kind)
    row = db.session.get(model, share_id) if model else None
    if not row or user.id not in (row.sender_id, row.recipient_id):
        return fail("Este obsequio no existe.", 404)
    if row.sender_id == user.id:
        row.sender_hidden_at = datetime.utcnow()
    if row.recipient_id == user.id:
        row.recipient_hidden_at = datetime.utcnow()
    if row.sender_hidden_at and row.recipient_hidden_at:
        db.session.delete(row)
    db.session.commit()
    return ok({"hidden": True})
