"""Wikidata / Wikipedia: authors, dates, portraits, movements and works."""
import re
import unicodedata
from urllib.parse import quote

from .. import http_client
from ..http_client import SourceUnavailable
from . import curated

API = "https://www.wikidata.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"
MONTH = 30 * 24 * 3600
WEEK = 7 * 24 * 3600

POET = "Q49757"
WRITER_OCCUPATIONS = {
    POET, "Q36180", "Q214917", "Q6625963", "Q333634", "Q4964182", "Q11774202", "Q1930187", "Q482980",
    "Q18844224", "Q4853732", "Q1622272",
}
WIKISOURCE_LANGS = ("es", "en", "fr", "de")
LANGUAGE_QIDS = {"Q1321": "es", "Q1860": "en", "Q150": "fr", "Q188": "de", "Q652": "it", "Q5146": "pt", "Q397": "la"}


def fold(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


# ── claim helpers ───────────────────────────────────────────────────────────


def _best(claims, prop):
    """Statements of a property, preferred rank first, deprecated ones dropped."""
    stmts = [s for s in claims.get(prop, []) if s.get("rank") != "deprecated"]
    preferred = [s for s in stmts if s.get("rank") == "preferred"]
    return preferred or stmts


def _years(claims, prop):
    out = []
    for s in _best(claims, prop):
        v = (s.get("mainsnak", {}).get("datavalue") or {}).get("value")
        if isinstance(v, dict) and v.get("time"):
            m = re.match(r"([+-])(\d+)-", v["time"])
            if m:
                y = int(m.group(2))
                out.append(-y if m.group(1) == "-" else y)
    return out


def _ids(claims, prop):
    out = []
    for s in _best(claims, prop):
        v = (s.get("mainsnak", {}).get("datavalue") or {}).get("value")
        if isinstance(v, dict) and v.get("id"):
            out.append(v["id"])
    return out


def _string(claims, prop):
    for s in _best(claims, prop):
        v = (s.get("mainsnak", {}).get("datavalue") or {}).get("value")
        if isinstance(v, str):
            return v
        if isinstance(v, dict) and v.get("text"):
            return v["text"]
    return None


def life_years(claims):
    """(birth, death). When sources disagree the death year is the latest one
    (the prudent choice for copyright) and an impossible birth is dropped."""
    births, deaths = _years(claims, "P569"), _years(claims, "P570")
    birth = min(births) if births else None
    death = max(deaths) if deaths else None
    if birth is not None and death is not None and birth >= death:
        birth = None
    return birth, death


def _label(e, langs=("es", "en", "fr", "de")):
    for lang in langs:
        v = (e.get("labels") or {}).get(lang)
        if v:
            return v["value"]
    return next(iter((e.get("labels") or {}).values()), {}).get("value", "")


def _description(e):
    for lang in ("es", "en"):
        v = (e.get("descriptions") or {}).get(lang)
        if v:
            return v["value"]
    return ""


def commons_image(filename, width=480):
    if not filename:
        return None
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote(filename.replace(' ', '_'))}?width={width}"


# ── fetching ────────────────────────────────────────────────────────────────


def entities(ids, props="labels|descriptions|claims|sitelinks"):
    """Entities by QID. Each entity is cached on its own, so later requests for a
    different mix of QIDs only fetch the ones never seen before."""
    ids = [i for i in dict.fromkeys(ids) if i and re.fullmatch(r"Q\d+", i)]
    out, missing = {}, []
    for qid in ids:
        hit = http_client.cache_lookup(f"wikidata:{props}:{qid}", MONTH)
        if hit is not None:
            out[qid] = hit
        else:
            missing.append(qid)
    for i in range(0, len(missing), 50):
        chunk = sorted(missing[i : i + 50])
        data = http_client.get_json(
            API,
            {"action": "wbgetentities", "ids": "|".join(chunk), "props": props, "languages": "es|en|fr|de",
             "format": "json"},
            ttl=MONTH,
            timeout=20,
        )
        for qid, e in ((data or {}).get("entities") or {}).items():
            out[qid] = e
            http_client.cache_store(f"wikidata:{props}:{qid}", e)
    return out


def labels(ids):
    return {q: _label(e) for q, e in entities(ids, props="labels").items()}


