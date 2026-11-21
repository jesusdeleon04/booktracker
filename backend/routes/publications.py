"""
Publicaciones: writings of the Writer's Studio published in the Tertulia.

* The original writing stays a private studio document. Publishing makes a
  frozen copy (title, text, category, cover): editing the writing afterwards
  never changes what friends are reading. The author decides when to refresh
  the copy ("Actualizar publicación"), and readers see that it was updated.
* Audience: "private" (only the author) or "friends" (accepted, unblocked
  friends). There is no public audience: the Tertulia has no public space.
* Every route checks `S.can_read_publication` on the server. A publication the
  caller may not read answers 404, exactly like one that doesn't exist; covers
  need the session too (no permanent public URL).
* Reactions are discreet (one per reader, no counters; only the author sees who
  reacted). Replies are private threads between each reader and the author.
"""
from datetime import datetime

from flask import Blueprint, Response, abort, request

from models import StudioCategory, StudioImage, User, Writing, db
from services import social as S
from services.serializers import iso
from social_models import Notification, Publication, PublicationComment, PublicationReaction

from .common import fail, ok
from .social import GONE, _int, _page, _payload, people

bp = Blueprint("publications", __name__, url_prefix="/api/publications")

MAX_CHARS = 200_000
AUDIENCES = ("private", "friends")
REACTIONS = {
    "gracias": "Gracias por compartirlo",
    "pensando": "Me quedé pensando",
    "conmovido": "Me ha conmovido",
    "bien_escrito": "Qué bien escrito",
}


def _words(text):
    return len([w for w in (text or "").split() if w.strip()])


def _get(pub_id, user):
    pub = db.session.get(Publication, pub_id)
    if not pub or not S.can_read_publication(pub, user.id):
        abort(404, description="Esta publicación no existe o no está disponible para ti.")
    return pub


def _mine(pub_id, user):
    pub = Publication.query.filter_by(id=pub_id, author_id=user.id).first()
    if not pub:
        abort(404, description="Esta publicación no existe o no es tuya.")
    return pub


def _snapshot(pub, writing, user):
    """Copy the writing into the publication (title/text/category/cover)."""
    content = (writing.content or "").replace("\r\n", "\n")
    pub.content = content
    pub.word_count = _words(content)
    category = db.session.get(StudioCategory, writing.category_id) if writing.category_id else None
    pub.category_name = category.name if category and category.user_id == user.id else None
    pub.category_color = category.color if category and category.user_id == user.id else None
    pub.cover_data = pub.cover_mime = pub.cover_width = pub.cover_height = None
    if writing.cover_image_id:
        from .studio import _image_bytes

        img = StudioImage.query.filter_by(id=writing.cover_image_id, user_id=user.id).first()
        blob = _image_bytes(img) if img else None
        if blob:
            pub.cover_data, pub.cover_mime = blob, img.mime
            pub.cover_width, pub.cover_height = img.width, img.height


def _author_card(pub):
    return people([pub.author_id]).get(pub.author_id, GONE)


def _cover(pub):
    if not pub.cover_data:
        return None
    return {"url": f"/api/publications/{pub.id}/cover", "width": pub.cover_width, "height": pub.cover_height}


def _differs(pub, writing):
    """True when the original writing no longer matches the published copy."""
    if writing is None:
        return False
    category = db.session.get(StudioCategory, writing.category_id) if writing.category_id else None
    return ((writing.content or "").replace("\r\n", "\n") != pub.content
            or ((writing.title or "").strip() or "Sin título") != pub.title and not pub.updated_at and False
            or (category.name if category else None) != pub.category_name)


def _threads(pub, user):
    """The author sees every thread; a reader only their own."""
    q = PublicationComment.query.filter_by(publication_id=pub.id)
    if pub.author_id != user.id:
        q = q.filter_by(thread_user_id=user.id)
    rows = q.order_by(PublicationComment.created_at, PublicationComment.id).all()
    cards = people({r.thread_user_id for r in rows} | {r.author_id for r in rows})
    threads = {}
    for r in rows:
        t = threads.setdefault(r.thread_user_id, {"reader": cards.get(r.thread_user_id, GONE), "messages": []})
        t["messages"].append({"id": r.id, "mine": r.author_id == user.id, "fromAuthor": r.author_id == pub.author_id,
                              "body": r.body, "createdAt": iso(r.created_at)})
    return list(threads.values())


