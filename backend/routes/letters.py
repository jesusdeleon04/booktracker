"""
Correspondencia: typed letters written in the Writer's Studio.

* The draft is an ordinary (private) studio writing. Sending freezes a copy:
  subject, text, stationery, seal and cover. Nothing can edit a sent letter
  (no route does it, and in Postgres a trigger refuses it).
* Only the sender and each recipient can read a letter. With several
  recipients, each one only sees their own envelope — never the other names.
* Removing a letter only removes it from the remover's correspondence. When
  nobody keeps it any more, it is deleted.
* Letters already delivered stay with their recipients even if the friendship
  ends or the sender deletes the account.
"""
import secrets
from datetime import datetime

from flask import Blueprint, Response, abort, request
from models import StudioImage, Writing, db
from services import social as S
from services.serializers import iso
from social_models import Letter, LetterRecipient, Notification

from .common import fail, ok
from .social import GONE, _int, _page, _payload, people

bp = Blueprint("letters", __name__, url_prefix="/api/letters")

STATIONERY = ("marfil", "verjurado", "aerograma", "sepia", "noche")
SEALS = ("lacre", "azul", "verde", "oro")
MAX_CHARS = 200_000


def _word_count(text):
    return len([w for w in (text or "").split() if w.strip()])


def _excerpt(text, n=160):
    text = " ".join((text or "").split())
    return text[:n] + ("…" if len(text) > n else "")


def _mine_as_recipient(letter_id, user_id):
    return LetterRecipient.query.filter_by(letter_id=letter_id, recipient_id=user_id, hidden_at=None).first()


def _access(letter_id, user):
    """(letter, my_envelope) for the sender or a recipient; aborts with 404 otherwise
    (a direct URL to somebody else's letter looks exactly like a missing one)."""
    letter = db.session.get(Letter, letter_id)
    if not letter:
        abort(404, description="Esta carta no existe o no es para ti.")
    envelope = _mine_as_recipient(letter.id, user.id)
    is_sender = letter.sender_id == user.id and letter.sender_hidden_at is None
    if not envelope and not is_sender:
        abort(404, description="Esta carta no existe o no es para ti.")
    return letter, envelope


def _cover(letter):
    if not letter.cover_data:
        return None
    return {"url": f"/api/letters/{letter.id}/cover", "width": letter.cover_width, "height": letter.cover_height}


@bp.post("")
def send_letter():
    user = S.require_social()
    profile = S.ensure_profile(user)
    data = _payload()
    writing = Writing.query.filter_by(id=_int(data.get("writingId")), user_id=user.id).first()
    if not writing:
        return fail("Ese escrito no está en tu estudio.", 404)
    key = str(data.get("clientKey") or "").strip()[:64] or secrets.token_hex(16)
    existing = Letter.query.filter_by(sender_id=user.id, client_key=key).first()
    if existing:  # the same "send" twice (double click, retry): one letter
        return ok({"id": existing.id, "duplicate": True})
    content = data.get("content") if isinstance(data.get("content"), str) else writing.content or ""
    content = content.replace("\r\n", "\n")
    if not content.strip():
        return fail("La carta está en blanco: escribe algo antes de enviarla.")
    if len(content) > MAX_CHARS:
        return fail("La carta es demasiado larga para enviarla.")
    raw = data.get("recipients") or []
    ids = []
    for value in raw:
        i = _int(value)
        if i and i not in ids:
            ids.append(i)
    if not ids:
        return fail("Elige a quién enviar la carta.")
    if len(ids) > 10:
        return fail("Una carta puede llevar hasta 10 destinatarios.")
    targets = [S.require_friend(user, i) for i in ids]
    S.rate_limit(Letter.query.filter_by(sender_id=user.id), Letter.sent_at, "letter")

    stationery = data.get("stationery") if data.get("stationery") in STATIONERY else "marfil"
    seal = data.get("seal") if data.get("seal") in SEALS else "lacre"
    subject = (data.get("subject") if isinstance(data.get("subject"), str) else writing.title or "").strip()[:300]
    letter = Letter(
        sender_id=user.id, sender_name=S.display_name(user, profile)[:120], sender_username=profile.username,
        source_writing_id=writing.id, client_key=key, subject=subject, content=content,
        word_count=_word_count(content), stationery=stationery, seal=seal,
    )
    reply_to = _int(data.get("inReplyTo"))
    if reply_to:
        original = db.session.get(Letter, reply_to)
        if original and (original.sender_id == user.id or _mine_as_recipient(original.id, user.id)):
            letter.in_reply_to_id = original.id
    if writing.cover_image_id:
        from .studio import _image_bytes

        img = StudioImage.query.filter_by(id=writing.cover_image_id, user_id=user.id).first()
        blob = _image_bytes(img) if img else None
        if blob:
            letter.cover_data, letter.cover_mime = blob, img.mime
            letter.cover_width, letter.cover_height = img.width, img.height
    db.session.add(letter)
    db.session.flush()
    for target in targets:
        db.session.add(LetterRecipient(letter_id=letter.id, recipient_id=target.id,
                                       recipient_name=S.display_name(target)[:120]))
        S.notify(target.id, "letter", user.id, letter.id)
    db.session.commit()
    return ok({"id": letter.id, "recipients": len(targets)}, 201)


