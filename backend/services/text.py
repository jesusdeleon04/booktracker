"""Text normalisation helpers shared by the catalog and the recommender."""
import html
import re
import unicodedata

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9 ]+")


def strip_html(text):
    if not text:
        return ""
    text = re.sub(r"<\s*(br|/p|/div|/li)\s*/?>", "\n", text, flags=re.I)
    text = _TAG_RE.sub("", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def fold(text):
    """Lowercase, strip accents and punctuation."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", str(text).lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = _NON_ALNUM_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


_EDITION_NOISE = [
    r"\s*[-–—:]\s*\d+\s*(?:a|ª|th|nd|rd|st)?\.?\s*(?:ed|edicion|edición|edition)\.?\s*$",
    r"\s*\((?:spanish|english|french|german|italian|portuguese|catalan)\s+edition\)\s*$",
    r"\s*\((?:edici[oó]n|edition)[^)]*\)\s*$",
    r"\s*\[[^\]]*\]\s*$",
    r"\s*/\s*$",
]


def clean_title(title):
    if not title:
        return ""
    t = str(title).strip()
    for pattern in _EDITION_NOISE:
        t = re.sub(pattern, "", t, flags=re.I)
    t = _WS_RE.sub(" ", t).strip(" .,;:-")
    return t or str(title).strip()


def base_title(title):
    """Title without subtitle, used for duplicate detection."""
    t = clean_title(title)
    t = re.split(r"\s[:\-–—]\s|:\s|\s\(", t)[0]
    return fold(t)


def _translit(surname):
    """Collapse common transliteration variants (Dostoyevsky/Dostoievski, Tolstoy/Tolstói)."""
    s = surname.replace("sky", "ski").replace("skii", "ski").replace("y", "i").replace("ck", "k")
    s = s.replace("ph", "f").replace("th", "t").replace("w", "v").replace("j", "i")
    return re.sub(r"(.)\1", r"\1", s)


def author_key(name):
    """Normalised surname key: 'Albert Camus' -> 'camus', 'Fiódor Dostoyevski' -> 'dostoievski'."""
    folded = fold(name)
    if not folded:
        return ""
    if "," in (name or ""):
        # "Camus, Albert" -> surname first
        return _translit(fold(name.split(",")[0]).split(" ")[-1])
    return _translit(folded.split(" ")[-1])


def same_author(a, b):
    ka, kb = author_key(a), author_key(b)
    if not ka or not kb:
        return False
    if ka == kb:
        return True
    from difflib import SequenceMatcher

    return len(ka) > 4 and SequenceMatcher(None, ka, kb).ratio() >= 0.84


def is_latin(text):
    letters = [c for c in text or "" if c.isalpha()]
    if not letters:
        return True
    latin = sum(1 for c in letters if ord(c) < 0x250)
    return latin / len(letters) >= 0.7


_ARTICLES = {"el", "la", "los", "las", "lo", "un", "una", "y", "de", "del", "the", "a", "an", "of", "and",
             "le", "les", "l", "il", "der", "die", "das", "o", "e"}


def loose_key(title, authors):
    """Order-insensitive key without articles: 'El crimen y el castigo' == 'Crimen y castigo'."""
    words = sorted(w for w in base_title(title).split() if w not in _ARTICLES)
    first = authors[0] if authors else ""
    return "loose:" + " ".join(words) + "|" + author_key(first)


def dedupe_key(title, authors):
    first = authors[0] if authors else ""
    return f"{base_title(title)}|{author_key(first)}"


def isbn_digits(value):
    if not value:
        return ""
    return re.sub(r"[^0-9Xx]", "", str(value)).upper()


def looks_like_isbn(query):
    digits = isbn_digits(query)
    if len(digits) not in (10, 13):
        return False
    # Allow only digits, hyphens, spaces and an optional ISBN prefix
    return bool(re.fullmatch(r"\s*(isbn[:\s]*)?[0-9Xx\-\s]{10,17}\s*", query, flags=re.I))


def isbn10_to_13(isbn10):
    d = isbn_digits(isbn10)
    if len(d) != 10:
        return ""
    core = "978" + d[:9]
    total = sum((1 if i % 2 == 0 else 3) * int(c) for i, c in enumerate(core))
    return core + str((10 - total % 10) % 10)


STOPWORDS = set(
    """
a about above after again against all also an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers herself him
himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other
our ours out over own same she should so some such than that the their theirs them themselves then there these they
this those through to too under until up very was we were what when where which while who whom why will with would you
your yours one two new first book books novel novels story stories edition editions volume vol series part author
authors work works life world time years year many much way well like make made great best also into read reader
readers reading new york times bestselling bestseller award winning include includes including written writing
el la los las un una unos unas de del al y o u e en por para con sin sobre entre como mas pero que se su sus es son
fue era lo le les este esta estos estas ese esa eso aquel muy ya no si sí cuando donde quien cual porque todo toda
todos todas otro otra otros otras mismo misma libro libros novela novelas obra obras autor autora edicion vida mundo
historia historias años año tiempo nueva nuevo gran grande primer primera ser hacer tiene tienen han hay
""".split()
)

# Overly generic catalog subjects that say nothing about taste.
GENERIC_SUBJECTS = set(
    """
fiction general nonfiction non fiction literature accessible book protected daisy in library lending library
large type books translations into english translations reading level english language fiction general
open library staff picks long now popular print disabled internet archive wishlist new york times bestseller
ficcion literatura novela general juvenile fiction textbooks history and criticism criticism and interpretation
""".split()
)

_GENERIC_PHRASES = {
    "fiction",
    "fiction general",
    "general",
    "literature",
    "accessible book",
    "protected daisy",
    "in library",
    "lending library",
    "large type books",
    "open library staff picks",
    "long now manual for civilization",
    "translations into english",
    "readers",
    "english language",
    "ficcion",
    "novela",
    "literatura",
    "nonfiction",
    "non fiction",
    "fiction literary",
    "reading level grade 9",
    "reading level grade 10",
    "reading level grade 11",
    "reading level grade 12",
    "nyt bestseller",
    "new york times bestseller",
    "new york times reviewed",
}


def tokenize(text, min_len=4):
    return [t for t in fold(text).split() if len(t) >= min_len and t not in STOPWORDS and not t.isdigit()]


def subject_terms(subjects, limit=40):
    """
    Turn raw API subjects ("Fiction / Literary", "Existentialism -- Fiction")
    into normalised phrases, dropping catalog noise.
    """
    out = []
    seen = set()
    for raw in (subjects or [])[:limit]:
        for part in re.split(r"\s*(?:/|--|,|;|>)\s*", str(raw)):
            phrase = fold(part)
            if not phrase or phrase in _GENERIC_PHRASES or len(phrase) < 3:
                continue
            if phrase.startswith(("reading level", "nyt", "series ", "accessible", "protected")):
                continue
            if re.search(r"\b(19|20)\d\d\b", phrase) and len(phrase.split()) <= 2:
                continue
            if phrase not in seen:
                seen.add(phrase)
                out.append(phrase)
    return out


def keywords(text, limit=25):
    """Top content words of a description (very light TF ranking)."""
    counts = {}
    for tok in tokenize(text, min_len=5):
        counts[tok] = counts.get(tok, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [w for w, _ in ranked[:limit]]


def truncate(text, length=280):
    if not text:
        return ""
    text = _WS_RE.sub(" ", text).strip()
    if len(text) <= length:
        return text
    cut = text[:length].rsplit(" ", 1)[0].rstrip(",;:—-")
    return cut + "…"
