"""
Clients for the two public bibliographic sources, normalised to one shape
("catalog book"):

    {
      id, source, olWorkKey, olEditionKey, googleId,
      title, subtitle, authors, authorKeys, description, firstSentence,
      publisher, publishedDate, year, pageCount, isbn13, isbn10, language,
      categories, genres, themes, coverUrl, coverAltUrl,
      rating, ratingsCount, popularity, dedupeKey
    }
"""
import re

import config

from . import http_client
from .http_client import SourceUnavailable
from .taxonomy import detect_genres, detect_themes
from .text import (
    clean_title,
    dedupe_key,
    isbn10_to_13,
    isbn_digits,
    strip_html,
    subject_terms,
)

OL = "https://openlibrary.org"
OL_COVER = "https://covers.openlibrary.org/b/id/{}-L.jpg"
OL_COVER_ISBN = "https://covers.openlibrary.org/b/isbn/{}-L.jpg?default=false"
OL_AUTHOR_PHOTO = "https://covers.openlibrary.org/a/olid/{}-M.jpg?default=false"
GB = "https://www.googleapis.com/books/v1/volumes"

LANG_CODES = {"es": "spa", "en": "eng"}

OL_FIELDS = ",".join(
    [
        "key", "title", "subtitle", "author_name", "author_key", "first_publish_year", "cover_i",
        "subject", "number_of_pages_median", "ratings_average", "ratings_count", "readinglog_count",
        "language", "edition_count", "first_sentence", "publisher",
        "editions", "editions.key", "editions.title", "editions.subtitle", "editions.isbn",
        "editions.publisher", "editions.cover_i", "editions.language", "editions.number_of_pages",
        "editions.publish_date",
    ]
)

# Things that are technically "books" but never what a reader wants recommended.
_JUNK_TITLE = re.compile(
    r"(study guide|sparknotes|cliffs ?notes|summary of|summary and analysis|analysis of|workbook|"
    r"estuche|box ?set|boxed set|coloring book|lesson plans?|teacher'?s guide|quiz|resumen de|"
    r"\bguía de lectura\b|collected works|obras completas|complete works|selections|antholog|"
    r"bundle|trilogy collection|\bomnibus\b|calendar|notebook|adapted for young|complete collection|collection set|young readers'? edition)",
    re.I,
)
_JUNK_SUBJECT = {"juvenile fiction", "juvenile literature", "picture books", "readers", "textbooks",
                 "study guides", "examinations"}


def _first(value):
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _pick_isbns(values):
    isbn13 = isbn10 = ""
    for raw in values or []:
        d = isbn_digits(raw)
        if len(d) == 13 and not isbn13 and d.startswith(("978", "979")):
            isbn13 = d
        elif len(d) == 10 and not isbn10:
            isbn10 = d
    if not isbn13 and isbn10:
        isbn13 = isbn10_to_13(isbn10)
    return isbn13, isbn10


def _year(value):
    if not value:
        return None
    m = re.search(r"(1[0-9]{3}|20[0-9]{2})", str(value))
    return int(m.group(1)) if m else None


def finalize(book):
    """Derive genres, themes and dedupe key from the raw data."""
    terms = subject_terms(book.get("categories"))
    book["genres"] = book.get("genres") or detect_genres(terms, book.get("year"), book.get("description", ""))
    book["themes"] = detect_themes(terms, book.get("description", ""))
    book["terms"] = terms[:30]
    book["dedupeKey"] = dedupe_key(book.get("title", ""), book.get("authors") or [])
    book["juvenile"] = bool(set(terms) & _JUNK_SUBJECT) or any(
        t.startswith(("juvenile", "children")) for t in terms
    )
    return book


def is_junk(book):
    """Study guides, box sets and the like never make good recommendations."""
    title = book.get("title") or ""
    return not title or bool(_JUNK_TITLE.search(title))


# ─── Open Library ────────────────────────────────────────────────────────────


