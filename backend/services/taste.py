"""
Taste model: turns everything we know about the reader into weighted vectors.

Signals (all optional):
  * onboarding genres, preference axes, purposes and favourite authors
  * library books, weighted by status and personal rating
    (5★ pulls strongly, 1–2★ push away, "quiero leer" is a mild intent signal)
  * onboarding swipes and Discover feedback ("me atrae", "no me interesa")

The resulting `Taste` is a plain object so the recommender (and tests) don't
depend on Flask or the database.
"""
import hashlib
import math
from datetime import date, datetime

from .taxonomy import ADJACENT, GENRE_BY_KEY, GENRES, PURPOSES, THEME_BY_KEY, detect_themes
from .text import author_key, dedupe_key, fold, keywords, loose_key, subject_terms

# Markers used to place a book on the preference axes (-1 .. 1).
COMPLEX = {"philosophical novels", "philosophy", "literary", "literary fiction", "experimental fiction",
           "modernism", "metaphysics", "classics", "philosophical fiction", "stream of consciousness",
           "postmodernism", "epistemology"}
SIMPLE = {"humorous fiction", "humor", "young adult fiction", "cozy mystery", "light fiction", "chick lit",
          "romantic comedy", "juvenile fiction", "easy reading", "feel good"}
INTROSPECTIVE = {"psychological", "psychological fiction", "philosophical novels", "memoir", "poetry",
                 "introspection", "literary fiction", "loneliness", "grief", "existentialism", "diaries",
                 "self perception", "consciousness"}
ACTION = {"adventure", "adventure stories", "thriller", "thrillers", "action and adventure", "suspense",
          "war", "battles", "espionage", "pirates", "survival", "space opera", "military"}
CHARACTER = {"psychological", "psychological fiction", "family", "families", "relationships",
             "man woman relationships", "coming of age", "domestic fiction", "friendship", "character"}
PLOT = {"mystery", "detective and mystery stories", "thriller", "suspense", "adventure stories",
        "plot", "crime", "murder", "espionage", "conspiracies"}


def _rating_weight(status, rating):
    if status == "want":
        return 0.45
    if status == "reading":
        return 0.85 if rating is None else max(0.85, _rating_weight("read", rating))
    if rating is None:
        return 0.8
    if rating >= 5:
        return 1.6
    if rating >= 4.5:
        return 1.4
    if rating >= 4:
        return 1.1
    if rating >= 3.5:
        return 0.65
    if rating >= 3:
        return 0.25
    if rating >= 2:
        return -0.6
    return -1.0


