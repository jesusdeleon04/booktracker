"""
Content-based recommendation engine.

Pipeline for every shelf of recommendations:

  1. Plan   – decide which real catalog queries express the shelf's intent
              (top genres, recurring themes, an anchor book, an author…).
  2. Fetch  – run them against Open Library / Google Books in parallel (cached).
  3. Filter – drop books already in the library, dismissed ones, study guides
              and books without a cover.
  4. Score  – compare each candidate with the reader's `Taste`:
              genre affinity, theme affinity, subject/keyword cosine similarity,
              author affinity, preference fit (length, era, pace…), quality,
              minus negative signals. Some shelves re-weight these (e.g.
              "Fuera de tu zona de confort" ignores genre affinity on purpose).
  5. Diversify – limit repeated authors and genres.
  6. Explain – build human reasons from the strongest matching signals.

Everything recommended comes from the APIs: titles are never invented. The
scorer is a pure function of (candidate, taste), so it can be swapped for a
learned model later without touching the routes or the UI.
"""
import math
import threading
import time

from . import catalog, sources
from .taste import cosine, preference_fit
from .taxonomy import (
    FICTION_GENRES,
    GENRE_BY_KEY,
    MOOD_BY_KEY,
    PURPOSES,
    THEME_BY_KEY,
    genre_label,
    theme_label,
)
from .text import author_key, fold, is_latin, keywords, same_author, subject_terms, truncate

SECTION_SIZE = 12
_cache = {}
_cache_lock = threading.Lock()
_CACHE_TTL = 30 * 60

_GENERIC_TERM_PARTS = ("literature", "language", "translations", "criticism", "works", "readers", "fiction general",
                       "publication type", "staff picks", "accessible", "lending", "in library", "protected")
_THEME_NEEDLES = {fold(n) for t in THEME_BY_KEY.values() for n in t["match"]}
_GENRE_NEEDLES = {fold(n) for g in GENRE_BY_KEY.values() for n in g["strong"]}


# ─── retrieval helpers ───────────────────────────────────────────────────────


def _subj(term):
    return f'subject:"{term}"'


# Popular-in-subject lists on Open Library are dominated by self-help for some
# shelves ("philosophy" -> "How to Win Friends"). Exclusions keep them honest.
_GENRE_EXCLUDE = {
    "filosofia": ["self-help", "success", "business", "personal development"],
    "psicologia": ["self-help", "success", "business", "erotic", "fiction"],
    "ciencia": ["self-help", "fiction", "juvenile literature"],
    "historia": ["fiction", "juvenile literature"],
    "biografias": ["fiction", "juvenile literature"],
    "contemporanea": ["self-help", "juvenile fiction"],
    "clasicos": ["juvenile fiction", "self-help"],
}


def _genre_q(key):
    q = _subj(GENRE_BY_KEY[key]["query"])
    for ex in _GENRE_EXCLUDE.get(key, []):
        q += f' -subject:"{ex}"'
    return q


def _ol(q, lang, sort="readinglog", page=1, limit=40):
    return (sources.ol_search, (), {"q": q, "lang": lang, "limit": limit, "sort": sort, "page": page})


def _gb(q, lang, limit=30):
    return (sources.gb_search, (q,), {"lang": lang, "limit": limit})


def _fetch(calls):
    results = catalog.run_parallel(calls)
    return catalog.merge_lists(*[r or [] for r in results])


def _eligible(book, taste, exclude=()):
    if not book.get("coverUrl") or sources.is_junk(book):
        return False
    if taste.is_known(book) or book.get("id") in taste.dismissed:
        return False
    if book.get("dedupeKey") in exclude:
        return False
    if taste.lang in ("es", "en") and not is_latin(book.get("title")):
        return False
    return True


def _features(book):
    terms = book.get("terms") or subject_terms(book.get("categories"))
    vec = {t: 1.0 for t in terms[:30]}
    for kw in keywords(book.get("description", ""), 12):
        vec[kw] = vec.get(kw, 0.0) + 0.35
    return vec


def _quality(book):
    pop = min(1.0, math.log10((book.get("popularity") or 0) + 1) / 3.6)
    rating = book.get("rating")
    rpart = 0.0
    if rating and (book.get("ratingsCount") or 0) >= 5:
        rpart = max(-1.0, min(1.0, (rating - 3.4) / 1.3))
    return 0.65 * pop + 0.35 * rpart


