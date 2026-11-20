"""Catalog search, onboarding material, recommendations and exploration."""
from flask import Blueprint, request

import config
from models import Book
from services import catalog, http_client, recommender, sources
from services.serializers import book_to_dict
from services.taxonomy import public_meta
from services.users import current_profile, current_user

from .common import fail, load_taste, ok

bp = Blueprint("discover", __name__)


def _lang():
    lang = request.args.get("lang")
    if lang in ("es", "en", "any"):
        return lang
    return (current_profile().preferences or {}).get("language") or "es"


def _slim(book):
    """Search results don't need the whole subject list."""
    out = dict(book)
    out["categories"] = (book.get("categories") or [])[:20]
    out.pop("terms", None)
    out.pop("juvenile", None)
    return out


@bp.get("/api/meta")
def meta():
    return ok(public_meta())


@bp.get("/api/health")
def health():
    google = http_client.breaker_status("www.googleapis.com")
    ol = http_client.breaker_status("openlibrary.org")
    return ok({
        "sources": {
            "openlibrary": {"available": ol is None, "detail": (ol or {}).get("reason")},
            "google": {
                "available": google is None,
                "keyConfigured": bool(config.GOOGLE_BOOKS_API_KEY),
                "detail": (google or {}).get("reason"),
            },
        }
    })


@bp.get("/api/catalog/search")
def search():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return ok({"items": [], "sources": {}})
    limit = min(int(request.args.get("limit", 20) or 20), 30)
    result = catalog.search(q, _lang(), limit)
    if not result["items"] and not any(result["sources"].values()):
        return fail("Las fuentes bibliográficas no responden ahora mismo. Inténtalo en unos segundos.", 503)
    return ok({"items": [_slim(b) for b in result["items"]], "sources": result["sources"]})


@bp.get("/api/catalog/book")
def catalog_book():
    book_id = request.args.get("id") or ""
    if not book_id:
        return fail("Falta el identificador.")
    book = catalog.enrich(book_id, _lang())
    if not book:
        return fail("No encontramos este libro en las fuentes.", 404)
    return ok(_slim(book))


@bp.get("/api/catalog/authors")
def authors():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return ok([])
    try:
        return ok(sources.ol_author_search(q, limit=int(request.args.get("limit", 8))))
    except sources.SourceUnavailable:
        return fail("Open Library no responde ahora mismo.", 503)


@bp.get("/api/onboarding/genres")
def onboarding_genres():
    return ok(recommender.genre_covers(_lang()))


@bp.get("/api/onboarding/deck")
def onboarding_deck():
    genres = [g for g in (request.args.get("genres") or "").split(",") if g]
    return ok(recommender.onboarding_deck(genres, _lang()))


@bp.get("/api/discover")
def discover_plan():
    taste = load_taste()
    return ok({"sections": recommender.plan(taste), "signals": taste.signal_count})


@bp.get("/api/discover/section")
def discover_section():
    key = request.args.get("key") or ""
    seed = int(request.args.get("seed", 0) or 0)
    if not key:
        return fail("Falta la sección.")
    taste = load_taste()
    return ok(recommender.build_section(key, taste, seed))


@bp.get("/api/discover/similar")
def similar():
    taste = load_taste()
    book_id = request.args.get("bookId")
    if book_id:
        book = Book.query.filter_by(id=int(book_id), user_id=current_user().id).first()
        if not book:
            return fail("Libro no encontrado.", 404)
        data = book_to_dict(book)
    else:
        cid = request.args.get("id") or ""
        data = catalog.enrich(cid, taste.lang) if cid else None
        if not data:
            return fail("Libro no encontrado.", 404)
    items = recommender.similar_to(data, taste)
    return ok({"items": items})


@bp.get("/api/explore")
def explore():
    kind = request.args.get("kind") or ""
    key = request.args.get("key") or ""
    page = max(1, int(request.args.get("page", 1) or 1))
    taste = load_taste()
    items = recommender.explore(kind, key, taste, page)
    return ok({"items": items, "page": page})