def _recency(book):
    stamp = book.get("finishedAt") or (book.get("addedAt") or "")[:10]
    try:
        d = datetime.strptime(stamp[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return 1.0
    days = (date.today() - d).days
    return 1.15 if days < 180 else 1.0


def axis_position(terms, markers_neg, markers_pos):
    tset = set(terms)
    neg = len(tset & markers_neg)
    pos = len(tset & markers_pos)
    if neg == pos:
        return 0
    return 1 if pos > neg else -1


class Taste:
    def __init__(self):
        self.genre_w = {}
        self.theme_w = {}
        self.term_w = {}
        self.author_w = {}
        self.neg_terms = {}
        self.neg_authors = {}
        self.prefs = {}
        self.purposes = []
        self.lang = "es"
        self.onboarding_genres = []
        self.favorite_authors = []
        self.favorite_author_ids = {}  # name -> Open Library author key
        self.library_genre_counts = {}
        self.positive_books = []  # [{title, rating, status, terms:set, themes, genres, authors}]
        self.known_keys = set()  # dedupe keys, catalog ids, isbns of library books
        self.dismissed = set()
        self.liked_items = []  # interaction dicts with kind like/love
        self.signal_count = 0
        self.signature = ""

    # ── helpers ──────────────────────────────────────────────────────────
    def _add(self, store, key, value):
        if key:
            store[key] = store.get(key, 0.0) + value

    def is_known(self, book):
        keys = {book.get("dedupeKey"), book.get("id")}
        if book.get("isbn13"):
            keys.add("isbn:" + book["isbn13"])
        if book.get("olWorkKey"):
            keys.add("ol:" + book["olWorkKey"])
        if book.get("googleId"):
            keys.add("gb:" + book["googleId"])
        keys.add(loose_key(book.get("title", ""), book.get("authors") or []))
        keys.discard(None)
        return bool(keys & self.known_keys)

    def top_genres(self, n=3):
        return [k for k, v in sorted(self.genre_w.items(), key=lambda kv: -kv[1]) if v > 0][:n]

    def top_themes(self, n=3):
        return [k for k, v in sorted(self.theme_w.items(), key=lambda kv: -kv[1]) if v > 0][:n]

    def top_terms(self, n=6, exclude=()):
        excluded = set(exclude)
        genre_words = {fold(g["query"]) for g in GENRES}
        out = []
        for term, w in sorted(self.term_w.items(), key=lambda kv: -kv[1]):
            if w <= 0 or term in excluded or term in genre_words or len(term) < 4:
                continue
            out.append(term)
            if len(out) >= n:
                break
        return out

    def top_authors(self, n=3):
        return [k for k, v in sorted(self.author_w.items(), key=lambda kv: -kv[1]) if v > 0][:n]

    def far_genres(self, n=3):
        """Genres the reader hasn't touched and that aren't next to their favourites."""
        top = self.top_genres(4)
        near = set(top)
        for g in top:
            near.update(ADJACENT.get(g, []))
        candidates = [g["key"] for g in GENRES if g["key"] not in near and self.genre_w.get(g["key"], 0) <= 0.2]
        if len(candidates) < n:
            candidates += [g["key"] for g in GENRES if g["key"] not in top and g["key"] not in candidates
                           and self.genre_w.get(g["key"], 0) <= 0.5]
        return candidates[:n]

    def adjacent_unexplored(self, n=3):
        top = self.top_genres(3)
        out = []
        for g in top:
            for adj in ADJACENT.get(g, []):
                if adj not in top and adj not in out and self.genre_w.get(adj, 0) < 0.6 * max(self.genre_w.values() or [1]):
                    out.append(adj)
        return out[:n]

    def to_public(self):
        """Compact view for the profile/insights UI."""
        def norm(d, n):
            items = [(k, v) for k, v in sorted(d.items(), key=lambda kv: -kv[1]) if v > 0][:n]
            top = items[0][1] if items else 1
            return [{"key": k, "weight": round(v / top, 3)} for k, v in items]

        return {
            "genres": norm(self.genre_w, 8),
            "themes": norm(self.theme_w, 8),
            "authors": norm(self.author_w, 8),
            "signals": self.signal_count,
        }


def build_taste(profile, books, interactions):
    """
    profile: dict from serializers.profile_to_dict
    books: list of serialized library books
    interactions: list of {itemId, kind, title, authors, terms, genres}
    """
    t = Taste()
    prefs = dict(profile.get("preferences") or {})
    t.prefs = prefs
    t.purposes = list(prefs.get("purposes") or [])
    t.lang = prefs.get("language") or "es"
    t.onboarding_genres = list(profile.get("genres") or [])
    t.favorite_authors = [a.get("name") for a in profile.get("favoriteAuthors") or [] if a.get("name")]
    t.favorite_author_ids = {a["name"]: a.get("key") for a in profile.get("favoriteAuthors") or []
                             if a.get("name") and a.get("key")}

    # Onboarding: explicit genre choices are a strong prior.
    for g in t.onboarding_genres:
        if g in GENRE_BY_KEY:
            t._add(t.genre_w, g, 1.5)
            for term in GENRE_BY_KEY[g]["strong"][:3]:
                t._add(t.term_w, fold(term), 0.5)
            t.signal_count += 1
    for p in t.purposes:
        spec = PURPOSES.get(p)
        if not spec:
            continue
        for g in spec["genres"]:
            t._add(t.genre_w, g, 0.45)
        for th in spec["themes"]:
            t._add(t.theme_w, th, 0.6)
        t.signal_count += 1
    for name in t.favorite_authors:
        t._add(t.author_w, author_key(name), 2.0)
        t.signal_count += 1

    # Library
    for b in books:
        for k in (b.get("dedupeKey") or dedupe_key(b.get("title", ""), b.get("authors") or []), b.get("catalogId")):
            if k:
                t.known_keys.add(k)
        t.known_keys.add(loose_key(b.get("title", ""), b.get("authors") or []))
        if b.get("isbn13"):
            t.known_keys.add("isbn:" + b["isbn13"])
        if b.get("olWorkKey"):
            t.known_keys.add("ol:" + b["olWorkKey"])
        if b.get("googleId"):
            t.known_keys.add("gb:" + b["googleId"])

        w = _rating_weight(b.get("status"), b.get("rating")) * _recency(b)
        terms = subject_terms(b.get("categories"))
        themes = b.get("themes") or detect_themes(terms, b.get("description", ""))
        genres = b.get("genres") or []
        t.signal_count += 1
        for i, g in enumerate(genres[:3]):
            t._add(t.genre_w, g, w * (1.0, 0.7, 0.5)[i])
            if b.get("status") != "want":
                t.library_genre_counts[g] = t.library_genre_counts.get(g, 0) + 1
        for th in themes[:5]:
            t._add(t.theme_w, th, w * 0.8)
        if w > 0:
            for term in terms[:25]:
                t._add(t.term_w, term, w * 0.6)
            for kw in keywords(b.get("description", ""), 12):
                t._add(t.term_w, kw, w * 0.2)
            for a in b.get("authors") or []:
                t._add(t.author_w, author_key(a), w * 1.2)
            if b.get("status") != "want" and (b.get("rating") is None or b.get("rating") >= 3.5):
                t.positive_books.append({
                    "id": b.get("id"),
                    "title": b.get("title"),
                    "rating": b.get("rating"),
                    "status": b.get("status"),
                    "terms": set(terms),
                    "termList": terms,
                    "themes": themes,
                    "genres": genres,
                    "authors": b.get("authors") or [],
                    "weight": w,
                })
        else:
            for term in terms[:20]:
                t._add(t.neg_terms, term, -w * 0.5)
            for a in b.get("authors") or []:
                t._add(t.neg_authors, author_key(a), -w)

    # Swipes and feedback
    for it in interactions:
        kind = it.get("kind")
        if kind == "dismiss":
            t.dismissed.add(it.get("itemId"))
        w = {"love": 1.3, "like": 0.8, "dislike": -0.6, "dismiss": -0.35}.get(kind, 0)
        if not w:
            continue
        t.signal_count += 1
        terms = it.get("terms") or []
        if w > 0:
            t.liked_items.append(it)
            for g in (it.get("genres") or [])[:2]:
                t._add(t.genre_w, g, w * 0.6)
            for th in detect_themes(terms):
                t._add(t.theme_w, th, w * 0.5)
            for term in terms[:20]:
                t._add(t.term_w, term, w * 0.5)
            for a in it.get("authors") or []:
                t._add(t.author_w, author_key(a), w * 0.8)
        else:
            if kind != "dismiss":
                t.dismissed.add(it.get("itemId"))
            for term in terms[:15]:
                t._add(t.neg_terms, term, -w * 0.4)

    # Down-weight negatives that are also strong positives (one bad book in a loved genre).
    for term in list(t.neg_terms):
        if t.term_w.get(term, 0) > t.neg_terms[term] * 2:
            del t.neg_terms[term]

    t.positive_books.sort(key=lambda pb: -pb["weight"])
    sig_src = repr((sorted(profile.get("genres") or []), sorted(prefs.items(), key=str), t.favorite_authors,
                    [(b.get("id"), b.get("status"), b.get("rating"), b.get("updatedAt")) for b in books],
                    [(i.get("itemId"), i.get("kind")) for i in interactions]))
    t.signature = hashlib.sha1(sig_src.encode("utf-8")).hexdigest()[:16]
    return t


def preference_fit(book, prefs):
    """Returns (fit in [-1, 1], list of (axis, aligned:bool))."""
    fits, notes = [], []
    pages = book.get("pageCount") or 0
    if prefs.get("length") and pages:
        pos = -1 if pages < 230 else (1 if pages > 450 else 0)
        if pos:
            f = prefs["length"] * pos
            fits.append(f)
            notes.append(("length", f > 0))
    year = book.get("year")
    if prefs.get("era") and year:
        pos = -1 if year < 1950 else (1 if year >= 1990 else 0)
        if pos:
            f = prefs["era"] * pos
            fits.append(f)
            notes.append(("era", f > 0))
    terms = book.get("terms") or subject_terms(book.get("categories"))
    for axis, neg, pos_set in (("complexity", SIMPLE, COMPLEX), ("pace", INTROSPECTIVE, ACTION),
                               ("focus", CHARACTER, PLOT)):
        if prefs.get(axis):
            pos = axis_position(terms, neg, pos_set)
            if pos:
                f = prefs[axis] * pos
                fits.append(f * 0.8)
                notes.append((axis, f > 0))
    if not fits:
        return 0.0, []
    return sum(fits) / len(fits), notes


def describe_axes(prefs):
    """Human labels for the preference axes, used in the profile page."""
    labels = {
        "complexity": ("Historias sencillas", "Historias complejas"),
        "length": ("Libros breves", "Libros extensos"),
        "pace": ("Introspección", "Acción"),
        "focus": ("Personajes", "Trama"),
        "era": ("Clásicos", "Contemporáneos"),
    }
    out = []
    for axis, (neg, pos) in labels.items():
        v = prefs.get(axis) or 0
        out.append({"axis": axis, "value": v, "low": neg, "high": pos})
    return out


def archetype(taste):
    """A playful literary archetype derived from the profile (for the reveal)."""
    g = set(taste.top_genres(4))
    purposes = set(taste.purposes)
    prefs = taste.prefs

    def has(*keys):
        return bool(g & set(keys))

    if has("filosofia", "psicologia") and (prefs.get("pace", 0) <= 0 or "pensar" in purposes):
        key = "pensador"
    elif has("fantasia", "ciencia-ficcion", "aventura") and "escapar" in purposes:
        key = "cartografo"
    elif has("thriller", "misterio", "terror"):
        key = "detective"
    elif has("romance", "drama", "poesia") or "sentir" in purposes:
        key = "corazon"
    elif has("historia", "ciencia", "biografias", "desarrollo-personal") or "aprender" in purposes:
        key = "aprendiz"
    elif has("clasicos") or prefs.get("era", 0) < 0:
        key = "clasicista"
    elif has("distopia", "ciencia-ficcion"):
        key = "visionario"
    else:
        key = "explorador"
    if len(taste.onboarding_genres) >= 7 and key not in ("pensador",):
        key = "explorador"
    return ARCHETYPES[key] | {"key": key}


ARCHETYPES = {
    "pensador": {"name": "El pensador nocturno",
                 "description": "Lees para hacerte preguntas. Te atraen las ideas que incomodan, los personajes que se miran por dentro y los libros que se subrayan."},
    "cartografo": {"name": "El cartógrafo de mundos",
                   "description": "Coleccionas universos. Para ti un buen libro es un mapa nuevo, una magia con reglas y un viaje del que vuelves distinto."},
    "detective": {"name": "El detective de sillón",
                  "description": "Necesitas saber qué pasa después. Disfrutas la tensión, las pistas y ese giro final que obliga a releer el primer capítulo."},
    "corazon": {"name": "El corazón subrayado",
                "description": "Lees para sentir. Buscas historias que duelan bonito, voces íntimas y frases que se quedan contigo."},
    "aprendiz": {"name": "El aprendiz perpetuo",
                 "description": "Cada libro es una forma de entender cómo funciona el mundo: la historia, la mente, la ciencia, las vidas ajenas."},
    "clasicista": {"name": "El guardián de los clásicos",
                   "description": "Confías en lo que ha resistido al tiempo. Te gustan las grandes obras, su ritmo pausado y sus ecos en todo lo que vino después."},
    "visionario": {"name": "El visionario inquieto",
                   "description": "Te fascinan los futuros posibles y las sociedades que se tuercen. Lees para anticipar lo que podría pasar."},
    "explorador": {"name": "El explorador ecléctico",
                   "description": "No te casas con ningún género. Saltas de la poesía al thriller y de la historia a la fantasía, guiado por la curiosidad."},
}


def theme_label_list(keys):
    return [THEME_BY_KEY[k]["label"] for k in keys if k in THEME_BY_KEY]


def cosine(a, b):
    if not a or not b:
        return 0.0
    dot = sum(v * b.get(k, 0.0) for k, v in a.items())
    if dot <= 0:
        return 0.0
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0
