"""
Wikisource (es, en, fr, de): free poetry with its original layout.

Wikisource only hosts public-domain or freely licensed texts, but every page is
still checked by our own rights engine. Poems are extracted from the rendered
HTML keeping each line break, stanza break and indentation.

Requests are batched (one search request returns the hits *and* the author
pages they link to) because Wikimedia limits unidentified clients to a few
requests per minute.
"""
import re
import unicodedata
from urllib.parse import quote

from bs4 import BeautifulSoup, NavigableString, Tag

from .. import http_client

LANGS = ("es", "en", "fr", "de")
WEEK = 7 * 24 * 3600
MONTH = 30 * 24 * 3600

# Author namespace per wiki (German Wikisource keeps authors in the main namespace).
AUTHOR_NS = {"es": (106, "Autor:"), "en": (102, "Author:"), "fr": (102, "Auteur:")}
_EN_EXCLUDE = '-incategory:"Versions pages" -incategory:"Disambiguation pages"'
SEARCH_FILTERS = {
    "es": "hastemplate:Poema",
    "en": f"incategory:Poems|Sonnets {_EN_EXCLUDE}",
    "fr": "",
    "de": "incategory:Gedicht",
}
_DE_NON_AUTHOR_CATS = {"Fertig", "Werke", "Gedicht", "Korrigiert", "Unkorrigiert", "Unvollständig", "Neuhochdeutsch",
                       "Deutsche Philologie", "Deutschland", "Österreich", "Schweiz", "Lyrik", "Ballade", "Sonett",
                       "Lied", "Epigramm", "Kinderlyrik", "Liebeslyrik", "Naturlyrik", "Wikisource:Gesprochene Wikisource"}

# Categories that mark a page as verse (folded, word match).
_POEM_CATEGORY_RE = re.compile(
    r"\b(poema|poemas|poesia|poesias|soneto|sonetos|rima|rimas|romance|romances|oda|odas|elegia|elegias|egloga|"
    r"eglogas|cancion|canciones|coplas|decimas|letrillas?|epigramas?|madrigal(es)?|silvas?|redondillas|liras|"
    r"villancicos?|cantares|himnos?|fabulas|poem|poems|poetry|sonnets?|odes?|ballads?|hymns?|elegies|lyrics|verse|"
    r"gedichte?|lyrik|balladen?|sonette?|lieder|poemes|poesie|poesies)\b"
)

_STRIP = [
    "style", "script", "link", ".ws-noexport", ".noprint", ".pagenum", ".ws-pagenum", "sup.reference",
    ".mw-editsection", ".zeilennummer", "#headertemplate", ".ws-header", ".wst-header-structure", "#ws-data",
    "#textdaten", ".mw-cite-backlink", "ol.references", ".reference", ".ws-summary", "table.footertemplate",
    ".licenseContainer", ".licensetpl", ".mw-empty-elt",
]
_SPACE_CHARS = {" ": "  ", " ": " ", " ": " ", " ": " ", "　": "  ", " ": " ", " ": " "}
_TRANSLATION_RE = re.compile(
    r"(traducci[oó]n|traducido|traduit|traduction|translated|translation|übersetz|tradu[cç][aã]o|traduzione)", re.I
)


def api_url(lang):
    return f"https://{lang}.wikisource.org/w/api.php"


def page_url(lang, title):
    return f"https://{lang}.wikisource.org/wiki/{quote(title.replace(' ', '_'), safe='/:(),’!')}"


