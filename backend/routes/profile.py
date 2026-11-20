"""Reader profile, onboarding, feedback signals and data portability."""
from datetime import datetime

from flask import Blueprint, request

from models import Book, Interaction, ReaderProfile, Shelf, ShelfItem, Writing, db
from services import catalog
from services.serializers import profile_to_dict, shelf_to_dict
from services.taste import archetype, describe_axes
from services.taxonomy import GENRE_BY_KEY, PURPOSES, genre_label, theme_label
from services.text import author_key, subject_terms
from services.users import DEFAULT_SHELVES, current_profile, current_user

from .common import fail, interaction_dicts, library_dicts, load_taste, ok
from .library import DuplicateBook, apply_bibliographic, apply_personal, create_book
from .studio import export_studio, import_studio

bp = Blueprint("profile", __name__)

AXES = ("complexity", "length", "pace", "focus", "era")


def _clean_prefs(raw, base=None):
    prefs = dict(base or {})
    for axis in AXES:
        if axis in raw:
            try:
                prefs[axis] = max(-1.0, min(1.0, float(raw[axis])))
            except (TypeError, ValueError):
                prefs[axis] = 0.0
    if "purposes" in raw:
        prefs["purposes"] = [p for p in raw.get("purposes") or [] if p in PURPOSES]
    if "language" in raw:
        prefs["language"] = raw["language"] if raw["language"] in ("es", "en", "any") else "es"
    return prefs


def _clean_authors(raw):
    out, seen = [], set()
    for a in raw or []:
        name = (a.get("name") if isinstance(a, dict) else str(a) or "").strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        out.append({"name": name[:120], "key": (a.get("key") if isinstance(a, dict) else None),
                    "photo": (a.get("photo") if isinstance(a, dict) else None)})
    return out[:30]


def insights():
    taste = load_taste()
    arche = archetype(taste)
    pub = taste.to_public()
    for g in pub["genres"]:
        g["label"] = genre_label(g["key"])
    for t in pub["themes"]:
        t["label"] = theme_label(t["key"])
    names = {}
    for b in library_dicts(current_user().id):
        for a in b.get("authors") or []:
            names.setdefault(author_key(a), a)
    for a in taste.favorite_authors:
        names[author_key(a)] = a
    pub["authors"] = [{"name": names.get(a["key"], a["key"].title()), "weight": a["weight"]} for a in pub["authors"]]
    return {
        "archetype": arche,
        "taste": pub,
        "axes": describe_axes(taste.prefs),
        "purposes": [{"key": p, "label": PURPOSES[p]["label"]} for p in taste.purposes if p in PURPOSES],
    }


@bp.get("/api/profile")
def get_profile():
    return ok({"profile": profile_to_dict(current_profile()), "insights": insights()})


@bp.patch("/api/profile")
def update_profile():
    profile = current_profile()
    data = request.get_json(silent=True) or {}
    if "displayName" in data:
        profile.display_name = (data.get("displayName") or "").strip()[:80] or None
    if "genres" in data:
        profile.genres = [g for g in data.get("genres") or [] if g in GENRE_BY_KEY]
    if "preferences" in data:
        profile.preferences = _clean_prefs(data.get("preferences") or {}, profile.preferences)
    if "favoriteAuthors" in data:
        profile.favorite_authors = _clean_authors(data.get("favoriteAuthors"))
    if "readingGoal" in data:
        try:
            profile.reading_goal = max(1, min(500, int(data.get("readingGoal"))))
        except (TypeError, ValueError):
            return fail("El reto anual debe ser un número.")
    if "theme" in data and data["theme"] in ("ink", "paper"):
        profile.theme = data["theme"]
    db.session.commit()
    return ok({"profile": profile_to_dict(profile), "insights": insights()})