# ─── scoring ─────────────────────────────────────────────────────────────────


def score_book(book, taste):
    """Profile score in ~[-0.6, 1.1] plus the component breakdown."""
    vec = _features(book)
    genres = book.get("genres") or []
    gmax = max([v for v in taste.genre_w.values() if v > 0] or [1.0])
    pos_w = (1.0, 0.7, 0.5)
    g = 0.0
    if genres:
        g = sum(max(0.0, taste.genre_w.get(k, 0.0)) / gmax * w for k, w in zip(genres, pos_w))
        g /= sum(pos_w[: len(genres[:3])])
    tmax = max([v for v in taste.theme_w.values() if v > 0] or [1.0])
    th_list = sorted((max(0.0, taste.theme_w.get(k, 0.0)) / tmax for k in book.get("themes") or []), reverse=True)[:2]
    th = sum(th_list) / 2 if th_list else 0.0
    terms_sim = min(1.0, cosine(vec, taste.term_w) * 3.5)
    amax = max([v for v in taste.author_w.values() if v > 0] or [1.0])
    a = max([max(0.0, taste.author_w.get(author_key(x), 0.0)) / amax for x in book.get("authors") or []] or [0.0])
    pf, pnotes = preference_fit(book, taste.prefs)
    q = _quality(book)
    neg = min(1.0, sum(taste.neg_terms.get(t, 0.0) for t in vec) / 3.0)
    neg += max([taste.neg_authors.get(author_key(x), 0.0) for x in book.get("authors") or []] or [0.0])
    s = 0.28 * g + 0.20 * th + 0.27 * terms_sim + 0.12 * a + 0.07 * pf + 0.06 * q - 0.35 * neg
    if book.get("juvenile") and "crecer" not in taste.top_themes(3):
        s -= 0.15
    comps = {"genre": g, "theme": th, "terms": terms_sim, "author": a, "pref": pf, "prefNotes": pnotes,
             "quality": q, "neg": neg}
    return s, comps


def _specific_terms(terms, taste, n=3):
    """Pick the most telling subjects of a book (themes/genre labels first)."""
    scored = []
    for pos, t in enumerate(terms[:40]):
        if any(part in t for part in _GENERIC_TERM_PARTS) and t not in _GENRE_NEEDLES:
            continue
        if len(t) < 4 or len(t.split()) > 4:
            continue
        s = 0.0
        if t in _THEME_NEEDLES:
            s += 2
        if t in _GENRE_NEEDLES:
            s += 1.5
        s += min(1.0, max(0.0, taste.term_w.get(t, 0.0)) / 3)
        s += 0.5 if pos < 10 else 0
        scored.append((s, pos, t))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [t for _, _, t in scored[:n]]


def anchor_similarity(book, anchor):
    a_terms = anchor["terms"]
    b_terms = set(book.get("terms") or subject_terms(book.get("categories")))
    shared_terms = a_terms & b_terms
    term_sim = len(shared_terms) / math.sqrt(max(1, len(a_terms)) * max(1, len(b_terms))) if a_terms and b_terms else 0
    shared_themes = [t for t in book.get("themes") or [] if t in (anchor.get("themes") or [])]
    shared_genres = [g for g in book.get("genres") or [] if g in (anchor.get("genres") or [])]
    sim = min(1.0, term_sim * 2.2) * 0.5 + min(1.0, len(shared_themes) / 2) * 0.3 + min(1.0, len(shared_genres) / 2) * 0.2
    a_fiction = bool(set(anchor.get("genres") or []) & FICTION_GENRES)
    b_fiction = bool(set(book.get("genres") or []) & FICTION_GENRES)
    if anchor.get("genres") and book.get("genres"):
        sim += 0.08 if a_fiction == b_fiction else -0.12
    return sim, shared_themes, shared_genres, shared_terms


# ─── explanations ────────────────────────────────────────────────────────────


def _join(labels):
    labels = [l for l in labels if l]
    if len(labels) <= 1:
        return "".join(labels)
    return ", ".join(labels[:-1]) + " y " + labels[-1]


def _stars(r):
    if r is None:
        return ""
    return (f"{r:.1f}".rstrip("0").rstrip(".")).replace(".", ",") + "★"