def _full(pub, user):
    base = S.publication_card(pub)
    mine = pub.author_id == user.id
    me_reaction = PublicationReaction.query.filter_by(publication_id=pub.id, user_id=user.id).first()
    base.update({
        "author": _author_card(pub), "mine": mine, "content": pub.content, "cover": _cover(pub),
        "myReaction": me_reaction.reaction if me_reaction else None,
        "reactionOptions": [{"key": k, "label": v} for k, v in REACTIONS.items()],
        "threads": _threads(pub, user),
    })
    if mine:
        rows = PublicationReaction.query.filter_by(publication_id=pub.id).order_by(PublicationReaction.created_at).all()
        cards = people(r.user_id for r in rows)
        base["reactions"] = [{"person": cards.get(r.user_id, GONE), "reaction": r.reaction,
                              "label": REACTIONS.get(r.reaction, "")} for r in rows]
        writing = db.session.get(Writing, pub.source_writing_id) if pub.source_writing_id else None
        base["sourceId"] = pub.source_writing_id
        base["pendingChanges"] = _differs(pub, writing)
    return base


def _card(pub, with_author=True):
    c = S.publication_card(pub)
    if with_author:
        c["author"] = _author_card(pub)
    return c


# ── publish / manage ──────────────────────────────────────────────────────


@bp.post("")
def publish():
    user = S.require_social()
    S.ensure_profile(user)
    data = _payload()
    writing = Writing.query.filter_by(id=_int(data.get("writingId")), user_id=user.id).first()
    if not writing:
        return fail("Ese escrito no está en tu estudio.", 404)
    audience = data.get("audience")
    if audience not in AUDIENCES:  # publishing is never implicit: the author always picks
        return fail("Elige quién puede leerlo antes de publicar.")
    key = str(data.get("clientKey") or "").strip()[:64]
    if not key:
        return fail("Falta la clave de la publicación.")
    existing = Publication.query.filter_by(author_id=user.id, client_key=key).first()
    if existing:  # the same "publish" twice (double click, retry): one publication
        return ok(_full(existing, user))
    again = Publication.query.filter_by(author_id=user.id, source_writing_id=writing.id).first()
    if again:
        return fail("Este escrito ya está publicado. Puedes actualizarlo o cambiar su audiencia.", 409, existingId=again.id)
    content = (writing.content or "").replace("\r\n", "\n")
    if not content.strip():
        return fail("El escrito está en blanco: escribe algo antes de publicarlo.")
    if len(content) > MAX_CHARS:
        return fail("El escrito es demasiado largo para publicarlo.")
    S.rate_limit(Publication.query.filter_by(author_id=user.id), Publication.created_at, "publication")
    title = (data.get("title") if isinstance(data.get("title"), str) else writing.title or "").strip()[:300] or "Sin título"
    pub = Publication(author_id=user.id, source_writing_id=writing.id, client_key=key, title=title,
                      intro=(str(data.get("intro") or "").strip()[:600] or None), audience=audience,
                      withdrawn_at=None if audience == "friends" else datetime.utcnow())
    _snapshot(pub, writing, user)
    db.session.add(pub)
    db.session.commit()
    return ok(_full(pub, user), 201)


@bp.get("")
def list_publications():
    user = S.require_social()
    scope = request.args.get("scope", "feed")
    offset, limit = _page()
    if scope == "mine":
        q = Publication.query.filter_by(author_id=user.id).order_by(Publication.created_at.desc(), Publication.id.desc())
    else:
        q = S.readable_publications(user.id)
    rows = q.offset(offset).limit(limit + 1).all()
    more = len(rows) > limit
    rows = rows[:limit]
    cards = people(r.author_id for r in rows)
    out = []
    for r in rows:
        c = _card(r, with_author=False)
        c["author"] = cards.get(r.author_id, GONE)
        c["mine"] = r.author_id == user.id
        out.append(c)
    return ok({"items": out, "more": more})


@bp.get("/by-writing/<int:writing_id>")
def by_writing(writing_id):
    user = S.require_social()
    pub = Publication.query.filter_by(author_id=user.id, source_writing_id=writing_id).first()
    if not pub:
        return ok({"publication": None})
    writing = db.session.get(Writing, writing_id)
    c = _card(pub, with_author=False)
    c["pendingChanges"] = _differs(pub, writing)
    return ok({"publication": c})


@bp.get("/<int:pub_id>")
def get_publication(pub_id):
    user = S.require_social()
    return ok(_full(_get(pub_id, user), user))


@bp.patch("/<int:pub_id>")
def update_publication(pub_id):
    """Audience, title and introduction. A change of title or introduction is
    stamped as an update so readers can tell it was edited."""
    user = S.require_social()
    pub = _mine(pub_id, user)
    data = _payload()
    changed_text = False
    if "audience" in data:
        if data["audience"] not in AUDIENCES:
            return fail("Audiencia no válida.")
        pub.audience = data["audience"]
        pub.withdrawn_at = datetime.utcnow() if data["audience"] == "private" else None
    if "title" in data:
        title = (data.get("title") or "").strip()[:300] or "Sin título"
        changed_text = changed_text or title != pub.title
        pub.title = title
    if "intro" in data:
        intro = (str(data.get("intro") or "").strip()[:600] or None)
        changed_text = changed_text or intro != pub.intro
        pub.intro = intro
    if changed_text and pub.audience == "friends":
        pub.updated_at = datetime.utcnow()
    db.session.commit()
    return ok(_full(pub, user))