def _card(qid, e):
    c = e.get("claims") or {}
    birth, death = life_years(c)
    sitelinks = e.get("sitelinks") or {}
    key = curated.BY_QID.get(qid)
    return {
        "qid": qid,
        "key": key,
        "name": curated.POETS[key][1] if key else _label(e),
        "description": _description(e),
        "birthYear": birth,
        "deathYear": death,
        "image": commons_image(_string(c, "P18")),
        "isHuman": "Q5" in _ids(c, "P31"),
        "isPoet": POET in _ids(c, "P106"),
        "isWriter": bool(set(_ids(c, "P106")) & WRITER_OCCUPATIONS),
        # Languages the author wrote in (to tell an original from a translation).
        "writesIn": sorted({LANGUAGE_QIDS[q] for p in ("P6886", "P1412", "P103") for q in _ids(c, p) if q in LANGUAGE_QIDS}),
        "wikisource": {lang: (sitelinks.get(f"{lang}wikisource") or {}).get("title") for lang in WIKISOURCE_LANGS
                       if sitelinks.get(f"{lang}wikisource")},
        "wikipedia": {lang: (sitelinks.get(f"{lang}wiki") or {}).get("title") for lang in ("es", "en")
                      if sitelinks.get(f"{lang}wiki")},
        "_claims": c,
    }


def people(qids):
    """Light author cards for many QIDs in as few requests as possible."""
    cards = {}
    for qid, e in entities(qids, props="labels|descriptions|claims|sitelinks").items():
        if e.get("missing") is not None:
            continue
        card = _card(qid, e)
        card.pop("_claims", None)
        cards[qid] = card
    return cards


def person(qid):
    """Full author data: card + movements, countries and notable works labels."""
    e = entities([qid]).get(qid)
    if not e or e.get("missing") is not None:
        return None
    card = _card(qid, e)
    c = card.pop("_claims")
    movements = _ids(c, "P135")[:5]
    countries = _ids(c, "P27")[:2]
    works = _ids(c, "P800")[:16]
    try:
        lbl = labels(movements + countries + works)
    except SourceUnavailable:
        lbl = {}
    card.update(
        movements=[{"qid": q, "label": lbl[q]} for q in movements if lbl.get(q)],
        countries=[lbl[q] for q in countries if lbl.get(q)],
        notableWorks=[{"qid": q, "title": lbl[q]} for q in works if lbl.get(q)],
    )
    return card


def search_person(name):
    """QID of the writer a query names, or None. Requires a strong name match so
    that a theme like "amor" never turns into a writer called Amor."""
    q = fold(name)
    if len(q) < 3:
        return None
    surnames = {}
    for key, (qid, display, *_rest) in curated.POETS.items():
        surnames.setdefault(fold(display).split()[-1], []).append(qid)
    for key, (qid, display, *_rest) in curated.POETS.items():
        f = fold(display)
        last = f.split()[-1]
        if q == f or q == key.replace("-", " ") or (q == last and len(surnames[last]) == 1):
            return qid
    data = http_client.get_json(
        API,
        {"action": "wbsearchentities", "search": name, "language": "es", "uselang": "es", "type": "item",
         "limit": 7, "format": "json"},
        ttl=MONTH,
        timeout=12,
    )
    hits = (data or {}).get("search") or []
    qtokens = set(q.split())
    candidates = []
    for h in hits:
        label = fold(h.get("label") or "")
        matched = fold((h.get("match") or {}).get("text") or "")
        ltokens = set(label.split())
        strong = (
            q == label
            or q == matched
            or (qtokens <= ltokens and label.split() and label.split()[-1] in qtokens)
        )
        if strong:
            candidates.append(h["id"])
    if not candidates:
        return None
    ents = entities(candidates[:5], props="claims|sitelinks")
    best = None
    for qid in candidates[:5]:
        e = ents.get(qid) or {}
        claims = e.get("claims") or {}
        if "Q5" not in _ids(claims, "P31"):
            continue
        occ = set(_ids(claims, "P106"))
        if not occ & WRITER_OCCUPATIONS:
            continue
        score = (2 if POET in occ else 1) * 1000 + len(e.get("sitelinks") or {})
        if best is None or score > best[0]:
            best = (score, qid)
    return best[1] if best else None


def sparql(query, ttl=WEEK):
    data = http_client.get_json(SPARQL, {"query": query, "format": "json"}, ttl=ttl, timeout=40)
    return ((data or {}).get("results") or {}).get("bindings") or []


