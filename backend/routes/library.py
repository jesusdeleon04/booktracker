"""Personal library: books and custom lists."""
from flask import Blueprint, request
from sqlalchemy import or_

from models import Book, Shelf, ShelfItem, db
from services import catalog
from services.serializers import book_to_dict, shelf_to_dict
from services.taxonomy import GENRE_BY_KEY, detect_genres
from services.text import clean_title, dedupe_key, is_latin, isbn_digits, loose_key, subject_terms
from services.users import current_profile, current_user

from .common import fail, library_dicts, ok, shelf_map, today

bp = Blueprint("library", __name__)

STATUSES = {"want", "reading", "read"}


class DuplicateBook(Exception):
    def __init__(self, existing):
        super().__init__("duplicate")
        self.existing = existing


def _clean_rating(value):
    if value in (None, "", 0):
        return None
    try:
        r = round(float(value) * 2) / 2
    except (TypeError, ValueError):
        return None
    return min(5.0, max(0.5, r))


def _clean_date(value):
    if not value:
        return None
    value = str(value)[:10]
    return value if len(value) == 10 and value[4] == "-" and value[7] == "-" else None


def _int_or_none(value):
    try:
        v = int(value)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def find_duplicate(user_id, info):
    """Same work already in the library? Match by ids, ISBN or title+author."""
    clauses = []
    key = dedupe_key(info.get("title", ""), info.get("authors") or [])
    if key and key != "|":
        clauses.append(Book.dedupe_key == key)
    if info.get("olWorkKey"):
        clauses.append(Book.ol_work_key == info["olWorkKey"])
    if info.get("googleId"):
        clauses.append(Book.google_id == info["googleId"])
    isbn = isbn_digits(info.get("isbn13"))
    if len(isbn) == 13:
        clauses.append(Book.isbn13 == isbn)
    found = Book.query.filter(Book.user_id == user_id, or_(*clauses)).first() if clauses else None
    if found:
        return found
    # Same work under a slightly different title ("El crimen y el castigo" vs "Crimen y castigo").
    target = loose_key(info.get("title", ""), info.get("authors") or [])
    for b in Book.query.filter_by(user_id=user_id).all():
        if loose_key(b.title, b.authors or []) == target:
            return b
    return None


def apply_personal(book, data, creating=False):
    status = data.get("status")
    if status is not None:
        if status not in STATUSES:
            raise ValueError("Estado no válido.")
        previous = book.status
        book.status = status
        if status == "reading" and not book.started_at:
            book.started_at = today()
        if status == "read" and not book.finished_at and (creating or previous != "read"):
            book.finished_at = today()
        if status == "read" and book.page_count:
            book.current_page = book.page_count
        if status == "want" and previous != "want" and not creating:
            book.current_page = None
    if "rating" in data:
        book.rating = _clean_rating(data.get("rating"))
    if "startedAt" in data:
        book.started_at = _clean_date(data.get("startedAt"))
    if "finishedAt" in data:
        book.finished_at = _clean_date(data.get("finishedAt"))
    if "currentPage" in data:
        page = _int_or_none(data.get("currentPage"))
        if page and book.page_count:
            page = min(page, book.page_count)
        book.current_page = page
    if "notes" in data:
        book.notes = (data.get("notes") or "").strip()[:20000]
    if "review" in data:
        book.review = (data.get("review") or "").strip()[:20000]


def apply_bibliographic(book, info):
    """Copy catalog fields (camelCase) onto a Book row."""
    if "title" in info and info.get("title"):
        book.title = clean_title(info["title"])[:400]
    for src, dst, limit in (("subtitle", "subtitle", 400), ("publisher", "publisher", 255),
                            ("publishedDate", "published_date", 40), ("language", "language", 10)):
        if src in info:
            book.__setattr__(dst, (info.get(src) or "")[:limit] or None)
    if "authors" in info:
        book.authors = [a.strip() for a in info.get("authors") or [] if a and a.strip()][:6]
    if "description" in info:
        book.description = (info.get("description") or "").strip()[:12000] or None
    if "year" in info:
        book.year = _int_or_none(info.get("year"))
    if "pageCount" in info:
        book.page_count = _int_or_none(info.get("pageCount"))
    if "isbn13" in info:
        book.isbn13 = isbn_digits(info.get("isbn13"))[:13] or None
    if "isbn10" in info:
        book.isbn10 = isbn_digits(info.get("isbn10"))[:10] or None
    if "categories" in info:
        book.categories = [str(c)[:120] for c in info.get("categories") or []][:50]
    if "genres" in info and info.get("genres") is not None:
        book.genres = [g for g in info.get("genres") or [] if g in GENRE_BY_KEY][:4]
    if "coverUrl" in info:
        book.cover_url = info.get("coverUrl") or None
    if "coverAltUrl" in info:
        book.cover_alt_url = info.get("coverAltUrl") or None
    if info.get("olWorkKey"):
        book.ol_work_key = info["olWorkKey"]
    if info.get("googleId"):
        book.google_id = info["googleId"]
    if not book.genres:
        book.genres = detect_genres(subject_terms(book.categories), book.year, book.description or "")
    book.dedupe_key = dedupe_key(book.title, book.authors or [])