@bp.get("")
def list_letters():
    user = S.require_social()
    box = request.args.get("box", "inbox")
    status = request.args.get("filter", "all")
    offset, limit = _page()
    if box == "sent":
        q = Letter.query.filter(Letter.sender_id == user.id, Letter.sender_hidden_at.is_(None))
        rows = q.order_by(Letter.sent_at.desc(), Letter.id.desc()).offset(offset).limit(limit + 1).all()
        more = len(rows) > limit
        rows = rows[:limit]
        envs = LetterRecipient.query.filter(LetterRecipient.letter_id.in_([r.id for r in rows])).all() if rows else []
        cards = people(e.recipient_id for e in envs)
        by_letter = {}
        for e in envs:
            by_letter.setdefault(e.letter_id, []).append({
                "person": cards.get(e.recipient_id) or {**GONE, "name": e.recipient_name},
                "readAt": iso(e.read_at),
            })
        items = [{
            "id": r.id, "subject": r.subject, "stationery": r.stationery, "seal": r.seal, "sentAt": iso(r.sent_at),
            "excerpt": _excerpt(r.content), "words": r.word_count, "hasCover": bool(r.cover_data),
            "recipients": by_letter.get(r.id, []),
        } for r in rows]
        return ok({"items": items, "next": offset + limit if more else None})

    q = (db.session.query(LetterRecipient, Letter).join(Letter, Letter.id == LetterRecipient.letter_id)
         .filter(LetterRecipient.recipient_id == user.id, LetterRecipient.hidden_at.is_(None)))
    if status == "unread":
        q = q.filter(LetterRecipient.read_at.is_(None))
    elif status == "read":
        q = q.filter(LetterRecipient.read_at.isnot(None))
    rows = q.order_by(LetterRecipient.delivered_at.desc(), LetterRecipient.id.desc()).offset(offset).limit(limit + 1).all()
    more = len(rows) > limit
    rows = rows[:limit]
    cards = people(l.sender_id for _, l in rows)
    unread = LetterRecipient.query.filter_by(recipient_id=user.id, read_at=None, hidden_at=None).count()
    items = [{
        "id": l.id, "subject": l.subject, "stationery": l.stationery, "seal": l.seal,
        "sentAt": iso(l.sent_at), "deliveredAt": iso(e.delivered_at), "readAt": iso(e.read_at),
        # An unopened envelope doesn't show its contents.
        "excerpt": _excerpt(l.content) if e.read_at else None,
        "sender": cards.get(l.sender_id) or {**GONE, "name": l.sender_name},
        "hasCover": bool(l.cover_data),
    } for e, l in rows]
    return ok({"items": items, "next": offset + limit if more else None, "unread": unread})


