"""
Writer's Studio API: the user's own writings, their categories and an image
library for covers.

Text lives in SQLite (studio_writings); images are stored as files under
<data dir>/uploads/studio and referenced from studio_images. Writes use an
integer `version` for optimistic concurrency so two open tabs can't silently
overwrite each other.
"""
import base64
import json
import os
import re
import uuid
from datetime import datetime

from flask import Blueprint, Response, request, send_from_directory

import config
from models import StudioCategory, StudioImage, Writing, db
from services.serializers import iso
from services.users import current_user

from .common import fail, ok

bp = Blueprint("studio", __name__)

UPLOAD_DIR = os.path.join(config.DATA_DIR, "uploads", "studio")
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_IMAGE_BYTES = 12 * 1024 * 1024

DEFAULT_CATEGORIES = [
    ("Poesía", "#B07A9E"),
    ("Pensamientos", "#93ABD4"),
    ("Reflexiones", "#A1B47F"),
    ("Relatos", "#E9A34F"),
    ("Cuentos", "#D4693F"),
    ("Ensayos", "#C4B19A"),
    ("Cartas", "#D8B46E"),
    ("Diario", "#7FB0A8"),
    ("Ideas", "#F2C14E"),
    ("Otros", "#8C7964"),
]

_WORD_RE = re.compile(r"\S+")


# ─── helpers ─────────────────────────────────────────────────────────────────


def ensure_categories(user):
    if StudioCategory.query.filter_by(user_id=user.id).first() is None:
        for i, (name, color) in enumerate(DEFAULT_CATEGORIES):
            db.session.add(StudioCategory(user_id=user.id, name=name, color=color, position=i))
        db.session.commit()


def _categories(user):
    ensure_categories(user)
    return StudioCategory.query.filter_by(user_id=user.id).order_by(StudioCategory.position, StudioCategory.id).all()


def _category_dict(c, counts):
    return {"id": c.id, "name": c.name, "color": c.color or "#8C7964", "position": c.position, "count": counts.get(c.id, 0)}


def _image_dict(img):
    if img is None:
        return None
    return {
        "id": img.id,
        # Images are shown with <img>, which can't send a login header: they use an
        # unguessable per-image URL instead (older local files keep the id URL).
        "url": f"/api/studio/media/{img.token}" if img.token else f"/api/studio/images/{img.id}/file",
        "width": img.width,
        "height": img.height,
        "createdAt": iso(img.created_at),
    }


def _excerpt(text, length=600):
    text = (text or "").strip()
    return text[:length]


def _clean_inspiration(value):
    """A reference to a poem of the poetry library: ids, title, author and link only.
    Never the poem itself (copies of the text are up to the writer and the rights)."""
    if not isinstance(value, dict):
        return None
    poem_id = str(value.get("poemId") or "")[:300]
    url = str(value.get("url") or "")[:600]
    if not re.fullmatch(r"(ws|pdb)\.[a-z]{2}\.[A-Za-z0-9_-]+", poem_id) or not url.startswith("https://"):
        return None
    return json.dumps({
        "poemId": poem_id,
        "title": str(value.get("title") or "")[:300],
        "author": str(value.get("author") or "")[:200],
        "source": str(value.get("source") or "")[:120],
        "url": url,
        "rights": str(value.get("rights") or "")[:80],
        "kind": "reflection" if value.get("kind") == "reflection" else "inspired",
    }, ensure_ascii=False)


def _inspiration_dict(w):
    try:
        return json.loads(w.inspiration) if w.inspiration else None
    except ValueError:
        return None


def _summary(w, images=None):
    img = (images or {}).get(w.cover_image_id) if w.cover_image_id else None
    if w.cover_image_id and img is None and images is None:
        img = db.session.get(StudioImage, w.cover_image_id)
    return {
        "id": w.id,
        "title": w.title or "",
        "description": w.description or "",
        "categoryId": w.category_id,
        "cover": _image_dict(img),
        "excerpt": _excerpt(w.content),
        "wordCount": w.word_count or 0,
        "charCount": w.char_count or 0,
        "position": w.position or 0,
        "version": w.version,
        "createdAt": iso(w.created_at),
        "updatedAt": iso(w.updated_at),
        "lastWrittenAt": iso(w.last_written_at),
        "inspiration": _inspiration_dict(w),
    }