def explain(book, comps, taste, lead=None):
    reasons = []  # (priority, text)
    if lead:
        reasons.append((10, lead))
    authors = book.get("authors") or []
    fav_keys = {author_key(a): a for a in taste.favorite_authors}
    lib_by_author = {}
    for pb in taste.positive_books:
        for a in pb["authors"]:
            lib_by_author.setdefault(author_key(a), pb)
    for a in authors:
        k = author_key(a)
        if k in fav_keys:
            reasons.append((1.0, f"De {a}, uno de tus autores favoritos."))
            break
        if k in lib_by_author:
            pb = lib_by_author[k]
            verb = "estás leyendo" if pb["status"] == "reading" else "leíste"
            reasons.append((0.9, f"Otra obra de {a}: ya {verb} «{pb['title']}»."))
            break

    best = None
    for pb in taste.positive_books[:25]:
        sim, themes, genres, terms = anchor_similarity(book, pb)
        if sim > 0.18 and (best is None or sim * pb["weight"] > best[0]):
            best = (sim * pb["weight"], pb, themes, genres, terms)
    if best:
        _, pb, themes, genres, terms = best
        shared = [theme_label(t).lower() for t in themes[:2]] or [genre_label(g).lower() for g in genres[:2]]
        if pb.get("rating"):
            tail = f"que calificaste con {_stars(pb['rating'])}"
        elif pb["status"] == "reading":
            tail = "que estás leyendo"
        else:
            tail = "que ya leíste"
        if shared:
            reasons.append((0.85, f"Comparte {_join(shared)} con «{pb['title']}», {tail}."))
        else:
            reasons.append((0.7, f"Tiene mucho en común con «{pb['title']}», {tail}."))
    elif taste.liked_items:
        b_terms = set(book.get("terms") or [])
        for it in taste.liked_items:
            if len(b_terms & set(it.get("terms") or [])) >= 3:
                reasons.append((0.6, f"Se parece a «{it.get('title')}», que te llamó la atención."))
                break

    genres = book.get("genres") or []
    for gk in genres[:2]:
        count = taste.library_genre_counts.get(gk, 0)
        if count >= 2:
            reasons.append((0.5, f"Has leído {count} libros de {genre_label(gk).lower()}: es terreno conocido para ti."))
            break
        if gk in taste.onboarding_genres:
            reasons.append((0.45, f"Encaja con tu interés por {genre_label(gk).lower()}."))
            break

    themes = [t for t in book.get("themes") or [] if taste.theme_w.get(t, 0) > 0]
    if themes:
        labels = [theme_label(t).lower() for t in themes[:2]]
        reasons.append((0.55 * comps.get("theme", 0.5) + 0.2,
                        f"Explora {_join(labels)}, {'un tema que' if len(labels) == 1 else 'temas que'} te interesa{'' if len(labels) == 1 else 'n'}."))

    for p in taste.purposes:
        spec = PURPOSES.get(p)
        if spec and (set(genres) & set(spec["genres"]) or set(book.get("themes") or []) & set(spec["themes"])):
            verb = {"pensar": "pensar", "sentir": "sentir", "aprender": "aprender", "escapar": "escapar de la realidad"}[p]
            reasons.append((0.42, f"Pensado para {verb}, justo lo que buscas en un libro."))
            break

    pages = book.get("pageCount")
    year = book.get("year")
    for axis, aligned in comps.get("prefNotes") or []:
        if not aligned:
            continue
        if axis == "length" and pages:
            text = f"Lectura breve ({pages} págs.), como prefieres." if pages < 230 else f"Extenso ({pages} págs.) para perderte en él, como te gusta."
        elif axis == "era" and year:
            text = f"Un clásico de {year}, como te gustan." if year < 1950 else f"Publicado en {year}: una voz contemporánea."
        elif axis == "pace":
            text = "Introspectivo y pausado, a tu ritmo." if taste.prefs.get("pace", 0) < 0 else "Con ritmo y acción, como te gusta."
        elif axis == "focus":
            text = "Centrado en sus personajes, como prefieres." if taste.prefs.get("focus", 0) < 0 else "Con una trama que engancha, como prefieres."
        elif axis == "complexity":
            text = "Exigente y con capas, como te gustan." if taste.prefs.get("complexity", 0) > 0 else "Fluido y accesible, como prefieres."
        else:
            continue
        reasons.append((0.4, text))
        break

    if book.get("rating") and book.get("rating") >= 4 and (book.get("ratingsCount") or 0) >= 15:
        reasons.append((0.3, f"Los lectores de Open Library le dan {_stars(round(book['rating'], 1))} de media."))
    elif (book.get("popularity") or 0) >= 1500:
        reasons.append((0.25, f"Está en las listas de más de {int(book['popularity']) // 100 * 100:,} lectores.".replace(",", ".")))

    reasons.sort(key=lambda r: -r[0])
    seen, out = set(), []
    for _, text in reasons:
        if text not in seen:
            seen.add(text)
            out.append(text)
    if not out:
        out.append("Coincide con el perfil de lectura que has construido.")
    return out[:3]