def ol_doc_to_book(doc, lang="es"):
    wanted = LANG_CODES.get(lang)
    edition = None
    eds = (doc.get("editions") or {}).get("docs") or []
    if eds:
        edition = eds[0]
    use_edition = bool(edition) and (wanted is None or wanted in (edition.get("language") or []))

    title = (edition.get("title") if use_edition else None) or doc.get("title") or ""
    subtitle = (edition.get("subtitle") if use_edition else None) or doc.get("subtitle") or ""
    cover_id = (edition.get("cover_i") if use_edition else None) or doc.get("cover_i")
    isbn13, isbn10 = _pick_isbns((edition or {}).get("isbn"))
    publisher = _first((edition or {}).get("publisher")) or _first(doc.get("publisher")) or ""
    published = _first((edition or {}).get("publish_date")) or ""
    pages = (edition or {}).get("number_of_pages") if use_edition else None
    language = ""
    if use_edition and wanted:
        language = lang
    elif edition and edition.get("language"):
        language = {"spa": "es", "eng": "en"}.get(edition["language"][0], edition["language"][0])

    work_key = (doc.get("key") or "").replace("/works/", "")
    first_sentence = _first(doc.get("first_sentence")) or ""
    cover_alt = OL_COVER.format(doc["cover_i"]) if doc.get("cover_i") and doc.get("cover_i") != cover_id else ""
    book = {
        "id": f"ol:{work_key}",
        "source": "openlibrary",
        "olWorkKey": work_key,
        "olEditionKey": ((edition or {}).get("key") or "").replace("/books/", ""),
        "googleId": None,
        "title": clean_title(title),
        "subtitle": clean_title(subtitle) if subtitle else "",
        "authors": list(dict.fromkeys(doc.get("author_name") or []))[:4],
        "authorKeys": (doc.get("author_key") or [])[:4],
        "description": "",
        "firstSentence": first_sentence,
        "publisher": publisher,
        "publishedDate": published or (str(doc.get("first_publish_year")) if doc.get("first_publish_year") else ""),
        "year": doc.get("first_publish_year") or _year(published),
        "pageCount": pages or doc.get("number_of_pages_median") or None,
        "isbn13": isbn13,
        "isbn10": isbn10,
        "language": language,
        "categories": (doc.get("subject") or [])[:40],
        "coverUrl": OL_COVER.format(cover_id) if cover_id else (OL_COVER_ISBN.format(isbn13) if isbn13 else ""),
        "coverAltUrl": cover_alt,
        "rating": round(doc["ratings_average"], 2) if doc.get("ratings_average") else None,
        "ratingsCount": doc.get("ratings_count") or 0,
        "popularity": doc.get("readinglog_count") or 0,
        "editionCount": doc.get("edition_count") or 0,
    }
    return finalize(book)


def ol_search(q=None, lang="es", limit=20, sort=None, page=1, ttl=3 * 24 * 3600, **filters):
    params = {"fields": OL_FIELDS, "limit": limit, "lang": lang if lang in LANG_CODES else None,
              "sort": sort, "page": page if page and page > 1 else None}
    if q:
        params["q"] = q
    params.update({k: v for k, v in filters.items() if v})
    data = http_client.get_json(f"{OL}/search.json", params, ttl=ttl, timeout=10)
    docs = (data or {}).get("docs") or []
    return [ol_doc_to_book(d, lang) for d in docs if d.get("title")]


def ol_work(work_key, ttl=30 * 24 * 3600):
    return http_client.get_json(f"{OL}/works/{work_key}.json", ttl=ttl, timeout=12)


def ol_edition(edition_key, ttl=30 * 24 * 3600):
    return http_client.get_json(f"{OL}/books/{edition_key}.json", ttl=ttl, timeout=12)


def ol_author(author_key, ttl=60 * 24 * 3600):
    return http_client.get_json(f"{OL}/authors/{author_key}.json", ttl=ttl, timeout=10)


def ol_isbn(isbn, ttl=30 * 24 * 3600):
    return http_client.get_json(f"{OL}/isbn/{isbn}.json", ttl=ttl, timeout=12)


def ol_text(value):
    if isinstance(value, dict):
        value = value.get("value")
    return strip_html(value or "")