def _full(w):
    data = _summary(w)
    data.update({"content": w.content or "", "caret": w.caret or 0, "scroll": w.scroll or 0.0})
    return data


def _get_writing(writing_id):
    return Writing.query.filter_by(id=writing_id, user_id=current_user().id).first()


def _valid_category(user, category_id):
    if category_id in (None, ""):
        return None
    return StudioCategory.query.filter_by(id=category_id, user_id=user.id).first()


def _valid_image(user, image_id):
    if image_id in (None, ""):
        return None
    return StudioImage.query.filter_by(id=image_id, user_id=user.id).first()


def _fallback_category(user):
    cats = _categories(user)
    return next((c for c in cats if c.name.lower() == "otros"), cats[0] if cats else None)


def _apply_text(w, content):
    w.content = content
    w.word_count = len(_WORD_RE.findall(content))
    w.char_count = len(content)


# ─── overview ────────────────────────────────────────────────────────────────


@bp.get("/api/studio")
def studio_overview():
    user = current_user()
    cats = _categories(user)
    writings = Writing.query.filter_by(user_id=user.id).all()
    image_ids = {w.cover_image_id for w in writings if w.cover_image_id}
    images = {i.id: i for i in StudioImage.query.filter(StudioImage.id.in_(image_ids)).all()} if image_ids else {}
    counts = {}
    for w in writings:
        counts[w.category_id] = counts.get(w.category_id, 0) + 1
    resume = None
    if writings:
        last = max(writings, key=lambda w: w.last_written_at or w.updated_at or datetime.min)
        if (last.content or "").strip():
            caret = max(0, min(last.caret or len(last.content), len(last.content)))
            before = last.content[:caret]
            resume = {"id": last.id, "before": before[-260:], "atEnd": caret >= len(last.content.rstrip())}
    return ok({
        "writings": [_summary(w, images) for w in writings],
        "categories": [_category_dict(c, counts) for c in cats],
        "resume": resume,
        "totals": {"writings": len(writings), "words": sum(w.word_count or 0 for w in writings)},
    })


# ─── writings ────────────────────────────────────────────────────────────────


@bp.get("/api/studio/writings/<int:writing_id>")
def get_writing(writing_id):
    w = _get_writing(writing_id)
    if not w:
        return fail("Escrito no encontrado.", 404)
    return ok(_full(w))


@bp.post("/api/studio/writings")
def create_writing():
    user = current_user()
    data = request.get_json(silent=True) or {}
    client_key = str(data.get("clientKey") or "")[:64] or None
    if client_key:
        # The same draft can only ever become one writing (retries, two tabs…).
        existing = Writing.query.filter_by(user_id=user.id, client_key=client_key).first()
        if existing:
            return ok(_full(existing), 200)
    category = _valid_category(user, data.get("categoryId")) or _fallback_category(user)
    now = datetime.utcnow()
    top = db.session.query(db.func.min(Writing.position)).filter(Writing.user_id == user.id).scalar()
    w = Writing(
        user_id=user.id,
        title=(data.get("title") or "").strip()[:300],
        description=(data.get("description") or "").strip()[:600],
        category_id=category.id if category else None,
        cover_image_id=getattr(_valid_image(user, data.get("coverImageId")), "id", None),
        caret=int(data.get("caret") or 0),
        position=(top or 0) - 1,  # new writings go first in the manual order
        version=1,
        client_key=client_key,
        inspiration=_clean_inspiration(data.get("inspiration")),
        created_at=now,
        updated_at=now,
        last_written_at=now,
    )
    _apply_text(w, data.get("content") or "")
    db.session.add(w)
    db.session.commit()
    return ok(_full(w), 201)