def create_book(user, payload, enrich=True):
    """Shared by the API and onboarding. Raises DuplicateBook / ValueError."""
    info = dict(payload.get("book") or {})
    if not (info.get("title") or "").strip():
        raise ValueError("El título es obligatorio.")
    catalog_id = info.get("id") or ""
    lang = (current_profile().preferences or {}).get("language") or "es"
    if enrich and catalog_id and catalog_id[:3] in ("ol:", "gb:") and (
        not info.get("description") or not info.get("pageCount") or not info.get("publisher")
    ):
        try:
            full = catalog.enrich(catalog_id, lang, hint=info)
            if full:
                for k, v in full.items():
                    if v and not info.get(k):
                        info[k] = v
        except Exception as exc:  # enrichment is best-effort
            print(f"[library] enrich failed for {catalog_id}: {exc}")

    existing = find_duplicate(user.id, info)
    if existing:
        raise DuplicateBook(existing)

    book = Book(user_id=user.id, status="want", authors=[], categories=[], genres=[])
    book.source = {"ol": "openlibrary", "gb": "google"}.get(catalog_id[:2], "manual") if catalog_id else "manual"
    apply_bibliographic(book, info)
    apply_personal(book, {"status": payload.get("status") or "want", **{
        k: payload[k] for k in ("rating", "startedAt", "finishedAt", "currentPage", "notes", "review") if k in payload
    }}, creating=True)
    db.session.add(book)
    db.session.flush()
    for shelf_id in payload.get("shelfIds") or []:
        shelf = Shelf.query.filter_by(id=shelf_id, user_id=user.id).first()
        if shelf:
            db.session.add(ShelfItem(shelf_id=shelf.id, book_id=book.id))
    return book


def _get_book(book_id):
    user = current_user()
    return Book.query.filter_by(id=book_id, user_id=user.id).first()


def _book_json(book):
    return book_to_dict(book, shelf_map(book.user_id).get(book.id, []))


# ─── books ───────────────────────────────────────────────────────────────────


@bp.get("/api/books")
def list_books():
    return ok(library_dicts(current_user().id))


@bp.post("/api/books")
def add_book():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    try:
        book = create_book(user, payload)
        db.session.commit()
    except DuplicateBook as dup:
        db.session.rollback()
        return fail("Este libro ya está en tu biblioteca.", 409, existingId=dup.existing.id)
    except ValueError as exc:
        db.session.rollback()
        return fail(str(exc))
    return ok(_book_json(book), 201)


@bp.get("/api/books/<int:book_id>")
def get_book(book_id):
    book = _get_book(book_id)
    if not book:
        return fail("Libro no encontrado.", 404)
    return ok(_book_json(book))


@bp.patch("/api/books/<int:book_id>")
def update_book(book_id):
    book = _get_book(book_id)
    if not book:
        return fail("Libro no encontrado.", 404)
    data = request.get_json(silent=True) or {}
    try:
        bib = {k: data[k] for k in ("title", "subtitle", "authors", "description", "publisher", "publishedDate",
                                     "year", "pageCount", "isbn13", "isbn10", "genres", "coverUrl", "language")
               if k in data}
        if bib:
            if "title" in bib and not (bib["title"] or "").strip():
                return fail("El título no puede quedar vacío.")
            apply_bibliographic(book, bib)
        apply_personal(book, data)
        db.session.commit()
    except ValueError as exc:
        db.session.rollback()
        return fail(str(exc))
    return ok(_book_json(book))


@bp.delete("/api/books/<int:book_id>")
def delete_book(book_id):
    book = _get_book(book_id)
    if not book:
        return fail("Libro no encontrado.", 404)
    db.session.delete(book)
    db.session.commit()
    return ok({"id": book_id})