# ─── ranking ─────────────────────────────────────────────────────────────────


def _rank(pool, taste, scorer, lead_fn=None, max_per_author=2, size=SECTION_SIZE, exclude=(), genre_penalty=0.04,
          group_fn=None):
    scored = []
    for b in pool:
        if not _eligible(b, taste, exclude):
            continue
        s, comps = scorer(b)
        if s is None:
            continue
        scored.append((s, b, comps))
    scored.sort(key=lambda x: -x[0])

    picked, author_count, genre_count, titles = [], {}, {}, set()
    for s, b, comps in scored:
        a = author_key((b.get("authors") or [""])[0])
        if author_count.get(a, 0) >= max_per_author:
            continue
        tkey = fold(b.get("title"))[:40]
        if tkey in titles:
            continue
        g = (b.get("genres") or ["_"])[0]
        adjusted = s - genre_penalty * genre_count.get(g, 0)
        picked.append((adjusted, s, b, comps))
        author_count[a] = author_count.get(a, 0) + 1
        genre_count[g] = genre_count.get(g, 0) + 1
        titles.add(tkey)
        if len(picked) >= size * 2:
            break
    picked.sort(key=lambda x: -x[0])
    if group_fn:
        # Round-robin across groups (e.g. one adjacent genre after another).
        groups = {}
        for entry in picked:
            groups.setdefault(group_fn(entry[2]), []).append(entry)
        order = sorted(groups, key=lambda k: -groups[k][0][0])
        interleaved = []
        while len(interleaved) < size and any(groups.values()):
            for k in order:
                if groups[k]:
                    interleaved.append(groups[k].pop(0))
        picked = interleaved
    picked = picked[:size]
    books = [b for _, _, b, _ in picked]
    catalog.describe_many(books, limit=size)
    out = []
    for _, s, b, comps in picked:
        lead = lead_fn(b, comps) if lead_fn else None
        out.append(_public(b, s, explain(b, comps, taste, lead)))
    return out


def _public(book, score, reasons):
    desc = book.get("description") or ""
    if not desc:
        desc = _derived_description(book)
    return {
        "id": book["id"],
        "source": book.get("source"),
        "olWorkKey": book.get("olWorkKey"),
        "googleId": book.get("googleId"),
        "title": book.get("title"),
        "subtitle": book.get("subtitle") or "",
        "authors": book.get("authors") or [],
        "description": truncate(desc, 900),
        "descriptionDerived": not book.get("description"),
        "publisher": book.get("publisher") or "",
        "publishedDate": book.get("publishedDate") or "",
        "year": book.get("year"),
        "pageCount": book.get("pageCount"),
        "isbn13": book.get("isbn13") or "",
        "isbn10": book.get("isbn10") or "",
        "language": book.get("language") or "",
        "categories": (book.get("categories") or [])[:20],
        "genres": book.get("genres") or [],
        "themes": book.get("themes") or [],
        "coverUrl": book.get("coverUrl") or "",
        "coverAltUrl": book.get("coverAltUrl") or "",
        "rating": book.get("rating"),
        "ratingsCount": book.get("ratingsCount") or 0,
        "popularity": book.get("popularity") or 0,
        "dedupeKey": book.get("dedupeKey"),
        "score": round(score, 4),
        "reasons": reasons,
    }


def _derived_description(book):
    """When the APIs have no synopsis, describe the book from its own metadata."""
    parts = []
    g = [genre_label(k) for k in (book.get("genres") or [])[:2]]
    if g:
        parts.append(_join(g))
    else:
        parts.append("Obra")
    if book.get("year"):
        parts.append(f"publicada por primera vez en {book['year']}")
    themes = [theme_label(t).lower() for t in (book.get("themes") or [])[:3]]
    text = " ".join(parts)
    if themes:
        text += f" que gira en torno a {_join(themes)}"
    if book.get("firstSentence"):
        text += f". Empieza así: «{truncate(book['firstSentence'], 160)}»"
    return text + "."