@bp.patch("/api/studio/writings/<int:writing_id>")
def update_writing(writing_id):
    user = current_user()
    w = _get_writing(writing_id)
    if not w:
        return fail("Escrito no encontrado.", 404)
    data = request.get_json(silent=True) or {}

    changes = {}
    if "title" in data:
        title = (data.get("title") or "").strip()[:300]
        if title != (w.title or ""):
            changes["title"] = title
    if "description" in data:
        desc = (data.get("description") or "").strip()[:600]
        if desc != (w.description or ""):
            changes["description"] = desc
    if "content" in data:
        content = data.get("content") or ""
        if content != (w.content or ""):
            changes["content"] = content
    if "categoryId" in data:
        cat = _valid_category(user, data.get("categoryId"))
        if cat is None:
            return fail("Categoría no válida.")
        if cat.id != w.category_id:
            changes["category_id"] = cat.id
    if "coverImageId" in data:
        img_id = data.get("coverImageId")
        if img_id not in (None, ""):
            img = _valid_image(user, img_id)
            if img is None:
                return fail("Imagen no encontrada.")
            img_id = img.id
        else:
            img_id = None
        if img_id != w.cover_image_id:
            changes["cover_image_id"] = img_id
    if "inspiration" in data:
        insp = _clean_inspiration(data.get("inspiration"))
        if insp != w.inspiration:
            changes["inspiration"] = insp

    # `version` tracks the text only (title, description, content). Changing the
    # cover or the category from the library never conflicts with an open editor.
    text_changes = [k for k in changes if k in ("title", "description", "content")]
    base = data.get("baseVersion")
    if text_changes and base is not None and not data.get("force") and int(base) != w.version:
        # Edited elsewhere since this client last saw it: never overwrite silently.
        return fail("Este escrito cambió en otra ventana.", 409, writing=_full(w))

    now = datetime.utcnow()
    for key, value in changes.items():
        if key == "content":
            _apply_text(w, value)
            w.last_written_at = now
        else:
            setattr(w, key, value)
    if text_changes:
        w.version = (w.version or 1) + 1
    if changes:
        w.updated_at = now
    if "caret" in data:
        try:
            w.caret = max(0, int(data["caret"]))
        except (TypeError, ValueError):
            pass
    if "scroll" in data:
        try:
            w.scroll = max(0.0, min(1.0, float(data["scroll"])))
        except (TypeError, ValueError):
            pass
    db.session.commit()
    return ok(_summary(w))


@bp.delete("/api/studio/writings/<int:writing_id>")
def delete_writing(writing_id):
    w = _get_writing(writing_id)
    if not w:
        return fail("Escrito no encontrado.", 404)
    db.session.delete(w)
    db.session.commit()
    return ok({"id": writing_id})


@bp.post("/api/studio/order")
def reorder():
    user = current_user()
    ids = (request.get_json(silent=True) or {}).get("ids") or []
    rows = {w.id: w for w in Writing.query.filter_by(user_id=user.id).all()}
    for pos, wid in enumerate(ids):
        if wid in rows:
            rows[wid].position = pos
    db.session.commit()
    return ok({"ids": [i for i in ids if i in rows]})


# ─── categories ──────────────────────────────────────────────────────────────


def _clean_name(name):
    return re.sub(r"\s+", " ", (name or "").strip())[:80]


@bp.post("/api/studio/categories")
def create_category():
    user = current_user()
    data = request.get_json(silent=True) or {}
    name = _clean_name(data.get("name"))
    if not name:
        return fail("La categoría necesita un nombre.")
    cats = _categories(user)
    if any(c.name.lower() == name.lower() for c in cats):
        return fail("Ya existe una categoría con ese nombre.", 409)
    cat = StudioCategory(user_id=user.id, name=name, color=data.get("color") or "#C4B19A",
                         position=max([c.position or 0 for c in cats] + [0]) + 1)
    db.session.add(cat)
    db.session.commit()
    return ok(_category_dict(cat, {}), 201)