@bp.get("/<int:letter_id>")
def get_letter(letter_id):
    user = S.require_social()
    letter, envelope = _access(letter_id, user)
    cards = people([letter.sender_id])
    out = {
        "id": letter.id, "subject": letter.subject, "content": letter.content, "words": letter.word_count,
        "stationery": letter.stationery, "seal": letter.seal, "sentAt": iso(letter.sent_at),
        "cover": _cover(letter),
        "sender": cards.get(letter.sender_id) or {**GONE, "name": letter.sender_name},
        "role": "recipient" if envelope else "sender",
        "readAt": iso(envelope.read_at) if envelope else None,
        "sourceWritingId": letter.source_writing_id if letter.sender_id == user.id else None,
        "inReplyTo": None,
    }
    if envelope:
        out["recipient"] = {"name": envelope.recipient_name}  # only yourself, never the other recipients
    if letter.sender_id == user.id:
        envs = LetterRecipient.query.filter_by(letter_id=letter.id).all()
        rcards = people(e.recipient_id for e in envs)
        out["recipients"] = [{"person": rcards.get(e.recipient_id) or {**GONE, "name": e.recipient_name},
                              "readAt": iso(e.read_at)} for e in envs]
    if letter.in_reply_to_id:
        original = db.session.get(Letter, letter.in_reply_to_id)
        if original and (original.sender_id == user.id or _mine_as_recipient(original.id, user.id)):
            out["inReplyTo"] = {"id": original.id, "subject": original.subject}
    return ok(out)


@bp.post("/<int:letter_id>/read")
def mark_letter_read(letter_id):
    user = S.require_social()
    letter, envelope = _access(letter_id, user)
    if not envelope:
        return ok({"readAt": None})
    if envelope.read_at is None:
        envelope.read_at = datetime.utcnow()
        Notification.query.filter_by(user_id=user.id, kind="letter", ref_id=letter.id, read_at=None).update(
            {"read_at": datetime.utcnow()}, synchronize_session=False)
        db.session.commit()
    return ok({"readAt": iso(envelope.read_at)})


@bp.post("/<int:letter_id>/hide")
def hide_letter(letter_id):
    user = S.require_social()
    letter, envelope = _access(letter_id, user)
    now = datetime.utcnow()
    if envelope:
        envelope.hidden_at = now
    if letter.sender_id == user.id:
        letter.sender_hidden_at = now
    db.session.flush()
    kept = LetterRecipient.query.filter_by(letter_id=letter.id, hidden_at=None).count()
    sender_keeps = letter.sender_id is not None and letter.sender_hidden_at is None
    if not kept and not sender_keeps:
        db.session.delete(letter)  # nobody keeps it any more
    db.session.commit()
    return ok({"hidden": True})


@bp.get("/<int:letter_id>/cover")
def letter_cover(letter_id):
    user = S.require_social()
    letter, _ = _access(letter_id, user)
    if not letter.cover_data:
        return fail("Esta carta no tiene portada.", 404)
    resp = Response(bytes(letter.cover_data), mimetype=letter.cover_mime or "image/webp")
    resp.headers["Cache-Control"] = "private, max-age=86400"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


@bp.get("/by-writing/<int:writing_id>")
def letters_from_writing(writing_id):
    """The sender's record of letters sent from one of their drafts."""
    user = S.require_social()
    if not Writing.query.filter_by(id=writing_id, user_id=user.id).first():
        return fail("Ese escrito no está en tu estudio.", 404)
    rows = (Letter.query.filter(Letter.sender_id == user.id, Letter.source_writing_id == writing_id,
                                Letter.sender_hidden_at.is_(None))
            .order_by(Letter.sent_at.desc()).limit(20).all())
    envs = LetterRecipient.query.filter(LetterRecipient.letter_id.in_([r.id for r in rows])).all() if rows else []
    names = {}
    for e in envs:
        names.setdefault(e.letter_id, []).append(e.recipient_name)
    return ok([{"id": r.id, "subject": r.subject, "sentAt": iso(r.sent_at), "to": names.get(r.id, [])} for r in rows])
