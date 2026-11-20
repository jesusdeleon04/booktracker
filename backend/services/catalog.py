"""
Catalog façade: search and enrichment across Open Library and Google Books.

Strategy
* Both sources are queried in parallel; results are merged and de-duplicated.
* Google Books (when a key/quota is available) usually has richer descriptions
  and categories; Open Library has better work-level data, covers and subject
  tags. Whichever answers fills the gaps of the other.
* When Google is rate-limited the circuit breaker skips it and Open Library
  carries the load transparently.
"""
import math
from concurrent.futures import ThreadPoolExecutor

from . import sources
from .sources import SourceUnavailable
from .text import clean_title, fold, is_latin, isbn_digits, looks_like_isbn

_pool = ThreadPoolExecutor(max_workers=12, thread_name_prefix="catalog")


def _safe(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except SourceUnavailable:
        return None
    except Exception as exc:  # never let one source break the other
        print(f"[catalog] {getattr(fn, '__name__', fn)} failed: {exc}")
        return None


def run_parallel(calls):
    """calls: list of (fn, args, kwargs). Returns results in order (None on failure)."""
    futures = [_pool.submit(_safe, fn, *args, **kwargs) for fn, args, kwargs in calls]
    out = []
    for f in futures:
        try:
            out.append(f.result(timeout=30))
        except Exception:
            out.append(None)
    return out


def merge_into(primary, other):
    """Fill empty fields of `primary` with values from `other` (same book)."""
    for field in ("description", "publisher", "publishedDate", "pageCount", "isbn13", "isbn10",
                  "subtitle", "firstSentence", "language", "year"):
        if not primary.get(field) and other.get(field):
            primary[field] = other[field]
    if other.get("year") and primary.get("year") and other["year"] < primary["year"]:
        # The work's first publication year is the meaningful one.
        primary["year"] = other["year"]
    if not primary.get("coverUrl") and other.get("coverUrl"):
        primary["coverUrl"] = other["coverUrl"]
    elif other.get("coverUrl") and not primary.get("coverAltUrl") and other["coverUrl"] != primary.get("coverUrl"):
        primary["coverAltUrl"] = other["coverUrl"]
    # Open Library often has several "works" for one book; the canonical one has
    # far more editions, the real first-publication year and the synopsis.
    if other.get("olWorkKey") and (other.get("editionCount") or 0) > (primary.get("editionCount") or 0) * 1.5:
        primary["olWorkKey"] = other["olWorkKey"]
        if primary.get("source") == "openlibrary":
            primary["id"] = f"ol:{other['olWorkKey']}"
        primary["editionCount"] = other.get("editionCount")
        if other.get("authors") and (not primary.get("authors") or not all(is_latin(a) for a in primary["authors"])):
            primary["authors"] = other["authors"]
            primary["authorKeys"] = other.get("authorKeys") or []
    primary["olWorkKey"] = primary.get("olWorkKey") or other.get("olWorkKey")
    primary["googleId"] = primary.get("googleId") or other.get("googleId")
    cats = list(primary.get("categories") or [])
    for c in other.get("categories") or []:
        if c not in cats:
            cats.append(c)
    primary["categories"] = cats[:50]
    if not primary.get("rating") and other.get("rating"):
        primary["rating"], primary["ratingsCount"] = other["rating"], other.get("ratingsCount", 0)
    primary["popularity"] = max(primary.get("popularity") or 0, other.get("popularity") or 0)
    primary["genres"] = []  # recompute with the merged subjects
    return sources.finalize(primary)


def merge_lists(*lists):
    """
    Merge result lists keeping first-seen order, collapsing duplicates by
    ISBN, title+author, or loose title when one side has a non-Latin author.
    """
    from .text import author_key, loose_key

    merged, index, by_title = [], {}, {}
    for results in lists:
        for book in results or []:
            ak = author_key((book.get("authors") or [""])[0])
            lk = loose_key(book.get("title", ""), book.get("authors") or [])
            title_part = lk.split("|")[0]
            keys = [book["dedupeKey"], lk]
            if book.get("isbn13"):
                keys.append("isbn:" + book["isbn13"])
            hit = next((index[k] for k in keys if k in index), None)
            if hit is None and title_part:
                for idx in by_title.get(title_part, []):
                    other_ak = author_key((merged[idx].get("authors") or [""])[0])
                    if not ak or not other_ak:
                        hit = idx
                        break
            if hit is not None:
                merge_into(merged[hit], book)
                continue
            merged.append(book)
            for k in keys:
                index[k] = len(merged) - 1
            if title_part:
                by_title.setdefault(title_part, []).append(len(merged) - 1)
    return merged


def _rank_for_query(books, query):
    q = fold(query)
    q_tokens = set(q.split())

    def score(pair):
        pos, b = pair
        title = fold(b.get("title"))
        authors = fold(" ".join(b.get("authors") or []))
        s = -pos * 0.6
        if title == q:
            s += 30
        elif title.startswith(q) or q.startswith(title):
            s += 14
        hay = set((title + " " + authors).split())
        s += 3 * len(q_tokens & hay)
        if b.get("coverUrl"):
            s += 4
        if b.get("description"):
            s += 1
        s += 3 * math.log10((b.get("popularity") or 0) + 1)
        return s

    ranked = sorted(enumerate(books), key=score, reverse=True)
    return [b for _, b in ranked]


def _latin_name(name, key):
    if is_latin(name) or not key:
        return name
    data = _safe(sources.ol_author, key) or {}
    for alt in [data.get("personal_name"), data.get("fuller_name"), *(data.get("alternate_names") or [])]:
        if alt and is_latin(alt) and len(alt.split()) >= 2:
            return alt
    return name


def latinize(book, lang="es"):
    """Show 'Fiódor Dostoievski' instead of 'Фёдор Достоевский' to Spanish/English readers."""
    if lang not in ("es", "en") or all(is_latin(a) for a in book.get("authors") or []):
        return book
    keys = book.get("authorKeys") or []
    book["authors"] = [_latin_name(a, keys[i] if i < len(keys) else None) for i, a in enumerate(book["authors"])]
    book["genres"] = book.get("genres") or []
    return sources.finalize(book)


def search(query, lang="es", limit=20):
    query = (query or "").strip()
    if not query:
        return {"items": [], "sources": {}}
    if looks_like_isbn(query):
        return search_isbn(isbn_digits(query), lang)

    ol, gb = run_parallel(
        [
            (sources.ol_search, (query,), {"lang": lang, "limit": max(limit, 20)}),
            (sources.gb_search, (query,), {"lang": lang, "limit": limit}) if sources.google_enabled() else (lambda: None, (), {}),
        ]
    )
    merged = merge_lists(ol or [], gb or [])
    ranked = _rank_for_query(merged, query)[:limit]
    needs = [b for b in ranked[:8] if not all(is_latin(a) for a in b.get("authors") or [])]
    if needs:
        run_parallel([(latinize, (b, lang), {}) for b in needs])
    return {
        "items": ranked,
        "sources": {"openlibrary": ol is not None, "google": gb is not None},
    }


def search_isbn(isbn, lang="es"):
    ol, gb = run_parallel(
        [
            (sources.ol_search, (), {"q": f"isbn:{isbn}", "lang": lang, "limit": 3}),
            (sources.gb_search, (f"isbn:{isbn}",), {"lang": None, "limit": 3}) if sources.google_enabled() else (lambda: None, (), {}),
        ]
    )
    items = merge_lists(gb or [], ol or [])
    if not items or not items[0].get("authors"):
        record = _book_from_isbn_record(isbn)
        if record and not items:
            items = [record]
        elif record and record.get("authors"):
            items[0]["authors"] = record["authors"]
            items[0] = sources.finalize(items[0])
    for b in items:
        if not b.get("isbn13") and len(isbn) == 13:
            b["isbn13"] = isbn
    return {"items": items[:5], "sources": {"openlibrary": ol is not None, "google": gb is not None}}


def _book_from_isbn_record(isbn):
    """Fallback for ISBNs not yet in the OL search index."""
    ed = _safe(sources.ol_isbn, isbn)
    if not ed:
        return None
    work_key = ((ed.get("works") or [{}])[0].get("key") or "").replace("/works/", "")
    work = _safe(sources.ol_work, work_key) if work_key else None
    authors = [c.get("name") for c in ed.get("contributors") or [] if c.get("name")]
    if not authors and ed.get("by_statement"):
        authors = [ed["by_statement"].strip(" .")]
    cover = (ed.get("covers") or [None])[0]
    book = {
        "id": f"ol:{work_key}" if work_key else f"isbn:{isbn}",
        "source": "openlibrary",
        "olWorkKey": work_key or None,
        "olEditionKey": (ed.get("key") or "").replace("/books/", ""),
        "googleId": None,
        "title": clean_title(ed.get("title") or (work or {}).get("title") or ""),
        "subtitle": ed.get("subtitle") or "",
        "authors": authors,
        "authorKeys": [],
        "description": sources.clean_ol_description(sources.ol_text((work or {}).get("description"))),
        "firstSentence": "",
        "publisher": (ed.get("publishers") or [""])[0],
        "publishedDate": ed.get("publish_date") or "",
        "year": sources._year((work or {}).get("first_publish_date") or ed.get("publish_date")),
        "pageCount": ed.get("number_of_pages"),
        "isbn13": isbn if len(isbn) == 13 else "",
        "isbn10": isbn if len(isbn) == 10 else "",
        "language": "",
        "categories": ((work or {}).get("subjects") or [])[:40],
        "coverUrl": sources.OL_COVER.format(cover) if cover and cover > 0 else sources.OL_COVER_ISBN.format(isbn),
        "coverAltUrl": "",
        "rating": None,
        "ratingsCount": 0,
        "popularity": 0,
        "editionCount": 0,
    }
    return sources.finalize(book) if book["title"] else None


def describe(book):
    """Ensure a book has a description (fetching the OL work if needed)."""
    if book.get("description") or not book.get("olWorkKey"):
        return book
    work = _safe(sources.ol_work, book["olWorkKey"])
    if work:
        book["description"] = sources.clean_ol_description(sources.ol_text(work.get("description")))
        if not book.get("categories") and work.get("subjects"):
            book["categories"] = work["subjects"][:40]
            book["genres"] = []
            sources.finalize(book)
    return book


def describe_many(books, limit=12):
    """Fetch missing descriptions for the first `limit` books, in parallel."""
    targets = [b for b in books[:limit] if not b.get("description") and b.get("olWorkKey")]
    if targets:
        run_parallel([(describe, (b,), {}) for b in targets])
    return books


def enrich(book_id, lang="es", hint=None):
    """
    Return the most complete record we can build for a catalog id
    ("ol:OL123W", "gb:abc", "isbn:978..."), combining both sources.
    """
    hint = dict(hint or {})
    if book_id.startswith("gb:"):
        base = _safe(sources.gb_volume, book_id[3:]) or (hint if hint.get("title") else None)
        if not base:
            return None
        isbn = base.get("isbn13") or base.get("isbn10")
        ol_matches = None
        if isbn:
            ol_matches = _safe(sources.ol_search, q=f"isbn:{isbn}", lang=lang, limit=1)
        if not ol_matches and base.get("title") and base.get("authors"):
            ol_matches = _safe(sources.ol_search, lang=lang, limit=1,
                               title=base["title"], author=base["authors"][0])
        if ol_matches:
            other = ol_matches[0]
            if other["dedupeKey"] == base["dedupeKey"] or (isbn and other.get("isbn13") == base.get("isbn13")):
                base = merge_into(base, describe(other))
        return base

    if book_id.startswith("isbn:"):
        found = search_isbn(book_id[5:], lang)["items"]
        return enrich(found[0]["id"], lang, found[0]) if found and not found[0]["id"].startswith("isbn:") else (found[0] if found else None)

    if not book_id.startswith("ol:"):
        return None
    work_key = book_id[3:]
    base = hint if hint.get("title") else None
    if not base:
        results = _safe(sources.ol_search, q=f"key:/works/{work_key}", lang=lang, limit=1)
        base = results[0] if results else None
    work = _safe(sources.ol_work, work_key)
    if not base and not work:
        return None
    if not base:
        base = sources.finalize({
            "id": book_id, "source": "openlibrary", "olWorkKey": work_key, "googleId": None,
            "title": clean_title(work.get("title") or ""), "subtitle": work.get("subtitle") or "",
            "authors": [], "authorKeys": [], "description": "", "firstSentence": "",
            "publisher": "", "publishedDate": work.get("first_publish_date") or "",
            "year": sources._year(work.get("first_publish_date")), "pageCount": None,
            "isbn13": "", "isbn10": "", "language": "", "categories": [],
            "coverUrl": sources.OL_COVER.format(work["covers"][0]) if work.get("covers") and work["covers"][0] > 0 else "",
            "coverAltUrl": "", "rating": None, "ratingsCount": 0, "popularity": 0, "editionCount": 0,
        })
    if work:
        base["description"] = base.get("description") or sources.clean_ol_description(sources.ol_text(work.get("description")))
        subjects = (work.get("subjects") or []) + (work.get("subject_themes") or [])
        if subjects:
            cats = list(base.get("categories") or [])
            for s in subjects:
                if s not in cats:
                    cats.append(s)
            base["categories"] = cats[:50]
            base["genres"] = []
    if not base.get("description"):
        # Duplicate OL work without synopsis: borrow it from the canonical work.
        from .text import loose_key, same_author

        base = latinize(base, lang if lang in ("es", "en") else "es")
        author = (base.get("authors") or [""])[0]
        title_part = loose_key(base["title"], []).split("|")[0]
        surname = author.split()[-1] if author and is_latin(author) else ""
        query = f"{base['title']} {surname}".strip()
        candidates = _safe(sources.ol_search, q=query, lang=lang, limit=10) or []

        def related(c):
            if c.get("olWorkKey") == work_key:
                return False
            if author and is_latin(author):
                return any(same_author(a, author) for a in c.get("authors") or [])
            return loose_key(c.get("title", ""), []).split("|")[0] == title_part

        best = max((c for c in candidates if related(c)), key=lambda c: c.get("editionCount") or 0, default=None)
        if best and (best.get("editionCount") or 0) > (base.get("editionCount") or 0):
            describe(best)
            if best.get("description"):
                base["description"] = best["description"]
            if best.get("year") and (not base.get("year") or best["year"] < base["year"]):
                base["year"] = best["year"]
            if best.get("authors") and not all(is_latin(a) for a in base.get("authors") or []):
                base["authors"] = best["authors"]
            for c in best.get("categories") or []:
                if c not in base["categories"]:
                    base["categories"].append(c)
            base["genres"] = []
    edition_key = base.get("olEditionKey")
    if edition_key and (not base.get("pageCount") or not base.get("publisher")):
        ed = _safe(sources.ol_edition, edition_key)
        if ed:
            base["pageCount"] = base.get("pageCount") or ed.get("number_of_pages")
            base["publisher"] = base.get("publisher") or (ed.get("publishers") or [""])[0]
            base["publishedDate"] = ed.get("publish_date") or base.get("publishedDate")
    # Google can add a description in the reader's language and better categories.
    if sources.google_enabled() and (not base.get("description") or lang == "es"):
        q = f"isbn:{base['isbn13']}" if base.get("isbn13") else None
        if not q and base.get("authors"):
            q = f'intitle:"{base["title"]}" inauthor:"{base["authors"][0]}"'
        gb = _safe(sources.gb_search, q, lang=None, limit=3) if q else None
        for other in gb or []:
            if other["dedupeKey"] == base["dedupeKey"] or (base.get("isbn13") and other.get("isbn13") == base["isbn13"]):
                if lang == "es" and other.get("language") == "es" and other.get("description"):
                    base["description"] = other["description"]
                base = merge_into(base, other)
                break
    return latinize(sources.finalize(base), lang)