@bp.patch("/api/studio/categories/<int:category_id>")
def update_category(category_id):
    user = current_user()
    cat = StudioCategory.query.filter_by(id=category_id, user_id=user.id).first()
    if not cat:
        return fail("Categoría no encontrada.", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = _clean_name(data.get("name"))
        if not name:
            return fail("La categoría necesita un nombre.")
        clash = StudioCategory.query.filter(
            StudioCategory.user_id == user.id, StudioCategory.id != cat.id,
            db.func.lower(StudioCategory.name) == name.lower()
        ).first()
        if clash:
            return fail("Ya existe una categoría con ese nombre.", 409)
        cat.name = name
    if "color" in data and data["color"]:
        cat.color = str(data["color"])[:20]
    db.session.commit()
    count = Writing.query.filter_by(user_id=user.id, category_id=cat.id).count()
    return ok(_category_dict(cat, {cat.id: count}))


@bp.delete("/api/studio/categories/<int:category_id>")
def delete_category(category_id):
    """Deletes a category; its writings move to `moveTo` (or 'Otros')."""
    user = current_user()
    cats = _categories(user)
    cat = next((c for c in cats if c.id == category_id), None)
    if not cat:
        return fail("Categoría no encontrada.", 404)
    if len(cats) <= 1:
        return fail("Necesitas al menos una categoría.")
    move_to = request.args.get("moveTo", type=int)
    target = next((c for c in cats if c.id == move_to and c.id != cat.id), None)
    if target is None:
        target = next((c for c in cats if c.id != cat.id and c.name.lower() == "otros"), None) or next(
            c for c in cats if c.id != cat.id
        )
    moved = Writing.query.filter_by(user_id=user.id, category_id=cat.id).update({"category_id": target.id})
    db.session.delete(cat)
    db.session.commit()
    return ok({"id": category_id, "movedTo": target.id, "moved": moved})


# ─── image library ───────────────────────────────────────────────────────────


def _sniff(head):
    if head[:3] == b"\xff\xd8\xff":
        return "image/jpeg", "jpg"
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", "webp"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif", "gif"
    return None, None


@bp.get("/api/studio/images")
def list_images():
    user = current_user()
    imgs = StudioImage.query.filter_by(user_id=user.id).order_by(StudioImage.created_at.desc()).all()
    used = {}
    for w in Writing.query.filter(Writing.user_id == user.id, Writing.cover_image_id.isnot(None)).all():
        used[w.cover_image_id] = used.get(w.cover_image_id, 0) + 1
    return ok([{**_image_dict(i), "usedBy": used.get(i.id, 0)} for i in imgs])


@bp.post("/api/studio/images")
def upload_image():
    user = current_user()
    file = request.files.get("file")
    if not file:
        return fail("No se recibió ninguna imagen.")
    blob = file.read(MAX_IMAGE_BYTES + 1)
    if len(blob) > MAX_IMAGE_BYTES:
        return fail("La imagen es demasiado grande (máximo 12 MB).", 413)
    mime, ext = _sniff(blob[:16])
    if not mime:
        return fail("Formato no compatible. Usa JPG, PNG, WebP o GIF.", 415)
    filename = f"{uuid.uuid4().hex}.{ext}"  # kept for older rows; bytes now live in the database

    def _int(name):
        try:
            return int(request.form.get(name))
        except (TypeError, ValueError):
            return None

    img = StudioImage(user_id=user.id, filename=filename, mime=mime, size_bytes=len(blob), data=blob,
                      token=uuid.uuid4().hex, width=_int("width"), height=_int("height"))
    db.session.add(img)
    db.session.commit()
    return ok({**_image_dict(img), "usedBy": 0}, 201)


@bp.get("/api/studio/media/<token>")
def image_media(token):
    img = StudioImage.query.filter_by(token=token).first() if len(token) == 32 else None
    if not img or not img.data:
        return fail("Imagen no encontrada.", 404)
    resp = Response(bytes(img.data), mimetype=img.mime)
    resp.headers["Cache-Control"] = "private, max-age=31536000, immutable"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


@bp.get("/api/studio/images/<int:image_id>/file")
def image_file(image_id):
    img = StudioImage.query.filter_by(id=image_id, user_id=current_user().id).first()
    if img and img.data:
        return image_media(img.token)
    if not img or not os.path.exists(os.path.join(UPLOAD_DIR, img.filename)):
        return fail("Imagen no encontrada.", 404)
    # File names are random and never reused, so the response can be cached forever.
    return send_from_directory(UPLOAD_DIR, img.filename, mimetype=img.mime, max_age=31536000)


@bp.delete("/api/studio/images/<int:image_id>")
def delete_image(image_id):
    user = current_user()
    img = StudioImage.query.filter_by(id=image_id, user_id=user.id).first()
    if not img:
        return fail("Imagen no encontrada.", 404)
    in_use = Writing.query.filter_by(user_id=user.id, cover_image_id=img.id).count()
    if in_use and not request.args.get("force"):
        return fail(f"Esta imagen es la portada de {in_use} escrito(s).", 409, usedBy=in_use)
    Writing.query.filter_by(user_id=user.id, cover_image_id=img.id).update({"cover_image_id": None})
    path = os.path.join(UPLOAD_DIR, img.filename)
    db.session.delete(img)
    db.session.commit()
    try:
        os.remove(path)
    except OSError:
        pass
    return ok({"id": image_id})


# ─── backup helpers (used by /api/export and /api/import) ────────────────────


def _image_bytes(img):
    if img.data:
        return bytes(img.data)
    try:
        with open(os.path.join(UPLOAD_DIR, img.filename), "rb") as fh:
            return fh.read()
    except OSError:
        return None


def export_studio(user, with_images=False):
    cats = _categories(user)
    images = []
    if with_images:
        for img in StudioImage.query.filter_by(user_id=user.id).order_by(StudioImage.id).all():
            blob = _image_bytes(img)
            if blob:
                images.append({"id": img.id, "mime": img.mime, "width": img.width, "height": img.height,
                               "data": base64.b64encode(blob).decode("ascii")})
    return {
        "images": images,
        "categories": [{"id": c.id, "name": c.name, "color": c.color, "position": c.position} for c in cats],
        "writings": [
            {**_full(w), "coverImageId": w.cover_image_id}
            for w in Writing.query.filter_by(user_id=user.id).order_by(Writing.position).all()
        ],
        "note": "Las portadas van dentro de «images» (base64) cuando la copia se exporta con imágenes.",
    }


def import_studio(user, data):
    """Replace the studio with the content of a backup."""
    Writing.query.filter_by(user_id=user.id).delete()
    StudioCategory.query.filter_by(user_id=user.id).delete()
    db.session.flush()
    img_map = {}
    for im in data.get("images") or []:
        try:
            blob = base64.b64decode(im.get("data") or "", validate=True)
        except ValueError:
            continue
        mime, ext = _sniff(blob[:16])
        if not mime or len(blob) > MAX_IMAGE_BYTES:
            continue
        row = StudioImage(user_id=user.id, filename=f"{uuid.uuid4().hex}.{ext}", mime=mime, size_bytes=len(blob),
                          data=blob, token=uuid.uuid4().hex, width=im.get("width"), height=im.get("height"))
        db.session.add(row)
        db.session.flush()
        img_map[im.get("id")] = row.id
    id_map = {}
    for i, c in enumerate(data.get("categories") or []):
        cat = StudioCategory(user_id=user.id, name=_clean_name(c.get("name")) or "Sin nombre",
                             color=c.get("color"), position=c.get("position", i))
        db.session.add(cat)
        db.session.flush()
        id_map[c.get("id")] = cat.id
    if not id_map:
        db.session.flush()
        ensure_categories(user)
    fallback = _fallback_category(user)
    count = 0
    for w in data.get("writings") or []:
        cover_id = img_map.get(w.get("coverImageId"))
        row = Writing(
            user_id=user.id,
            title=(w.get("title") or "")[:300],
            description=(w.get("description") or "")[:600],
            category_id=id_map.get(w.get("categoryId")) or (fallback.id if fallback else None),
            cover_image_id=cover_id,
            caret=w.get("caret") or 0,
            position=w.get("position") or 0,
            version=1,
            inspiration=_clean_inspiration(w.get("inspiration")),
        )
        _apply_text(row, w.get("content") or "")
        for field in ("createdAt", "updatedAt", "lastWrittenAt"):
            value = w.get(field)
            if value:
                try:
                    setattr(row, {"createdAt": "created_at", "updatedAt": "updated_at",
                                  "lastWrittenAt": "last_written_at"}[field],
                            datetime.fromisoformat(value.rstrip("Z")))
                except ValueError:
                    pass
        db.session.add(row)
        count += 1
    return count