# ─── sections ────────────────────────────────────────────────────────────────


def _anchors(taste, n=2):
    out = []
    for pb in taste.positive_books:
        if pb["status"] == "want":
            continue
        if pb.get("rating") is not None and pb["rating"] < 4:
            continue
        out.append({"key": f"because:{pb['id']}", "title": pb["title"], "anchor": pb})
        if len(out) >= n:
            return out
    for it in taste.liked_items:
        if it.get("kind") in ("love", "like"):
            out.append({
                "key": f"because:item:{it['itemId']}",
                "title": it.get("title"),
                "anchor": {"title": it.get("title"), "terms": set(it.get("terms") or []),
                           "themes": [], "genres": it.get("genres") or [], "authors": it.get("authors") or [],
                           "rating": None, "status": "liked", "weight": 1.0},
            })
            if len(out) >= n:
                break
    return out


def _authors(taste, n=2):
    names = []
    for a in taste.favorite_authors:
        if a not in names:
            names.append(a)
    if len(names) < n:
        counts = {}
        for pb in taste.positive_books:
            for a in pb["authors"][:1]:
                counts[a] = counts.get(a, 0) + pb["weight"]
        for a, _ in sorted(counts.items(), key=lambda kv: -kv[1]):
            if a not in names:
                names.append(a)
    return names[:n]


def plan(taste):
    """Ordered list of shelves for the Discover page (no network calls)."""
    sections = [{"key": "for-you", "title": "Pensando en ti",
                 "subtitle": "Escogidos según tu perfil, lo que has leído y cómo lo has valorado."}]
    anchors = _anchors(taste)
    authors = _authors(taste)
    if anchors:
        a = anchors[0]
        sections.append({"key": a["key"], "title": f"Porque te gustó «{a['title']}»",
                         "subtitle": "Comparten con él temas, tono o ambiente."})
    if authors:
        sections.append({"key": f"author:{authors[0]}", "title": f"Si te interesa {authors[0]}",
                         "subtitle": "Más de su obra que aún no está en tu biblioteca."})
    sections.append({"key": "unexpected", "title": "Un paso al lado",
                     "subtitle": "Géneros vecinos a los tuyos, con temas que ya te atraen."})
    sections.append({"key": "classics", "title": "Clásicos que quizá te hablen",
                     "subtitle": "Obras que han resistido el tiempo, filtradas por tu gusto."})
    if len(anchors) > 1:
        a = anchors[1]
        sections.append({"key": a["key"], "title": f"Porque te gustó «{a['title']}»",
                         "subtitle": "Más libros en su misma línea."})
    sections.append({"key": "comfort", "title": "Lejos de lo habitual",
                     "subtitle": "Un salto medido: distinto de lo que sueles leer, pero cerca de lo que valoras."})
    if len(authors) > 1:
        sections.append({"key": f"author:{authors[1]}", "title": f"Si te interesa {authors[1]}",
                         "subtitle": "Más de su obra que aún no está en tu biblioteca."})
    return sections


def _cached(key, taste, seed, builder):
    ck = (key, taste.signature, seed, taste.lang)
    now = time.time()
    with _cache_lock:
        hit = _cache.get(ck)
        if hit and now - hit[0] < _CACHE_TTL:
            return hit[1]
    value = builder()
    with _cache_lock:
        _cache[ck] = (now, value)
        if len(_cache) > 200:
            for k, _ in sorted(_cache.items(), key=lambda kv: kv[1][0])[:50]:
                _cache.pop(k, None)
    return value


def build_section(key, taste, seed=0, anchor_book=None):
    meta = next((s for s in plan(taste) if s["key"] == key), None)

    def run():
        if key == "for-you":
            items = _for_you(taste, seed)
        elif key.startswith("because:"):
            items = _because(key, taste, seed, anchor_book)
        elif key.startswith("author:"):
            items = _by_author(key[7:], taste)
        elif key == "unexpected":
            items = _unexpected(taste, seed)
        elif key == "classics":
            items = _classics(taste, seed)
        elif key == "comfort":
            items = _comfort(taste, seed)
        else:
            items = []
        return items

    items = _cached(key, taste, seed, run)
    out = dict(meta or {"key": key, "title": "", "subtitle": ""})
    out["items"] = items
    return out