def _upsert_interaction(user_id, item, kind):
    item_id = item.get("id")
    if not item_id:
        return
    row = Interaction.query.filter_by(user_id=user_id, item_id=item_id).first()
    if row is None:
        row = Interaction(user_id=user_id, item_id=item_id)
        db.session.add(row)
    row.kind = kind
    row.title = (item.get("title") or "")[:400]
    row.authors = (item.get("authors") or [])[:4]
    row.terms = (item.get("terms") or subject_terms(item.get("categories")))[:30]
    row.genres = (item.get("genres") or [])[:4]
    row.created_at = datetime.utcnow()


@bp.post("/api/onboarding/complete")
def complete_onboarding():
    user = current_user()
    profile = current_profile()
    data = request.get_json(silent=True) or {}
    profile.display_name = (data.get("displayName") or "").strip()[:80] or profile.display_name
    profile.genres = [g for g in data.get("genres") or [] if g in GENRE_BY_KEY]
    profile.preferences = _clean_prefs(data.get("preferences") or {}, {})
    profile.favorite_authors = _clean_authors(data.get("favoriteAuthors"))
    if data.get("readingGoal"):
        try:
            profile.reading_goal = max(1, min(500, int(data["readingGoal"])))
        except (TypeError, ValueError):
            pass
    profile.onboarded_at = datetime.utcnow()

    for swipe in data.get("swipes") or []:
        verdict = swipe.get("verdict")
        if verdict in ("like", "love", "dislike") and swipe.get("item"):
            _upsert_interaction(user.id, swipe["item"], verdict)

    to_library = []
    if data.get("addToLibrary", True):
        to_library += [s["item"] for s in data.get("swipes") or [] if s.get("verdict") == "love" and s.get("item")]
        to_library += [b for b in data.get("favoriteBooks") or [] if b]
    for b in data.get("favoriteBooks") or []:
        _upsert_interaction(user.id, b, "love")
    added = 0
    if to_library:
        catalog.describe_many(to_library, limit=len(to_library))
        favorites = Shelf.query.filter_by(user_id=user.id, name=DEFAULT_SHELVES[0]["name"]).first()
        for item in to_library:
            try:
                book = create_book(user, {"book": item, "status": "read", "finishedAt": None,
                                          "shelfIds": [favorites.id] if favorites else []}, enrich=False)
                book.finished_at = None  # we don't know when it was read
                added += 1
            except (DuplicateBook, ValueError):
                continue
    db.session.commit()
    return ok({"profile": profile_to_dict(profile), "insights": insights(), "added": added})


@bp.post("/api/onboarding/reset")
def reset_onboarding():
    profile = current_profile()
    profile.onboarded_at = None
    db.session.commit()
    return ok({"profile": profile_to_dict(profile)})


@bp.get("/api/insights")
def get_insights():
    return ok(insights())


@bp.post("/api/feedback")
def feedback():
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    item = data.get("item") or {}
    if kind not in ("like", "love", "dislike", "dismiss") or not item.get("id"):
        return fail("Feedback no válido.")
    _upsert_interaction(current_user().id, item, kind)
    db.session.commit()
    return ok({"itemId": item["id"], "kind": kind})


@bp.delete("/api/feedback/<path:item_id>")
def undo_feedback(item_id):
    Interaction.query.filter_by(user_id=current_user().id, item_id=item_id).delete()
    db.session.commit()
    return ok({"itemId": item_id})


# ─── data portability ────────────────────────────────────────────────────────


@bp.get("/api/export")
def export_data():
    user = current_user()
    shelves = Shelf.query.filter_by(user_id=user.id).all()
    return ok({
        "app": "booktracker",
        "version": 1,
        "exportedAt": datetime.utcnow().isoformat() + "Z",
        "profile": profile_to_dict(current_profile()),
        "books": library_dicts(user.id),
        "lists": [shelf_to_dict(s) for s in shelves],
        "interactions": interaction_dicts(user.id),
        "studio": export_studio(user, with_images=request.args.get("images") == "1"),
    })