def clean_ol_description(text):
    """OL descriptions often carry markdown links and source footers."""
    if not text:
        return ""
    text = re.split(r"\n\s*(?:-{3,}|\*{3,})\s*\n", text)[0]
    text = re.sub(r"\[([^\]]+)\]\[\d+\]", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\((?:https?://)[^)]+\)", r"\1", text)
    text = re.sub(r"^\s*\[\d+\]:\s*\S+\s*$", "", text, flags=re.M)
    text = re.sub(r"\(\[source\]\[\d+\]\)", "", text)
    text = re.sub(r"\(source:[^)]*\)", "", text, flags=re.I)
    text = re.sub(r"^\s*from wikipedia:?\s*", "", text, flags=re.I)
    text = re.sub(r"\\([\[\]_*()#])", r"\1", text)  # markdown escapes
    text = re.sub(r";?\s*IPA:\s*\[[^\]]*\]", "", text)  # pronunciation guides
    text = re.sub(r"\[\d+\]", "", text)  # citation markers
    text = re.sub(r"(?<![\w*])\*{1,2}([^*\n]+?)\*{1,2}(?![\w*])", r"\1", text)  # *emphasis*
    text = re.sub(r"([a-z\d])\.(\d{1,2})(\s+[A-ZÁÉÍÓÚ])", r"\1.\3", text)  # footnote digits after a full stop
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def ol_author_search(q, limit=8):
    data = http_client.get_json(
        f"{OL}/search/authors.json",
        {"q": q, "limit": max(limit * 2, 10),
         "fields": "key,name,top_work,work_count,readinglog_count,top_subjects,birth_date,death_date"},
        ttl=7 * 24 * 3600,
        timeout=12,
    )
    docs = (data or {}).get("docs") or []
    docs.sort(key=lambda d: -((d.get("readinglog_count") or 0) * 3 + (d.get("work_count") or 0)))
    out, seen = [], set()
    for d in docs:
        name = d.get("name")
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        out.append(
            {
                "key": d.get("key"),
                "name": name,
                "topWork": d.get("top_work") or "",
                "workCount": d.get("work_count") or 0,
                "photo": OL_AUTHOR_PHOTO.format(d["key"]) if d.get("key") else "",
                "lifespan": " – ".join(x for x in [d.get("birth_date"), d.get("death_date")] if x),
            }
        )
        if len(out) >= limit:
            break
    return out


# ─── Google Books ────────────────────────────────────────────────────────────


def google_enabled():
    return http_client.breaker_status("www.googleapis.com") is None


def _gb_cover(volume_id, has_image):
    if not has_image:
        return ""
    return (
        f"https://books.google.com/books/content?id={volume_id}"
        "&printsec=frontcover&img=1&zoom=1&fife=w600&source=gbs_api"
    )


def gb_item_to_book(item):
    info = item.get("volumeInfo") or {}
    ids = [i.get("identifier") for i in info.get("industryIdentifiers") or []]
    isbn13, isbn10 = _pick_isbns(ids)
    links = info.get("imageLinks") or {}
    cover = _gb_cover(item.get("id"), bool(links))
    published = info.get("publishedDate") or ""
    book = {
        "id": f"gb:{item.get('id')}",
        "source": "google",
        "olWorkKey": None,
        "olEditionKey": None,
        "googleId": item.get("id"),
        "title": clean_title(info.get("title") or ""),
        "subtitle": info.get("subtitle") or "",
        "authors": (info.get("authors") or [])[:4],
        "authorKeys": [],
        "description": strip_html(info.get("description") or ""),
        "firstSentence": "",
        "publisher": info.get("publisher") or "",
        "publishedDate": published,
        "year": _year(published),
        "pageCount": info.get("pageCount") or None,
        "isbn13": isbn13,
        "isbn10": isbn10,
        "language": info.get("language") or "",
        "categories": info.get("categories") or [],
        "coverUrl": cover or (OL_COVER_ISBN.format(isbn13) if isbn13 else ""),
        "coverAltUrl": OL_COVER_ISBN.format(isbn13) if (cover and isbn13) else "",
        "rating": info.get("averageRating"),
        "ratingsCount": info.get("ratingsCount") or 0,
        "popularity": info.get("ratingsCount") or 0,
        "editionCount": 0,
    }
    return finalize(book)


def _gb_params(extra):
    params = dict(extra)
    if config.GOOGLE_BOOKS_API_KEY:
        params["key"] = config.GOOGLE_BOOKS_API_KEY
    return params


def gb_search(q, lang="es", limit=20, order="relevance", ttl=3 * 24 * 3600):
    params = _gb_params(
        {
            "q": q,
            "maxResults": min(limit, 40),
            "printType": "books",
            "orderBy": order,
            "langRestrict": lang if lang in LANG_CODES else None,
        }
    )
    data = http_client.get_json(GB, params, ttl=ttl, timeout=9, cache_key_exclude=("key",))
    return [gb_item_to_book(i) for i in (data or {}).get("items") or [] if (i.get("volumeInfo") or {}).get("title")]


def gb_volume(volume_id, ttl=30 * 24 * 3600):
    data = http_client.get_json(f"{GB}/{volume_id}", _gb_params({}), ttl=ttl, timeout=9, cache_key_exclude=("key",))
    return gb_item_to_book(data) if data and data.get("volumeInfo") else None


__all__ = [
    "SourceUnavailable",
    "ol_search",
    "ol_work",
    "ol_edition",
    "ol_isbn",
    "ol_text",
    "clean_ol_description",
    "ol_author_search",
    "gb_search",
    "gb_volume",
    "google_enabled",
    "finalize",
    "is_junk",
    "OL_COVER",
    "OL_COVER_ISBN",
]