def _profile_scorer(taste):
    return lambda b: score_book(b, taste)


def _for_you(taste, seed):
    lang = taste.lang
    genres = taste.top_genres(3) or ["contemporanea", "clasicos", "ciencia-ficcion"]
    terms = _specific_terms(taste.top_terms(12), taste, 2)
    page = 1 + seed % 3
    calls = [_ol(_genre_q(g), lang, page=page) for g in genres]
    calls += [_ol(_subj(t), lang, sort=None) for t in terms]
    for th in taste.top_themes(1):
        calls.append(_ol(_subj(THEME_BY_KEY[th]["match"][0]), lang, page=page))
    if sources.google_enabled():
        calls.append(_gb(f"subject:{GENRE_BY_KEY[genres[0]]['query']}", lang))
    pool = _fetch(calls)
    return _rank(pool, taste, _profile_scorer(taste), max_per_author=1)


def _resolve_anchor(key, taste, anchor_book):
    if anchor_book is not None:
        return anchor_book
    ref = key[len("because:"):]
    for a in _anchors(taste, n=10):
        if a["key"] == key:
            return a["anchor"]
    if ref.isdigit():
        for pb in taste.positive_books:
            if str(pb["id"]) == ref:
                return pb
    return None


def anchor_from_book(book):
    terms = book.get("terms") or subject_terms(book.get("categories"))
    return {"id": book.get("id"), "title": book.get("title"), "terms": set(terms), "termList": terms,
            "themes": book.get("themes") or [], "genres": book.get("genres") or [],
            "authors": book.get("authors") or [], "rating": book.get("rating"),
            "status": book.get("status") or "", "weight": 1.0, "dedupeKey": book.get("dedupeKey")}


def _because(key, taste, seed, anchor_book=None):
    anchor = _resolve_anchor(key, taste, anchor_book)
    if not anchor:
        return []
    lang = taste.lang
    term_list = anchor.get("termList") or sorted(anchor["terms"])
    terms = _specific_terms(term_list, taste, 3)
    calls = [_ol(_subj(t), lang, sort=None if i else "readinglog") for i, t in enumerate(terms)]
    for th in (anchor.get("themes") or [])[:2]:
        calls.append(_ol(_subj(THEME_BY_KEY[th]["match"][0]), lang))
    if anchor.get("genres"):
        calls.append(_ol(_genre_q(anchor["genres"][0]), lang, page=1 + seed % 2))
    if sources.google_enabled() and terms:
        calls.append(_gb(f"subject:{terms[0]}", lang))
    pool = _fetch(calls)
    exclude = {anchor.get("dedupeKey")} if anchor.get("dedupeKey") else set()
    anchor_title = fold(anchor.get("title"))

    def scorer(b):
        if fold(b.get("title")) == anchor_title:
            return None, None
        sim, _, _, _ = anchor_similarity(b, anchor)
        s, comps = score_book(b, taste)
        return 0.6 * sim + 0.4 * s, comps

    def lead(b, comps):
        sim, themes, genres, shared_terms = anchor_similarity(b, anchor)
        shared = [theme_label(t).lower() for t in themes[:2]] or [genre_label(g).lower() for g in genres[:2]]
        if shared:
            return f"Como «{anchor['title']}», habla de {_join(shared)}."
        return None

    return _rank(pool, taste, scorer, lead, max_per_author=1, exclude=exclude)


def _by_author(name, taste):
    lang = taste.lang
    ol_key = taste.favorite_author_ids.get(name)
    if not ol_key:
        try:
            found = sources.ol_author_search(name, limit=1)
            if found and same_author(found[0]["name"], name):
                ol_key = found[0]["key"]
        except sources.SourceUnavailable:
            pass
    calls = [_ol(f"author_key:{ol_key}" if ol_key else f'author:"{name}"', lang, limit=50)]
    if sources.google_enabled():
        calls.append(_gb(f'inauthor:"{name}"', lang))
    pool = _fetch(calls)
    pool = [b for b in pool if (ol_key and ol_key in (b.get("authorKeys") or []))
            or any(same_author(a, name) for a in b.get("authors") or [])]

    def scorer(b):
        s, comps = score_book(b, taste)
        return 0.5 * s + 0.5 * _quality(b), comps

    def lead(b, comps):
        if b.get("year"):
            return f"Otra obra de {name}, publicada en {b['year']}."
        return f"Otra obra de {name}."

    return _rank(pool, taste, scorer, lead, max_per_author=SECTION_SIZE)