@bp.post("/api/import")
def import_data():
    data = request.get_json(silent=True) or {}
    if data.get("app") != "booktracker" or not isinstance(data.get("books"), list):
        return fail("El archivo no es una copia de seguridad de Booktracker.")
    user = current_user()
    # An import replaces what the account has. Never do that by surprise: if the
    # account already holds books or writings, the client must confirm with ?replace=1.
    has_data = Book.query.filter_by(user_id=user.id).count() or Writing.query.filter_by(user_id=user.id).count()
    if has_data and request.args.get("replace") != "1":
        return fail("Esta cuenta ya tiene datos. Importar los reemplazaría; confirma para continuar.", 409,
                    needsConfirm=True, books=Book.query.filter_by(user_id=user.id).count(),
                    writings=Writing.query.filter_by(user_id=user.id).count())
    Interaction.query.filter_by(user_id=user.id).delete()
    for s in Shelf.query.filter_by(user_id=user.id).all():
        db.session.delete(s)
    Book.query.filter_by(user_id=user.id).delete()
    db.session.flush()

    id_map = {}
    for b in data["books"]:
        book = Book(user_id=user.id, status="want", authors=[], categories=[], genres=[])
        book.source = b.get("source") or "manual"
        apply_bibliographic(book, b)
        apply_personal(book, {k: b.get(k) for k in ("status", "rating", "startedAt", "finishedAt", "currentPage",
                                                     "notes", "review")}, creating=True)
        book.started_at, book.finished_at = b.get("startedAt"), b.get("finishedAt")
        db.session.add(book)
        db.session.flush()
        id_map[b.get("id")] = book.id
    for s in data.get("lists") or []:
        shelf = Shelf(user_id=user.id, name=(s.get("name") or "Lista")[:120], description=s.get("description"),
                      color=s.get("color"), emoji=s.get("emoji"))
        db.session.add(shelf)
        db.session.flush()
        for old_id in s.get("bookIds") or []:
            if old_id in id_map:
                db.session.add(ShelfItem(shelf_id=shelf.id, book_id=id_map[old_id]))
    for it in data.get("interactions") or []:
        if it.get("itemId") and it.get("kind"):
            db.session.add(Interaction(user_id=user.id, item_id=it["itemId"], kind=it["kind"], title=it.get("title"),
                                       authors=it.get("authors") or [], terms=it.get("terms") or [],
                                       genres=it.get("genres") or []))
    p = data.get("profile") or {}
    profile = current_profile()
    profile.display_name = p.get("displayName") or profile.display_name
    profile.genres = [g for g in p.get("genres") or [] if g in GENRE_BY_KEY]
    profile.preferences = _clean_prefs(p.get("preferences") or {}, {})
    profile.favorite_authors = _clean_authors(p.get("favoriteAuthors"))
    profile.reading_goal = p.get("readingGoal") or profile.reading_goal
    profile.theme = p.get("theme") if p.get("theme") in ("ink", "paper") else profile.theme
    if p.get("onboarded"):
        profile.onboarded_at = profile.onboarded_at or datetime.utcnow()
    writings = None
    if isinstance(data.get("studio"), dict):
        writings = import_studio(user, data["studio"])
    db.session.commit()
    return ok({"books": len(id_map), "writings": writings})


@bp.delete("/api/data")
def wipe_data():
    """Delete the whole library, lists and profile (keeps the account)."""
    user = current_user()
    Interaction.query.filter_by(user_id=user.id).delete()
    for s in Shelf.query.filter_by(user_id=user.id).all():
        db.session.delete(s)
    Book.query.filter_by(user_id=user.id).delete()
    ReaderProfile.query.filter_by(user_id=user.id).delete()
    db.session.flush()
    db.session.add(ReaderProfile(user_id=user.id, genres=[], preferences={}, favorite_authors=[]))
    for spec in DEFAULT_SHELVES:
        db.session.add(Shelf(user_id=user.id, **spec))
    db.session.commit()
    return ok({"wiped": True})