_TYPE_LABELS = {
    "Q5185279": "Poema",
    "Q12106333": "Poemario",
    "Q7725634": "Obra literaria",
    "Q571": "Libro",
    "Q49084": "Relato",
    "Q8261": "Novela",
    "Q35760": "Ensayo",
    "Q25379": "Obra de teatro",
    "Q47461344": "Obra escrita",
}


def works(qid):
    """Works by an author (poems and poetry books first) as bibliographic references."""
    if not re.fullmatch(r"Q\d+", qid or ""):
        return []
    query = f"""
SELECT ?work ?type (SAMPLE(?orig) AS ?o) (SAMPLE(?esl) AS ?es_l) (SAMPLE(?enl) AS ?en_l) (SAMPLE(?anyl) AS ?any_l)
       (MIN(YEAR(?date)) AS ?year) (SAMPLE(?es) AS ?eswiki) (SAMPLE(?en) AS ?enwiki) (COUNT(?poetry) AS ?isPoetry) WHERE {{
  ?work wdt:P50 wd:{qid} ; wdt:P31 ?type .
  VALUES ?type {{ wd:Q5185279 wd:Q12106333 wd:Q7725634 wd:Q571 wd:Q49084 wd:Q8261 wd:Q35760 wd:Q25379 wd:Q47461344 }}
  OPTIONAL {{ ?work wdt:P1476 ?orig }}
  OPTIONAL {{ ?work rdfs:label ?esl FILTER(LANG(?esl) = "es") }}
  OPTIONAL {{ ?work rdfs:label ?enl FILTER(LANG(?enl) = "en") }}
  OPTIONAL {{ ?work rdfs:label ?anyl FILTER(LANG(?anyl) IN ("fr", "de", "it", "pt")) }}
  OPTIONAL {{ ?work wdt:P577 ?date }}
  OPTIONAL {{ ?work wdt:P136 ?poetry FILTER(?poetry IN (wd:Q482, wd:Q12106333, wd:Q5185279, wd:Q1093829)) }}
  OPTIONAL {{ ?es schema:about ?work ; schema:isPartOf <https://es.wikipedia.org/> }}
  OPTIONAL {{ ?en schema:about ?work ; schema:isPartOf <https://en.wikipedia.org/> }}
}} GROUP BY ?work ?type LIMIT 150"""
    rows = sparql(query)
    seen = {}
    for r in rows:
        wq = r["work"]["value"].rsplit("/", 1)[-1]
        t = r["type"]["value"].rsplit("/", 1)[-1]
        title = next((r[k]["value"] for k in ("o", "es_l", "en_l", "any_l") if r.get(k, {}).get("value")), "")
        poetry = int(r.get("isPoetry", {}).get("value", "0") or 0) > 0
        year = r.get("year", {}).get("value", "")
        item = seen.get(wq)
        if not item:
            item = seen[wq] = {
                "qid": wq,
                "title": title,
                "year": int(year) if year.lstrip("-").isdigit() else None,
                "kind": _TYPE_LABELS.get(t, "Obra"),
                "url": (r.get("eswiki") or r.get("enwiki") or {}).get("value") or f"https://www.wikidata.org/wiki/{wq}",
                "source": "Wikipedia" if (r.get("eswiki") or r.get("enwiki")) else "Wikidata",
            }
        if t in ("Q5185279", "Q12106333"):
            item["kind"] = _TYPE_LABELS[t]
        elif poetry and item["kind"] not in ("Poema", "Poemario"):
            item["kind"] = "Poesía"
    order = {"Poemario": 0, "Poesía": 0, "Poema": 1}
    out = [w for w in seen.values() if w["title"] and not re.fullmatch(r"Q\d+", w["title"])]
    out.sort(key=lambda w: (order.get(w["kind"], 2), w["year"] or 9999, w["title"]))
    return out[:60]


def wikipedia_summary(title, lang="es"):
    if not title:
        return None
    try:
        data = http_client.get_json(
            f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{quote(title.replace(' ', '_'), safe='')}",
            ttl=MONTH,
            timeout=12,
        )
    except SourceUnavailable:
        return None
    if not data or data.get("type") == "disambiguation":
        return None
    return {
        "extract": data.get("extract") or "",
        "url": ((data.get("content_urls") or {}).get("desktop") or {}).get("page"),
        "lang": lang,
        "title": data.get("title") or title,
    }