def fold(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


def clean_segment(title):
    """'Rimas (Bécquer, 1885)/Rima LIII' → 'Rima LIII'; 'Ozymandias (Shelley)' → 'Ozymandias'."""
    seg = title.rsplit("/", 1)[-1].strip()
    m = re.match(r"^(.*\S)\s*\(([^()]*)\)$", seg)
    if m and (re.search(r"\d", m.group(2)) or re.fullmatch(r"[A-ZÁÉÍÓÚÜÑ][\w’'.-]*(?: [A-ZÁÉÍÓÚÜÑ][\w’'.-]*)?", m.group(2))):
        seg = m.group(1)
    return seg


def strip_author(title, author_name):
    """'Cuando me paro a contemplar mi estado (Garcilaso de la Vega)' → without the author."""
    m = re.match(r"^(.*\S)\s*\(([^()]*)\)$", title or "")
    if m and author_name:
        inner, name = fold(m.group(2)), fold(author_name)
        if inner and (inner == name or inner in name.split() or name.endswith(inner)):
            return m.group(1)
    return title


def collection_of(title):
    return title.rsplit("/", 1)[0] if "/" in title else None


# ── search (batched) ────────────────────────────────────────────────────────


def _query(lang, params, ttl=WEEK):
    base = {"action": "query", "format": "json", "formatversion": 2}
    base.update(params)
    return http_client.get_json(api_url(lang), base, ttl=ttl, timeout=15) or {}


def search(lang, query="", *, author_page=None, limit=10, offset=0):
    """Hits for a query (or all poems of an author page) with the author pages
    each hit links to. Returns (hits, total, next_offset)."""
    lang = lang if lang in LANGS else "es"
    # Spanish poem pages often lack the Poema template (transcluded scans), so an
    # author's list is filtered afterwards by its verse categories instead.
    verse_filter = lang in ("es", "en", "fr") and bool(author_page)
    if author_page:
        if lang == "de":
            srsearch = f'incategory:Gedicht incategory:"{author_page}" {query}'
        elif lang == "en":
            srsearch = f'linksto:"{author_page}" {_EN_EXCLUDE} {query}'
        else:
            srsearch = f'linksto:"{author_page}" {query}'
    else:
        srsearch = f"{SEARCH_FILTERS[lang]} {query}"
    props = ["pageprops"]
    props.append("categories" if lang == "de" or verse_filter else "")  # (de: authors; others: verse check)
    props.append("links" if lang != "de" else "")
    props.append("templates" if verse_filter else "")
    # French and English poems usually live as subpages of a book whose pages
    # don't link the author: list the author's verse books and open them.
    expand = bool(author_page) and lang in ("fr", "en")
    params = {
        "generator": "search", "gsrsearch": srsearch.strip(), "gsrnamespace": 0,
        "gsrlimit": 50 if expand else (min(50, limit * 2) if verse_filter else limit),
        "gsroffset": None if expand else (offset or None), "prop": "|".join(p for p in props if p),
        "ppprop": "wikibase_item", "cllimit": "max", "clshow": "!hidden", "pllimit": "max",
        "tltemplates": "Plantilla:Poema" if verse_filter else None, "tllimit": "max" if verse_filter else None,
    }
    if lang in AUTHOR_NS:
        params["plnamespace"] = AUTHOR_NS[lang][0]
    data = _query(lang, params)
    pages = (data.get("query") or {}).get("pages") or []
    hits, books = [], []
    for p in sorted(pages, key=lambda p: p.get("index", 0)):
        if p.get("missing"):
            continue
        cats = [c["title"].split(":", 1)[1] for c in p.get("categories") or []]
        if lang == "de":
            authors = [a for a in cats if a not in _DE_NON_AUTHOR_CATS and not re.search(r"\d", a)]
        else:
            authors = [l["title"] for l in p.get("links") or []]
        if expand and "/" not in p["title"]:
            if authors == [author_page] and any(_POEM_CATEGORY_RE.search(fold(c)) for c in cats) \
                    and not _PROSE_RE.search(fold(p["title"])):
                books.append(p["title"])
            continue
        if verse_filter and not _looks_like_verse(lang, p["title"], cats, bool(p.get("templates"))):
            continue
        hits.append({
            "lang": lang,
            "pageTitle": p["title"],
            "title": clean_segment(p["title"]),
            "collection": collection_of(p["title"]),
            "authorPages": authors,
            "wikidata": (p.get("pageprops") or {}).get("wikibase_item"),
        })
    if expand:
        seen = {h["pageTitle"] for h in hits}
        for book in books[:2]:
            for t in subpages(lang, book):
                if t not in seen:
                    seen.add(t)
                    hits.append({"lang": lang, "pageTitle": t, "title": clean_segment(t), "collection": book,
                                 "authorPages": [author_page], "wikidata": None})
        window = hits[offset : offset + limit]
        return window, len(hits), (offset + limit if offset + limit < len(hits) else None)
    total = (data.get("query") or {}).get("searchinfo", {}).get("totalhits")
    nxt = (data.get("continue") or {}).get("gsroffset")
    return hits[:limit] if verse_filter else hits, total, nxt


_NOT_A_POEM_RE = re.compile(
    r"^(table|table des matieres|tables?|preface|avertissement|avant propos|notes?|index|introduction|appendice|"
    r"contents|errata|notice|sommaire|bibliographie|frontispice|titre|dedicace|postface|epilogue en prose|"
    r"variantes|commentaires?|glossaire|advertisement|editor s note|footnotes)$"
)


def subpages(lang, book):
    """Poem pages of a verse book (subpages), one request, cached."""
    data = _query(lang, {"list": "allpages", "apprefix": f"{book}/", "apnamespace": 0, "aplimit": "max"}, ttl=MONTH)
    out = []
    for p in (data.get("query") or {}).get("allpages") or []:
        seg = p["title"][len(book) + 1 :]
        if "/" in seg or _NOT_A_POEM_RE.match(fold(seg)):
            continue
        out.append(p["title"])
    return out


_PROSE_RE = re.compile(
    r"\b(prose|prosa|encyclop|dictionary|diccionario|biograph|biografia|letters|lettres|cartas|correspondance|"
    r"correspondencia|essays?|essais|ensayos?|critique|critica|paradis artificiels|novela|roman|chapter|chapitre|capitulo|"
    r"histoires|contes|nouvelles|cuentos|tales|stories|leyendas)\b"
)
_VERSE_COLLECTION_RE = re.compile(
    r"\b(poems|poetry|poetical|sonnets|ballads|verses|lyrics|songs|odes|fleurs du mal|poesies|poemes|rimas|poesias|"
    r"poemas|sonetos|romances|canciones|cantares|versos|rubaiyat)\b"
)


def _looks_like_verse(lang, title, categories, has_poem_template):
    """Cheap verse check for an author's page list (no extra request).
    Every listed page is still fully verified when it is opened."""
    folded_title = fold(title)
    collection = fold(title.rsplit("/", 1)[0]) if "/" in title else ""
    if _PROSE_RE.search(collection or folded_title):
        return False
    if has_poem_template or any(_POEM_CATEGORY_RE.search(fold(c)) for c in categories):
        return True
    if lang == "es":
        return False
    # English and French pages are often uncategorised: accept poems that live
    # inside a verse collection (subpages), never top-level book or index pages.
    return bool(collection) and bool(_VERSE_COLLECTION_RE.search(collection))


def page_qids(lang, titles):
    """Wikidata items of many pages (author pages) in one request: {title: qid}."""
    titles = [t for t in dict.fromkeys(titles) if t][:50]
    if not titles:
        return {}
    data = _query(lang, {"prop": "pageprops", "ppprop": "wikibase_item", "titles": "|".join(sorted(titles)),
                         "redirects": 1}, ttl=MONTH)
    q = data.get("query") or {}
    alias = {}
    for m in (q.get("normalized") or []) + (q.get("redirects") or []):
        alias[m["to"]] = alias.get(m["from"], m["from"])
    out = {}
    for p in q.get("pages") or []:
        qid = (p.get("pageprops") or {}).get("wikibase_item")
        if not qid:
            continue
        out[p["title"]] = qid
        src = p["title"]
        while src in alias:
            src = alias[src]
            out[src] = qid
    return out


def author_titles(lang, author_page, limit=200):
    """All poem pages of an author (titles only, one request) for the daily poem."""
    hits, _, _ = search(lang, author_page=author_page, limit=min(limit, 50))
    return [h["pageTitle"] for h in hits if h["authorPages"] == [author_page] or (lang == "de" and author_page in h["authorPages"])]


# ── HTML → lines ────────────────────────────────────────────────────────────


_LIGATURES = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st"}


def _normalize_line(text):
    for k, v in _SPACE_CHARS.items():
        text = text.replace(k, v)
    # Typographic ligatures left by OCR ("ﬂores") are plain letters in the poem.
    for k, v in _LIGATURES.items():
        text = text.replace(k, v)
    text = text.replace("\r", "").replace("\t", "    ")
    stripped = text.lstrip(" ")
    indent = len(text) - len(stripped)
    return (" " * min(indent, 24)) + re.sub(r" {2,}", " ", stripped).rstrip()


_EM_RE = re.compile(r"(?:padding-left|margin-left|width)\s*:\s*([\d.]+)\s*em")


def _walk(node, buf, lines):
    """Serialise a poem container: <br> ends a line, block elements end it if non-empty."""
    for child in node.children:
        if isinstance(child, NavigableString):
            if child.__class__.__name__ in ("Comment", "Doctype"):
                continue
            text = str(child).replace("\r", "")
            if not text.strip() and "\n" in text:
                continue
            if not "".join(buf):
                text = text.lstrip("\n")  # source newline before a verse, not indentation
            buf.append(text.replace("\n", " "))
            continue
        if not isinstance(child, Tag):
            continue
        name = child.name
        if name == "br":
            lines.append("".join(buf))
            buf.clear()
            continue
        if name == "span" and not child.get_text(strip=True):
            m = _EM_RE.search(child.get("style", ""))
            if m:
                buf.append(" " * int(round(float(m.group(1)) * 2)))
                continue
        block = name in ("p", "div", "dd", "dl", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "tr", "center",
                         "blockquote", "ul", "ol")
        if block and "".join(buf).strip():
            lines.append("".join(buf))
            buf.clear()
        if block:
            m = _EM_RE.search(child.get("style", "") or "")
            if m and name in ("div", "p", "dd"):
                buf.append(" " * int(round(float(m.group(1)) * 2)))
        _walk(child, buf, lines)
        if block and "".join(buf).strip():
            lines.append("".join(buf))
            buf.clear()


def _clean_lines(raw, drop_heads=()):
    out = []
    for l in (_normalize_line(x) for x in raw):
        if not l.strip():
            if out and out[-1] != "":
                out.append("")
        else:
            out.append(l)
    # Ornaments (“* * *”, “øøø”) at the very start or end are typography, not verse.
    def ornament(line):
        chars = set(line.replace(" ", ""))
        return bool(line.strip()) and len(chars) == 1 and len(line.strip()) <= 9
    while out and (out[0] == "" or ornament(out[0])):
        out.pop(0)
    while out and (out[-1] == "" or ornament(out[-1])):
        out.pop()
    # Drop leading headings that repeat the title/subtitle in capitals (e.g.
    # "DER PANTHER"). A mixed-case line is a verse even if it equals the title:
    # many poems are titled by their first line.
    heads = {fold(h) for h in drop_heads if h}
    heads |= {h.replace(" ", "") for h in heads}
    while (len(out) > 2 and out[0] and out[0].strip() == out[0].strip().upper()
           and (fold(out[0]) in heads or fold(out[0]).replace(" ", "") in heads)):
        out.pop(0)
        while out and out[0] == "":
            out.pop(0)
    return out


def extract_poem(html, drop_heads=()):
    soup = BeautifulSoup(html, "html.parser")
    for sel in _STRIP:
        for el in soup.select(sel):
            el.decompose()
    lines = []
    blocks = soup.select(".ws-poema")
    if blocks:
        for block in blocks:
            for st in block.select(".ws-poema-estrofa"):
                for ln in st.select(".ws-poema-line"):
                    indent = ""
                    ind = ln.select_one(".ws-poema-indent")
                    if ind:
                        m = re.search(r"width:\s*([\d.]+)em", ind.get("style", ""))
                        indent = " " * int(round(float(m.group(1)) * 2)) if m else "    "
                        ind.decompose()
                    for br in ln.select("br"):
                        br.decompose()
                    lines.append(indent + ln.get_text())
                lines.append("")
        return _clean_lines(lines)
    blocks = [b for b in soup.select("div.poem") if not b.find_parent("div", class_="poem")]
    for block in blocks:
        buf = []
        _walk(block, buf, lines)
        if "".join(buf).strip():
            lines.append("".join(buf))
        lines.append("")
    return _clean_lines(lines, drop_heads)


# ── page → poem record ──────────────────────────────────────────────────────


def _meta(soup, key):
    return soup.select_one(f"#ws-{key}") or soup.select_one(f".ws-{key}")


def _meta_text(soup, key):
    el = _meta(soup, key)
    return el.get_text(" ", strip=True) if el else ""


def _meta_page(soup, key, lang):
    """Page title of the person in a ws-author / ws-translator field."""
    el = _meta(soup, key)
    if not el:
        return None, ""
    a = el.select_one("a[title]")
    text = el.get_text(" ", strip=True)
    if a:
        return a["title"], a.get_text(" ", strip=True) or text
    if not text:
        return None, ""
    ns = AUTHOR_NS.get(lang, (None, ""))[1]
    if ns and text.startswith(ns):
        return text, text[len(ns):]
    return (f"{ns}{text}" if ns else text), text


def fetch(lang, title):
    """Parse a Wikisource page. Returns None if it doesn't contain a poem."""
    data = http_client.get_json(
        api_url(lang),
        {"action": "parse", "page": title, "prop": "text|properties|categories", "redirects": 1,
         "format": "json", "formatversion": 2, "disableeditsection": 1, "disablelimitreport": 1},
        ttl=WEEK,
        timeout=20,
    )
    parse = (data or {}).get("parse")
    if not parse:
        return None
    categories = {c.get("category", "") for c in parse.get("categories") or []}
    if categories & {"Versions_pages", "Disambiguation_pages"}:
        return None
    html = parse.get("text") or ""
    soup = BeautifulSoup(html, "html.parser")
    props = parse.get("properties") or {}

    header = soup.select_one("#headertemplate, .ws-header, .wst-header-structure, #textdaten")
    header_text = header.get_text(" ", strip=True) if header else ""
    header_people = []
    ns = AUTHOR_NS.get(lang, (None, ""))[1]
    if header and ns:
        header_people = [a["title"] for a in header.select("a[title]") if a["title"].startswith(ns)]

    author_page, author_name = _meta_page(soup, "author", lang)
    if not author_page and header_people:
        author_page = header_people[0]
        author_name = author_page.split(":", 1)[-1]
    translator_page, translator_name = _meta_page(soup, "translator", lang)
    # German headers always print an empty "Übersetzer:" row: only its value counts.
    mentions_translation = bool(translator_name) if lang == "de" else bool(_TRANSLATION_RE.search(header_text))
    if not translator_page:
        others = [p for p in dict.fromkeys(header_people) if p != author_page]
        if others and mentions_translation:
            translator_page = others[0]
            translator_name = translator_page.split(":", 1)[-1]
    if author_name.startswith(ns) and ns:
        author_name = author_name[len(ns):]

    page_title = parse.get("title") or title
    segment = clean_segment(page_title)
    ws_title = _meta_text(soup, "title")
    subtitle = None
    if header is not None and lang == "de":
        m = re.search(r"Untertitel:\s*(.+?)\s+aus:", header_text)
        subtitle = m.group(1).strip() if m else None
    lines = extract_poem(html, (segment, ws_title, subtitle))
    if sum(1 for l in lines if l.strip()) < 2:
        return None

    year = None
    for src in (_meta_text(soup, "year"), header_text):
        m = re.search(r"\b(1[0-9]{3})\b", src or "")
        if m:
            year = int(m.group(1))
            break
    max_term = None
    m = re.search(r"(\d{2,3})\s*p\.?\s*m\.?\s*a\.?\s*o\s+menos", header_text)
    if m:
        max_term = int(m.group(1))
    license_name = license_url = None
    if re.search(r"creativecommons\.org/licenses/by-sa", html):
        license_name, license_url = "CC BY-SA", "https://creativecommons.org/licenses/by-sa/4.0/deed.es"
    elif re.search(r"creativecommons\.org/licenses/by/", html):
        license_name, license_url = "CC BY", "https://creativecommons.org/licenses/by/4.0/deed.es"

    alt_title = ws_title if lang == "es" and ws_title and fold(ws_title) != fold(segment) else None
    return {
        "lang": lang,
        "pageTitle": page_title,
        "title": segment,
        "altTitle": alt_title,
        "subtitle": subtitle,
        "lines": lines,
        "year": year,
        "publisher": _meta_text(soup, "publisher") or None,
        "collection": collection_of(page_title),
        "authorPage": author_page,
        "authorName": author_name or None,
        "translatorPage": translator_page,
        "translatorName": translator_name or None,
        "mentionsTranslation": mentions_translation,
        "wikidata": props.get("wikibase_item"),
        "sourceMaxTerm": max_term,
        "license": license_name,
        "licenseUrl": license_url,
        "url": page_url(lang, page_title),
    }