def _unexpected(taste, seed):
    lang = taste.lang
    adj = taste.adjacent_unexplored(3) or taste.far_genres(2)
    themes = taste.top_themes(3)
    calls = []
    for i, g in enumerate(adj[:3]):
        gq = GENRE_BY_KEY[g]["query"]
        if themes:
            th = themes[i % len(themes)]
            calls.append(_ol(f'{_subj(gq)} {_subj(THEME_BY_KEY[th]["match"][0])}', lang))
        calls.append(_ol(_subj(gq), lang, sort="rating", page=1 + seed % 2))
    pool = _fetch(calls)
    top = set(taste.top_genres(3))
    adj_set = set(adj)

    def scorer(b):
        genres = set(b.get("genres") or [])
        if not genres & adj_set or genres & top:
            return None, None
        s, comps = score_book(b, taste)
        bridge = 0.5 * comps["theme"] + 0.5 * comps["terms"]
        return 0.45 * bridge + 0.25 * _quality(b) + 0.15 * comps["pref"] + 0.15 * s, comps

    def lead(b, comps):
        g = next((x for x in b.get("genres") or [] if x in adj_set), None)
        themes_shared = [theme_label(t).lower() for t in b.get("themes") or [] if taste.theme_w.get(t, 0) > 0][:2]
        if g and themes_shared:
            return f"{genre_label(g)}: un territorio vecino a tus lecturas que explora {_join(themes_shared)}."
        if g:
            return f"Un desvío hacia {genre_label(g).lower()}, vecino de tus géneros favoritos."
        return None

    def group(b):
        return next((x for x in b.get("genres") or [] if x in adj_set), "_")

    return _rank(pool, taste, scorer, lead, max_per_author=1, genre_penalty=0.12, group_fn=group)


def _classics(taste, seed):
    lang = taste.lang
    genres = taste.top_genres(3) or ["clasicos", "filosofia", "drama"]
    page = 1 + seed % 2
    calls = [_ol(f"{_genre_q(g)} first_publish_year:[* TO 1955]", lang, page=page) for g in genres]
    calls.append(_ol(_subj("classic literature"), lang, page=page))
    for th in taste.top_themes(1):
        calls.append(_ol(f'{_subj("classics")} {_subj(THEME_BY_KEY[th]["match"][0])}', lang))
    pool = _fetch(calls)

    def scorer(b):
        if not b.get("year") or b["year"] >= 1960:
            return None, None
        s, comps = score_book(b, taste)
        return 0.75 * s + 0.25 * _quality(b), comps

    def lead(b, comps):
        g = next((genre_label(x).lower() for x in b.get("genres") or [] if x != "clasicos" and taste.genre_w.get(x, 0) > 0), None)
        if g:
            return f"Un clásico de {b['year']} que dialoga con tu gusto por {g}."
        return f"Publicado en {b['year']} y todavía vigente."

    return _rank(pool, taste, scorer, lead, max_per_author=1)


def _comfort(taste, seed):
    lang = taste.lang
    far = taste.far_genres(3)
    page = 1 + seed % 2
    calls = [_ol(_genre_q(g), lang, page=page) for g in far]
    pool = _fetch(calls)
    far_set = set(far)
    top = set(taste.top_genres(3))

    def scorer(b):
        genres = set(b.get("genres") or [])
        if not genres & far_set or genres & top:
            return None, None
        s, comps = score_book(b, taste)
        bridge = 0.5 * comps["theme"] + 0.5 * comps["terms"]
        return 0.4 * _quality(b) + 0.25 * bridge + 0.2 * max(0.0, comps["pref"]) + 0.15 * s, comps

    def lead(b, comps):
        g = next((x for x in b.get("genres") or [] if x in far_set), None)
        label = genre_label(g).lower() if g else "otro territorio"
        themes_shared = [theme_label(t).lower() for t in b.get("themes") or [] if taste.theme_w.get(t, 0) > 0][:1]
        if themes_shared:
            return f"Un salto hacia {label}, con un puente: {themes_shared[0]}."
        if (b.get("pageCount") or 999) < 230:
            return f"Un salto hacia {label}; es breve, ideal para probar."
        return f"Un salto hacia {label}, uno de los más leídos del género."

    def group(b):
        return next((x for x in b.get("genres") or [] if x in far_set), "_")

    return _rank(pool, taste, scorer, lead, max_per_author=1, genre_penalty=0.12, group_fn=group)