@bp.post("/<int:pub_id>/refresh")
def refresh(pub_id):
    """The author's explicit "update what is published" from the current writing."""
    user = S.require_social()
    pub = _mine(pub_id, user)
    writing = Writing.query.filter_by(id=pub.source_writing_id, user_id=user.id).first() if pub.source_writing_id else None
    if not writing:
        return fail("El escrito original ya no está en tu estudio.", 404)
    if not (writing.content or "").strip():
        return fail("El escrito está en blanco: escribe algo antes de actualizar la publicación.")
    if len(writing.content) > MAX_CHARS:
        return fail("El escrito es demasiado largo para publicarlo.")
    data = _payload()
    if data.get("title") is not False:
        pub.title = (writing.title or "").strip()[:300] or "Sin título"
    _snapshot(pub, writing, user)
    pub.updated_at = datetime.utcnow()
    db.session.commit()
    return ok(_full(pub, user))


@bp.delete("/<int:pub_id>")
def delete_publication(pub_id):
    user = S.require_social()
    pub = _mine(pub_id, user)
    Notification.query.filter(Notification.kind.in_(("pub_comment", "pub_reply")), Notification.ref_id == pub.id).delete(synchronize_session=False)
    db.session.delete(pub)
    db.session.commit()
    return ok({"deleted": pub_id})


@bp.get("/<int:pub_id>/cover")
def cover(pub_id):
    user = S.require_social()
    pub = _get(pub_id, user)
    if not pub.cover_data:
        return fail("Esta publicación no tiene portada.", 404)
    resp = Response(bytes(pub.cover_data), mimetype=pub.cover_mime)
    resp.headers["Cache-Control"] = "private, no-store"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


# ── reactions & replies ───────────────────────────────────────────────────


@bp.post("/<int:pub_id>/react")
def react(pub_id):
    user = S.require_social()
    pub = _get(pub_id, user)
    if pub.author_id == user.id:
        return fail("Tu propio escrito no se puede reaccionar.")
    key = _payload().get("reaction")
    row = PublicationReaction.query.filter_by(publication_id=pub.id, user_id=user.id).first()
    if key in (None, ""):
        if row:
            db.session.delete(row)
    elif key in REACTIONS:
        if row:
            row.reaction = key
        else:
            db.session.add(PublicationReaction(publication_id=pub.id, user_id=user.id, reaction=key))
    else:
        return fail("Reacción no válida.")
    db.session.commit()
    return ok({"reaction": key or None})


@bp.post("/<int:pub_id>/comments")
def comment(pub_id):
    user = S.require_social()
    pub = _get(pub_id, user)
    data = _payload()
    body = (data.get("body") or "").strip()[:1000]
    if not body:
        return fail("Escribe algo antes de enviarlo.")
    S.rate_limit(PublicationComment.query.filter_by(author_id=user.id), PublicationComment.created_at, "comment")
    if pub.author_id == user.id:
        thread = _int(data.get("threadUserId"))
        started = PublicationComment.query.filter_by(publication_id=pub.id, thread_user_id=thread).first() if thread else None
        if not started:
            return fail("Solo puedes responder a quien te ha escrito.", 404)
        reader = db.session.get(User, thread)
        if reader is None or S.blocked_between(user.id, thread) or not S.are_friends(user.id, thread):
            return fail("Ya no puedes escribirle a esta persona.", 403)
        db.session.add(PublicationComment(publication_id=pub.id, thread_user_id=thread, author_id=user.id, body=body))
        S.notify(thread, "pub_reply", user.id, pub.id)
    else:
        db.session.add(PublicationComment(publication_id=pub.id, thread_user_id=user.id, author_id=user.id, body=body))
        S.notify(pub.author_id, "pub_comment", user.id, pub.id)
    db.session.commit()
    return ok({"threads": _threads(pub, user)}, 201)


@bp.delete("/<int:pub_id>/comments/<int:comment_id>")
def delete_comment(pub_id, comment_id):
    user = S.require_social()
    pub = _get(pub_id, user)
    row = PublicationComment.query.filter_by(id=comment_id, publication_id=pub.id, author_id=user.id).first()
    if not row:
        return fail("Ese mensaje no es tuyo.", 404)
    db.session.delete(row)
    db.session.commit()
    return ok({"threads": _threads(pub, user)})
