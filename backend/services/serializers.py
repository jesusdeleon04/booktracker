"""Model -> JSON (camelCase) conversion."""
from .taxonomy import detect_themes
from .text import subject_terms


def iso(dt):
    return dt.isoformat() + "Z" if dt else None


def book_to_dict(b, shelf_ids=None):
    terms = subject_terms(b.categories)
    return {
        "id": b.id,
        "title": b.title,
        "subtitle": b.subtitle or "",
        "authors": b.authors or [],
        "description": b.description or "",
        "publisher": b.publisher or "",
        "publishedDate": b.published_date or "",
        "year": b.year,
        "pageCount": b.page_count,
        "isbn13": b.isbn13 or "",
        "isbn10": b.isbn10 or "",
        "language": b.language or "",
        "categories": b.categories or [],
        "genres": b.genres or [],
        "themes": detect_themes(terms, b.description or ""),
        "coverUrl": b.cover_url or "",
        "coverAltUrl": b.cover_alt_url or "",
        "source": b.source or "manual",
        "googleId": b.google_id,
        "olWorkKey": b.ol_work_key,
        "catalogId": (f"ol:{b.ol_work_key}" if b.ol_work_key else (f"gb:{b.google_id}" if b.google_id else None)),
        "dedupeKey": b.dedupe_key,
        "status": b.status,
        "rating": b.rating,
        "startedAt": b.started_at,
        "finishedAt": b.finished_at,
        "currentPage": b.current_page,
        "notes": b.notes or "",
        "review": b.review or "",
        "shelfIds": shelf_ids or [],
        "addedAt": iso(b.added_at),
        "updatedAt": iso(b.updated_at),
    }


def shelf_to_dict(s):
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description or "",
        "color": s.color or "#C9A45C",
        "emoji": s.emoji or "",
        "bookIds": [i.book_id for i in sorted(s.items, key=lambda i: i.added_at or 0, reverse=True)],
        "createdAt": iso(s.created_at),
    }


def profile_to_dict(p):
    return {
        "displayName": p.display_name or "",
        "genres": p.genres or [],
        "preferences": p.preferences or {},
        "favoriteAuthors": p.favorite_authors or [],
        "readingGoal": p.reading_goal or 12,
        "theme": p.theme or "ink",
        "onboarded": p.onboarded_at is not None,
        "onboardedAt": iso(p.onboarded_at),
    }