@bp.post("/api/books/<int:book_id>/refresh")
def refresh_book(book_id):
    """Re-import missing bibliographic data from the APIs."""
    book = _get_book(book_id)
    if not book:
        return fail("Libro no encontrado.", 404)
    cid = f"ol:{book.ol_work_key}" if book.ol_work_key else (f"gb:{book.google_id}" if book.google_id else None)
    lang = (current_profile().preferences or {}).get("language") or "es"
    full = None
    if cid:
        full = catalog.enrich(cid, lang)
    elif book.isbn13:
        found = catalog.search_isbn(book.isbn13, lang)["items"]
        full = found[0] if found else None
    elif book.authors:
        found = catalog.search(f"{book.title} {book.authors[0]}", lang, 5)["items"]
        full = next((f for f in found if f["dedupeKey"] == book.dedupe_key), None)
    if not full:
        return fail("No encontramos datos adicionales para este libro.", 404)
    fill = {}
    current = book_to_dict(book)
    for k in ("description", "publisher", "publishedDate", "year", "pageCount", "isbn13", "isbn10",
              "categories", "coverUrl", "coverAltUrl", "subtitle", "olWorkKey", "googleId"):
        if full.get(k) and not current.get(k):
            fill[k] = full[k]
    # Improvements, not just gaps: the real first-publication year and readable author names.
    if full.get("year") and current.get("year") and full["year"] < current["year"]:
        fill["year"] = full["year"]
    if full.get("authors") and current.get("authors") and not all(is_latin(a) for a in current["authors"])             and all(is_latin(a) for a in full["authors"]):
        fill["authors"] = full["authors"]
    if fill:
        apply_bibliographic(book, fill)
        db.session.commit()
    return ok({"book": _book_json(book), "updated": sorted(fill)})


# ─── lists ───────────────────────────────────────────────────────────────────


def _get_shelf(shelf_id):
    return Shelf.query.filter_by(id=shelf_id, user_id=current_user().id).first()


@bp.get("/api/lists")
def get_lists():
    shelves = Shelf.query.filter_by(user_id=current_user().id).order_by(Shelf.created_at.asc()).all()
    return ok([shelf_to_dict(s) for s in shelves])


@bp.post("/api/lists")
def create_list():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return fail("La lista necesita un nombre.")
    user = current_user()
    if Shelf.query.filter(Shelf.user_id == user.id, db.func.lower(Shelf.name) == name.lower()).first():
        return fail("Ya tienes una lista con ese nombre.", 409)
    shelf = Shelf(user_id=user.id, name=name[:120], description=(data.get("description") or "")[:400],
                  color=data.get("color") or "#C9A45C", emoji=(data.get("emoji") or "")[:8])
    db.session.add(shelf)
    db.session.flush()
    for book_id in data.get("bookIds") or []:
        if Book.query.filter_by(id=book_id, user_id=user.id).first():
            db.session.add(ShelfItem(shelf_id=shelf.id, book_id=book_id))
    db.session.commit()
    return ok(shelf_to_dict(shelf), 201)


@bp.patch("/api/lists/<int:shelf_id>")
def update_list(shelf_id):
    shelf = _get_shelf(shelf_id)
    if not shelf:
        return fail("Lista no encontrada.", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return fail("La lista necesita un nombre.")
        shelf.name = name[:120]
    if "description" in data:
        shelf.description = (data.get("description") or "")[:400]
    if "color" in data:
        shelf.color = data.get("color") or shelf.color
    if "emoji" in data:
        shelf.emoji = (data.get("emoji") or "")[:8]
    db.session.commit()
    return ok(shelf_to_dict(shelf))


@bp.delete("/api/lists/<int:shelf_id>")
def delete_list(shelf_id):
    shelf = _get_shelf(shelf_id)
    if not shelf:
        return fail("Lista no encontrada.", 404)
    db.session.delete(shelf)
    db.session.commit()
    return ok({"id": shelf_id})


@bp.post("/api/lists/<int:shelf_id>/books")
def add_to_list(shelf_id):
    shelf = _get_shelf(shelf_id)
    if not shelf:
        return fail("Lista no encontrada.", 404)
    book_id = (request.get_json(silent=True) or {}).get("bookId")
    if not Book.query.filter_by(id=book_id, user_id=shelf.user_id).first():
        return fail("Libro no encontrado.", 404)
    if not ShelfItem.query.filter_by(shelf_id=shelf.id, book_id=book_id).first():
        db.session.add(ShelfItem(shelf_id=shelf.id, book_id=book_id))
        db.session.commit()
    return ok(shelf_to_dict(shelf))


@bp.delete("/api/lists/<int:shelf_id>/books/<int:book_id>")
def remove_from_list(shelf_id, book_id):
    shelf = _get_shelf(shelf_id)
    if not shelf:
        return fail("Lista no encontrada.", 404)
    ShelfItem.query.filter_by(shelf_id=shelf.id, book_id=book_id).delete()
    db.session.commit()
    db.session.refresh(shelf)
    return ok(shelf_to_dict(shelf))