def similar_to(book, taste, seed=0):
    """'Libros similares' for a library book or a catalog item."""
    anchor = anchor_from_book(book)
    key = f"similar:{book.get('id')}"
    items = _cached(key, taste, seed, lambda: _because(key, taste, seed, anchor))
    return items


def explore(kind, key, taste, page=1):
    """Browse by genre, mood or theme — ranked with the reader's taste."""
    lang = taste.lang
    if kind == "genre" and key in GENRE_BY_KEY:
        q = _genre_q(key)
        calls = [_ol(q, lang, page=page), _ol(q, lang, sort="rating", page=page)]
        if sources.google_enabled():
            calls.append(_gb(f"subject:{GENRE_BY_KEY[key]['query']}", lang))
        target_genres, target_themes = {key}, set()
    elif kind == "mood" and key in MOOD_BY_KEY:
        mood = MOOD_BY_KEY[key]
        qs = mood["queries"]
        start = (page - 1) % len(qs)
        picked = [qs[(start + i) % len(qs)] for i in range(3)]
        calls = [_ol(_subj(x), lang, page=1 + (page - 1) // len(qs)) for x in picked]
        target_genres, target_themes = set(mood["genres"]), set(mood["themes"])
    elif kind == "theme" and key in THEME_BY_KEY:
        needles = THEME_BY_KEY[key]["match"][:3]
        calls = [_ol(_subj(n), lang, page=page) for n in needles]
        target_genres, target_themes = set(), {key}
    else:
        return []
    pool = _fetch(calls)

    def scorer(b):
        s, comps = score_book(b, taste)
        fit = 0.0
        if target_genres:
            fit += 0.5 * min(1, len(set(b.get("genres") or []) & target_genres))
        if target_themes:
            fit += 0.5 * min(1, len(set(b.get("themes") or []) & target_themes))
        return 0.45 * s + 0.3 * _quality(b) + 0.25 * fit, comps

    ck = f"explore:{kind}:{key}:{page}"
    return _cached(ck, taste, 0, lambda: _rank(pool, taste, scorer, None, max_per_author=2, size=24))


def onboarding_deck(genres, lang="es", size=16):
    """Recognisable, well-loved books from the chosen genres for the swipe step."""
    genres = [g for g in genres if g in GENRE_BY_KEY][:6] or ["contemporanea", "clasicos", "fantasia"]
    calls = [_ol(_genre_q(g), lang, limit=24) for g in genres]
    results = catalog.run_parallel(calls)
    buckets = []
    for g, res in zip(genres, results):
        good = [b for b in (res or []) if b.get("coverUrl") and not sources.is_junk(b) and not b.get("juvenile")]
        for b in good:
            b["deckGenre"] = g
        buckets.append(good)
    deck, seen = [], set()
    i = 0
    while len(deck) < size and any(buckets):
        bucket = buckets[i % len(buckets)]
        while bucket:
            b = bucket.pop(0)
            k = b["dedupeKey"]
            a = author_key((b.get("authors") or [""])[0])
            if k in seen or a in seen:
                continue
            seen.update({k, a})
            deck.append(b)
            break
        i += 1
        if i > size * 10:
            break
    return [_public(b, 0, []) | {"deckGenre": b.get("deckGenre"), "terms": b.get("terms", [])[:20]} for b in deck]


def genre_covers(lang="es"):
    """Three real covers per genre for the onboarding tiles."""
    keys = list(GENRE_BY_KEY)
    calls = [_ol(_genre_q(g), lang, limit=10) for g in keys]
    results = catalog.run_parallel(calls)
    out = {}
    for g, res in zip(keys, results):
        covers = []
        for b in res or []:
            if b.get("coverUrl") and not sources.is_junk(b) and len(covers) < 3:
                covers.append({"coverUrl": b["coverUrl"], "title": b["title"], "authors": b.get("authors", [])[:1]})
        out[g] = covers
    return out
