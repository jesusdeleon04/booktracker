"""
Poetry catalog: interprets queries, merges sources and applies the rights
engine. Full texts leave this module only when `rights.allowsFullText` is true
for the reader's jurisdiction.
"""
import base64
import hashlib
from concurrent.futures import ThreadPoolExecutor
import random as _random
import re
import threading
import time
from datetime import date

import config

from .. import http_client
from ..http_client import SourceUnavailable
from . import curated, poetrydb, rights, wikidata, wikisource
from .wikidata import fold


class NotFound(Exception):
    pass


SOURCE_INFO = {
    "wikisource": {
        "name": "Wikisource",
        "home": "https://wikisource.org",
        "note": "Biblioteca libre de la Fundación Wikimedia: solo aloja textos de dominio público o con licencia libre.",
    },
    "poetrydb": {
        "name": "PoetryDB",
        "home": "https://poetrydb.org",
        "note": "Base de datos abierta de poesía clásica en inglés, con textos procedentes del Proyecto Gutenberg.",
    },
}
LANG_NAMES = {"es": "español", "en": "inglés", "fr": "francés", "de": "alemán"}
_PDB_BY_QID = {}
for _name, _qid in curated.POETRYDB_AUTHORS.items():
    _PDB_BY_QID.setdefault(_qid, _name)


# ── ids ─────────────────────────────────────────────────────────────────────


def make_id(source, lang, key):
    b = base64.urlsafe_b64encode(key.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{'ws' if source == 'wikisource' else 'pdb'}.{lang}.{b}"


def parse_id(pid):
    m = re.fullmatch(r"(ws|pdb)\.([a-z]{2})\.([A-Za-z0-9_-]+)", pid or "")
    if not m:
        raise NotFound("Identificador de poema no válido.")
    raw = m.group(3) + "=" * (-len(m.group(3)) % 4)
    try:
        key = base64.urlsafe_b64decode(raw).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        raise NotFound("Identificador de poema no válido.")
    source = "wikisource" if m.group(1) == "ws" else "poetrydb"
    if source == "wikisource" and m.group(2) not in wikisource.LANGS:
        raise NotFound("Idioma de Wikisource no admitido.")
    return source, m.group(2), key


# ── errors ──────────────────────────────────────────────────────────────────


def source_error(source):
    contact = bool(config.CONTACT)
    if source == "wikisource" or source == "wikidata":
        msg = ("Wikimedia (Wikisource/Wikidata) no responde o ha limitado temporalmente las consultas. "
               "Vuelve a intentarlo en un minuto.")
        if not contact:
            msg += (" Wikimedia permite muchas más consultas a las apps que se identifican: añade "
                    "BOOKTRACKER_CONTACT=tu-email-o-web en backend/.env.")
        return {"source": source, "message": msg}
    return {"source": source, "message": f"{SOURCE_INFO.get(source, {}).get('name', source)} no responde ahora mismo."}


# ── people & rights ─────────────────────────────────────────────────────────


def _people(qids, errors=None):
    try:
        return wikidata.people([q for q in qids if q])
    except SourceUnavailable:
        if errors is not None and not any(e["source"] == "wikidata" for e in errors):
            errors.append(source_error("wikidata"))
        return {}


def _public_person(card):
    if not card:
        return None
    return {k: card.get(k) for k in ("qid", "key", "name", "birthYear", "deathYear", "image", "description")}


def author_rights(card, jurisdiction):
    """Is an author's work free in the reader's jurisdiction? (author-level view)"""
    year = rights.today_year()
    if card and card.get("deathYear") is None and card.get("birthYear") and card["birthYear"] >= year - 110:
        return {
            "status": "protected", "label": rights.STATUS_LABELS["protected"], "allowsFullText": False,
            "explanation": f"No consta el fallecimiento de {card['name']}: su obra está protegida por derechos de autor.",
            "jurisdiction": jurisdiction, "until": None,
        }
    return rights.classify(
        author_name=(card or {}).get("name", ""), author_death=(card or {}).get("deathYear"),
        source_declares_pd=True, jurisdiction=jurisdiction,
    )


def _classify(jurisdiction, **kw):
    r = rights.classify(jurisdiction=jurisdiction, **kw)
    r["universal"] = all(rights.classify(jurisdiction=j, **kw)["allowsFullText"] for j in rights.JURISDICTIONS)
    return r


def _is_translation(page_lang, author_card, record=None):
    if record and (record.get("translatorPage") or record.get("mentionsTranslation")):
        return True
    langs = (author_card or {}).get("writesIn") or []
    key = (author_card or {}).get("key")
    if key and curated.POETS[key][2] in ("es", "en", "fr", "de"):
        langs = list(set(langs) | {curated.POETS[key][2]})
    return bool(langs) and page_lang not in langs


# ── summaries ───────────────────────────────────────────────────────────────


def _preview(lines, n=4):
    out = []
    for l in lines or []:
        if not l.strip():
            if out:
                break
            continue
        out.append(l)
        if len(out) >= n:
            break
    return out


def _ws_summaries(hits, jurisdiction, errors, require_author_page=None, known=None):
    page_qid = dict(known or {})
    by_lang = {}
    for h in hits:
        by_lang.setdefault(h["lang"], set()).update(t for t in h["authorPages"] if (h["lang"], t) not in page_qid)
    for lang, titles in by_lang.items():
        if not titles:
            continue
        # German "author pages" are the categories named after each author.
        try:
            page_qid.update({(lang, t): q for t, q in wikisource.page_qids(lang, list(titles)).items()})
        except SourceUnavailable:
            if not any(e["source"] == "wikisource" for e in errors):
                errors.append(source_error("wikisource"))
    people = _people({q for q in page_qid.values()}, errors)
    out = []
    for h in hits:
        authors = []
        for p in h["authorPages"]:
            qid = page_qid.get((h["lang"], p))
            card = people.get(qid) if qid else None
            if h["lang"] == "de" and not (card and card.get("isHuman") and card.get("isWriter")):
                continue  # German categories that aren't writers (places, topics…)
            authors.append(card or {"qid": qid, "name": p.split(":", 1)[-1], "birthYear": None, "deathYear": None})
        if require_author_page and h["authorPages"] != [require_author_page] and not (
            h["lang"] == "de" and len(authors) == 1
        ):
            continue
        if not authors:
            continue
        summary = {
            "id": make_id("wikisource", h["lang"], h["pageTitle"]),
            "source": "wikisource",
            "sourceName": f"Wikisource ({LANG_NAMES[h['lang']]})",
            "lang": h["lang"],
            "title": h["title"],
            "collection": h["collection"],
            "url": wikisource.page_url(h["lang"], h["pageTitle"]),
            "preview": None,
            "linecount": None,
        }
        if len(authors) == 1:
            a = authors[0]
            summary["title"] = wikisource.strip_author(h["title"], a.get("name"))
            translation = _is_translation(h["lang"], a)
            summary["author"] = _public_person(a) if a.get("qid") else {"name": a["name"]}
            r = _classify(jurisdiction, author_name=a["name"], author_death=a.get("deathYear"),
                          is_translation=translation, source_declares_pd=True)
            r["provisional"] = True
            summary["isTranslation"] = translation
        else:
            summary["author"] = None
            summary["authors"] = [{"qid": a.get("qid"), "name": a["name"]} for a in authors]
            r = {"status": "unknown", "label": "Autoría por verificar", "allowsFullText": False, "provisional": True,
                 "explanation": "La página cita a varias personas (por ejemplo, autor y traductor). "
                                "Al abrirla comprobamos quién es quién antes de mostrar el texto."}
        summary["rights"] = {k: r.get(k) for k in ("status", "label", "allowsFullText", "provisional", "explanation", "until")}
        out.append(summary)
    return out


def _pdb_card(people, author_name):
    qid = curated.POETRYDB_AUTHORS.get(author_name)
    card = people.get(qid) if qid else None
    if card and not card.get("name"):
        card = {**card, "name": author_name}
    return card


def _pdb_full(rows):
    """Fetch the lines of a page of PoetryDB rows (parallel, cached)."""
    def one(r):
        if r.get("lines"):
            return r
        try:
            return poetrydb.poem(r["author"], r["title"]) or r
        except SourceUnavailable:
            return r
    with ThreadPoolExecutor(max_workers=4) as pool:
        return list(pool.map(one, rows))


def _pdb_summaries(rows, jurisdiction, errors, with_preview=True):
    qids = {curated.POETRYDB_AUTHORS.get(r["author"]) for r in rows}
    people = _people(qids, errors)
    if with_preview:
        rows = _pdb_full(rows)
    out = []
    for r in rows:
        card = _pdb_card(people, r["author"])
        name = card["name"] if card else r["author"]
        rr = _classify(jurisdiction, author_name=name, author_death=(card or {}).get("deathYear"),
                       source_declares_pd=True)
        allowed = rr["allowsFullText"]
        out.append({
            "id": make_id("poetrydb", "en", f"{r['author']}\n{r['title']}"),
            "source": "poetrydb",
            "sourceName": "PoetryDB",
            "lang": "en",
            "title": r["title"],
            "collection": None,
            "url": poetrydb.source_url(r["author"], r["title"]),
            "author": _public_person(card) if card else {"name": r["author"]},
            "preview": _preview(r.get("lines")) if (allowed and with_preview and r.get("lines")) else None,
            "linecount": r.get("linecount"),
            "isTranslation": False,
            "rights": {k: rr.get(k) for k in ("status", "label", "allowsFullText", "explanation", "until")},
        })
    return out


# ── query interpretation ────────────────────────────────────────────────────

_STOP = {"poema", "poemas", "poesia", "poesias", "verso", "versos", "de", "del", "la", "el", "los", "las", "sobre",
         "y", "en", "a", "un", "una", "con", "por", "para", "acerca", "que", "lengua", "idioma", "autor", "autores",
         "poeta", "poetas", "obra", "obras"}
_LANG_WORDS = {
    "es": ["espanol", "castellano", "hispanica", "hispanicos", "hispana", "spanish"],
    "en": ["ingles", "inglesa", "english", "anglosajona"],
    "fr": ["frances", "francesa", "francais", "french"],
    "de": ["aleman", "alemana", "deutsch", "german"],
}
_MOVEMENT_WORDS = {
    "romanticismo": ["romanticismo", "romantico", "romanticos", "romantica", "romanticas", "romanticism"],
    "modernismo": ["modernismo", "modernista", "modernistas"],
    "simbolismo": ["simbolismo", "simbolista", "simbolistas", "symbolism"],
    "siglo-de-oro": ["siglo de oro", "barroco", "barroca", "renacimiento espanol", "culteranismo", "conceptismo"],
    "renacimiento": ["isabelino", "isabelina", "renacimiento ingles", "metafisicos"],
    "generacion-27": ["generacion del 27", "generacion de 27", "generacion 27", "grupo del 27"],
    "vanguardias": ["vanguardia", "vanguardias", "vanguardista", "ultraismo", "creacionismo", "surrealismo"],
    "medieval": ["medieval", "edad media"],
    "antiguedad": ["antiguedad", "griega antigua", "lirica griega"],
}
_ERA_WORDS = {
    "xix": ["siglo xix", "siglo 19", "s xix", "1800s", "decimonono", "decimononica"],
    "xx": ["siglo xx", "siglo 20", "s xx", "1900s"],
    "xviii": ["siglo xviii", "siglo 18", "s xviii", "ilustracion", "neoclasico", "neoclasicismo"],
    "xvi-xvii": ["siglo xvi", "siglo xvii", "siglo 16", "siglo 17"],
    "medieval": [],
    "antigua": ["antigua", "clasica antigua"],
}


def _take(text, phrases):
    for ph in sorted(phrases, key=len, reverse=True):
        pattern = r"(?:^| )" + re.escape(ph) + r"(?: |$)"
        if re.search(pattern, text):
            return True, re.sub(pattern, " ", text).strip()
    return False, text


def interpret(q):
    text = fold(q)
    result = {"query": q, "language": None, "theme": None, "movement": None, "era": None, "author": None,
              "terms": ""}
    for lang, words in _LANG_WORDS.items():
        hit, text = _take(text, words)
        if hit:
            result["language"] = lang
            break
    for key, words in _MOVEMENT_WORDS.items():
        hit, text = _take(text, words)
        if hit:
            result["movement"] = {"key": key, "label": curated.MOVEMENTS[key]["label"]}
            break
    for key, words in _ERA_WORDS.items():
        hit, text = _take(text, words)
        if hit:
            result["era"] = {"key": key, "label": curated.ERAS[key]["label"]}
            break
    for key, t in curated.THEMES.items():
        words = {fold(t["label"]), key.replace("-", " "), fold(t["terms"]["es"])}
        if key == "suenos":
            words |= {"sueno", "suenos"}
        hit, text = _take(text, words)
        if hit:
            result["theme"] = {"key": key, "label": t["label"]}
            break
    rest = " ".join(w for w in text.split() if w not in _STOP)
    result["terms"] = rest
    if rest and len(rest) >= 3:
        try:
            qid = wikidata.search_person(rest)
        except SourceUnavailable:
            qid = None
            result["error"] = source_error("wikidata")
        if qid:
            card = _people([qid]).get(qid)
            if card:
                key = card.get("key")
                own = set(card.get("writesIn") or []) | ({curated.POETS[key][2]} if key else set())
                result["author"] = {**_public_person(card), "wikisource": card.get("wikisource"),
                                    "writesIn": sorted(own), "rights": author_rights(card, "intl"),
                                    "poetrydb": qid in _PDB_BY_QID}
                result["terms"] = ""
    return result


# ── search ──────────────────────────────────────────────────────────────────


def search(q, *, source, lang="es", jurisdiction="intl", offset=0, limit=10, author_qid=None, theme=None):
    """Poems from one source for a query, an author or a theme."""
    errors = []
    items, total, nxt = [], 0, None
    if source == "wikisource":
        lang = lang if lang in wikisource.LANGS else "es"
        try:
            if author_qid:
                card = _people([author_qid], errors).get(author_qid)
                page = (card or {}).get("wikisource", {}).get(lang)
                if not page:
                    return {"items": [], "total": 0, "next": None, "errors": errors,
                            "note": f"Wikisource en {LANG_NAMES[lang]} no tiene una página de este autor."}
                hits, total, nxt = wikisource.search(lang, author_page=page, limit=limit, offset=offset)
                # The author is known: no need to look their page up again.
                items = _ws_summaries(hits, jurisdiction, errors, require_author_page=page,
                                      known={(lang, page): author_qid})
            else:
                term = curated.THEMES[theme]["terms"][lang] if theme in curated.THEMES else q
                if not (term or "").strip():
                    return {"items": [], "total": 0, "next": None, "errors": errors}
                hits, total, nxt = wikisource.search(lang, term, limit=limit, offset=offset)
                items = _ws_summaries(hits, jurisdiction, errors)
        except SourceUnavailable:
            errors.append(source_error("wikisource"))
    elif source == "poetrydb":
        try:
            if author_qid:
                name = _PDB_BY_QID.get(author_qid)
                rows = sorted(poetrydb.by_author(name), key=lambda r: fold(r["title"])) if name else []
                total = len(rows)
                page_rows = rows[offset : offset + limit]
                items = _pdb_summaries(page_rows, jurisdiction, errors, with_preview=False)
            else:
                term = (curated.THEMES[theme]["terms"]["en"] if theme in curated.THEMES else q or "").strip()
                rows, in_title = [], set()
                if term:
                    seen = set()
                    titled = poetrydb.by_title(term)
                    for r in titled + poetrydb.by_lines(term):
                        k = (r["author"], r["title"])
                        if k not in seen:
                            seen.add(k)
                            rows.append(r)
                    in_title = {(r["author"], r["title"]) for r in titled}
                famous = set(curated.DAILY_EN)
                known = {v for v in curated.POETRYDB_AUTHORS}
                rows.sort(key=lambda r: ((r["author"], r["title"]) not in in_title, r["author"] not in famous,
                                         r["linecount"] > 40, r["author"] not in known, r["title"].lower()))
                total = len(rows)
                items = _pdb_summaries(rows[offset : offset + limit], jurisdiction, errors)
            nxt = offset + limit if offset + limit < total else None
        except SourceUnavailable:
            errors.append(source_error("poetrydb"))
    else:
        raise NotFound("Fuente desconocida.")
    return {"items": items, "total": total, "next": nxt, "errors": errors}


# ── single poem ─────────────────────────────────────────────────────────────

_poem_memo = {}
_poem_lock = threading.Lock()


def _attribution(rec):
    parts = [f"«{rec['title']}»"]
    if rec.get("author"):
        parts.append(rec["author"]["name"])
    if rec.get("translator"):
        parts.append(f"trad. {rec['translator']['name']}")
    if rec.get("year"):
        parts.append(str(rec["year"]))
    src = rec["source"]
    line = ", ".join(parts) + f". Fuente: {src['name']} — {src['pageUrl']}"
    if rec["rights"]["status"] == "open_license" and rec["rights"].get("license"):
        line += f" ({rec['rights']['license']})"
    elif rec["rights"]["status"] == "public_domain":
        line += " (dominio público)"
    return line


def get_poem(pid, jurisdiction="intl"):
    source, lang, key = parse_id(pid)
    errors = []
    if source == "wikisource":
        page = wikisource.fetch(lang, key)
        if not page:
            raise NotFound("Esta página de Wikisource no contiene un poema en verso que podamos mostrar.")
        titles = [t for t in (page["authorPage"], page["translatorPage"]) if t]
        try:
            qids = wikisource.page_qids(lang, titles) if titles else {}
        except SourceUnavailable:
            qids = {}
            errors.append(source_error("wikisource"))
        people = _people(qids.values(), errors)
        a_card = people.get(qids.get(page["authorPage"])) if page["authorPage"] else None
        t_card = people.get(qids.get(page["translatorPage"])) if page["translatorPage"] else None
        author = _public_person(a_card) if a_card else ({"name": page["authorName"]} if page["authorName"] else None)
        translation = _is_translation(lang, a_card, page)
        translator = None
        if page["translatorPage"] or page["translatorName"]:
            translator = _public_person(t_card) if t_card else {"name": page["translatorName"]}
        r = _classify(
            jurisdiction,
            author_name=(author or {}).get("name", ""), author_death=(author or {}).get("deathYear"),
            translator_name=(translator or {}).get("name"), translator_death=(translator or {}).get("deathYear"),
            is_translation=translation, pub_year=page["year"], source_declares_pd=True,
            source_max_term=page["sourceMaxTerm"], license_name=page["license"], license_url=page["licenseUrl"],
        )
        if not author:
            r.update(status="unknown", label=rights.STATUS_LABELS["unknown"], allowsFullText=False, universal=False,
                     explanation="La fuente no identifica la autoría de este texto. Mostramos solo la referencia.")
        rec = {
            "id": pid,
            "ref": {"source": "wikisource", "sourceId": pid},
            "title": wikisource.strip_author(page["title"], (author or {}).get("name")),
            "altTitle": page["altTitle"],
            "subtitle": page["subtitle"],
            "lang": lang,
            "langName": LANG_NAMES[lang],
            "collection": page["collection"],
            "year": page["year"],
            "publisher": page["publisher"],
            "author": author,
            "translator": translator,
            "isTranslation": translation,
            "wikidata": page["wikidata"],
            "source": {**SOURCE_INFO["wikisource"], "key": "wikisource", "name": f"Wikisource ({LANG_NAMES[lang]})",
                       "pageUrl": page["url"]},
            "_lines": page["lines"],
        }
    else:
        author_name, _, title = key.partition("\n")
        row = poetrydb.poem(author_name, title)
        if not row:
            raise NotFound("PoetryDB no tiene este poema.")
        qid = curated.POETRYDB_AUTHORS.get(author_name)
        card = _pdb_card(_people([qid], errors), author_name) if qid else None
        author = _public_person(card) if card else {"name": author_name}
        r = _classify(jurisdiction, author_name=author["name"], author_death=(card or {}).get("deathYear"),
                      source_declares_pd=True)
        if not card and qid:
            r["explanation"] = ("No hemos podido consultar Wikidata ahora mismo para comprobar las fechas de "
                                f"{author_name}. Mostramos solo la referencia; vuelve a intentarlo en un momento.")
        elif not card:
            r["explanation"] = ("No hemos podido identificar con certeza a «" + author_name + "» en Wikidata, así que "
                                "no podemos comprobar sus fechas. Mostramos solo la referencia.")
        rec = {
            "id": pid,
            "ref": {"source": "poetrydb", "sourceId": pid},
            "title": row["title"],
            "altTitle": None,
            "subtitle": None,
            "lang": "en",
            "langName": LANG_NAMES["en"],
            "collection": None,
            "year": None,
            "publisher": None,
            "author": author,
            "translator": None,
            "isTranslation": False,
            "wikidata": None,
            "source": {**SOURCE_INFO["poetrydb"], "key": "poetrydb", "name": "PoetryDB",
                       "pageUrl": poetrydb.source_url(author_name, row["title"])},
            "_lines": [l.rstrip() for l in row.get("lines") or []],
        }
        # PoetryDB marks stanza breaks with empty strings; collapse runs.
        cleaned = []
        for l in rec["_lines"]:
            if not l.strip():
                if cleaned and cleaned[-1] != "":
                    cleaned.append("")
            else:
                cleaned.append(l)
        while cleaned and cleaned[-1] == "":
            cleaned.pop()
        rec["_lines"] = cleaned

    lines = rec.pop("_lines")
    verse = [l for l in lines if l.strip()]
    rec["rights"] = r
    rec["linecount"] = len(verse)
    rec["stanzas"] = 1 + sum(1 for l in lines if not l.strip()) if verse else 0
    rec["wordCount"] = sum(len(l.split()) for l in verse)
    rec["lines"] = lines if r["allowsFullText"] else None
    rec["attribution"] = _attribution(rec)
    rec["errors"] = errors
    return rec


# ── authors ─────────────────────────────────────────────────────────────────


def author(qid, jurisdiction="intl"):
    if not re.fullmatch(r"Q\d+", qid or ""):
        raise NotFound("Autor no válido.")
    card = wikidata.person(qid)
    if not card or not card.get("isHuman"):
        raise NotFound("No encontramos a este autor en Wikidata.")
    errors = []
    bio = None
    for lang in ("es", "en"):
        title = card["wikipedia"].get(lang)
        if title:
            bio = wikidata.wikipedia_summary(title, lang)
            if bio:
                break
    try:
        works = wikidata.works(qid)
    except SourceUnavailable:
        works = []
        errors.append({"source": "wikidata", "message": "El catálogo de obras de Wikidata no responde ahora mismo."})
    key = card.get("key")
    poetrydb_name = _PDB_BY_QID.get(qid)
    return {
        **{k: card.get(k) for k in ("qid", "key", "name", "description", "birthYear", "deathYear", "image",
                                    "movements", "countries", "notableWorks", "isPoet", "writesIn")},
        "bio": bio,
        "rights": author_rights(card, jurisdiction),
        "works": works,
        "curatedMovements": [{"key": m, "label": curated.MOVEMENTS[m]["label"]} for m in (curated.POETS[key][4] if key else [])],
        "sources": {
            "wikisource": [l for l in wikisource.LANGS if card["wikisource"].get(l)],
            "poetrydb": bool(poetrydb_name),
        },
        "links": {
            "wikidata": f"https://www.wikidata.org/wiki/{qid}",
            "wikipedia": (bio or {}).get("url"),
            "wikisource": {l: wikisource.page_url(l, t) for l, t in card["wikisource"].items()},
        },
        "errors": errors,
    }


def poets(keys, jurisdiction="intl", errors=None):
    """Cards for curated poets (one batched Wikidata request per 50)."""
    keys = [k for k in keys if k in curated.POETS]
    people = _people([curated.POETS[k][0] for k in keys], errors)
    out = []
    for k in keys:
        qid, name, lang, region, movements = curated.POETS[k]
        card = people.get(qid) or {"qid": qid, "key": k, "name": name, "birthYear": None, "deathYear": None,
                                   "image": None, "description": ""}
        r = author_rights(card, jurisdiction) if qid in people else {"status": "unknown",
                                                                     "label": rights.STATUS_LABELS["unknown"]}
        out.append({
            "qid": qid, "key": k, "name": name, "lang": lang, "region": region,
            "birthYear": card.get("birthYear"), "deathYear": card.get("deathYear"), "image": card.get("image"),
            "description": card.get("description") or "",
            "movements": [{"key": m, "label": curated.MOVEMENTS[m]["label"]} for m in movements],
            "rights": {"status": r["status"], "label": r["label"]},
        })
    return out


def floruit(p):
    if p.get("birthYear") is not None:
        return p["birthYear"] + 30
    if p.get("deathYear") is not None:
        return p["deathYear"] - 10
    return None


def poets_filtered(*, movement=None, era=None, language=None, section=None, jurisdiction="intl"):
    errors = []
    if section:
        sec = next((s for s in curated.SECTIONS if s["key"] == section), None)
        if not sec:
            raise NotFound("Sección desconocida.")
        keys = sec["poets"]
    elif movement:
        if movement not in curated.MOVEMENTS:
            raise NotFound("Movimiento desconocido.")
        keys = curated.MOVEMENTS[movement]["poets"]
    else:
        keys = list(curated.POETS)
    cards = poets(keys, jurisdiction, errors)
    if language:
        cards = [c for c in cards if c["lang"] == language]
    if era in curated.ERAS:
        lo, hi = curated.ERAS[era]["range"]
        cards = [c for c in cards if floruit(c) is not None and lo <= floruit(c) <= hi]
    return {"poets": cards, "errors": errors}


# ── explore, daily, random ──────────────────────────────────────────────────


def explore(jurisdiction="intl"):
    errors = []
    all_keys = list(dict.fromkeys(curated.FEATURED + [k for s in curated.SECTIONS for k in s["poets"]]))
    cards = {c["key"]: c for c in poets(all_keys, jurisdiction, errors)}
    return {
        "featured": [cards[k] for k in curated.FEATURED if k in cards],
        "sections": [{"key": s["key"], "title": s["title"], "subtitle": s["subtitle"],
                      "poets": [cards[k] for k in s["poets"] if k in cards]} for s in curated.SECTIONS],
        "themes": [{"key": k, "label": v["label"]} for k, v in curated.THEMES.items()],
        "movements": [{"key": k, "label": v["label"], "blurb": v["blurb"], "count": len(v["poets"])}
                      for k, v in curated.MOVEMENTS.items()],
        "eras": [{"key": k, "label": v["label"]} for k, v in curated.ERAS.items()],
        "languages": [{"key": k, "label": v["label"]} for k, v in curated.LANGUAGES.items()],
        "errors": errors,
    }


def _short_enough(rec):
    return rec and rec["rights"]["allowsFullText"] and rec["rights"].get("universal") and 4 <= rec["linecount"] <= 48


def _pick_es(rng, jurisdiction):
    pool = list(curated.DAILY_ES)
    rng.shuffle(pool)
    for key in pool[:3]:
        qid = curated.POETS[key][0]
        card = _people([qid]).get(qid)
        page = (card or {}).get("wikisource", {}).get("es")
        if not page:
            continue
        titles = sorted(wikisource.author_titles("es", page))
        rng.shuffle(titles)
        for t in titles[:2]:
            try:
                rec = get_poem(make_id("wikisource", "es", t), jurisdiction)
            except NotFound:
                continue
            if _short_enough(rec):
                return rec
    return None


def _pick_en(rng, jurisdiction):
    pool = list(curated.DAILY_EN)
    rng.shuffle(pool)
    for name in pool[:3]:
        rows = sorted((r for r in poetrydb.by_author(name) if 4 <= r["linecount"] <= 40), key=lambda r: r["title"])
        if not rows:
            continue
        r = rng.choice(rows)
        try:
            rec = get_poem(make_id("poetrydb", "en", f"{r['author']}\n{r['title']}"), jurisdiction)
        except NotFound:
            continue
        if _short_enough(rec):
            return rec
    return None


_daily_memo = {}


def daily(jurisdiction="intl"):
    """Poem of the day: same for everyone on a given date, free in every jurisdiction."""
    today = date.today()
    cached = _daily_memo.get(today) or http_client.cache_lookup(f"poetry-daily:{today.isoformat()}", 2 * 86400)
    if cached:
        return {**get_poem(cached, jurisdiction), "day": today.isoformat()}
    seed = int(hashlib.sha256(today.isoformat().encode()).hexdigest(), 16)
    order = [_pick_es, _pick_en] if today.toordinal() % 2 == 0 else [_pick_en, _pick_es]
    last_error = None
    for pick in order:
        try:
            rec = pick(_random.Random(seed), jurisdiction)
        except SourceUnavailable as exc:
            last_error = exc
            continue
        if rec:
            _daily_memo.clear()
            _daily_memo[today] = rec["id"]
            http_client.cache_store(f"poetry-daily:{today.isoformat()}", rec["id"])
            return {**rec, "day": today.isoformat()}
    if last_error:
        raise last_error
    raise NotFound("No hemos podido elegir el poema del día.")


def random_poem(jurisdiction="intl", lang=None):
    rng = _random.Random(time.time_ns())
    picks = {"es": [_pick_es], "en": [_pick_en]}.get(lang) or rng.sample([_pick_es, _pick_en], 2)
    last_error = None
    for pick in picks:
        try:
            rec = pick(rng, jurisdiction)
        except SourceUnavailable as exc:
            last_error = exc
            continue
        if rec:
            return rec
    if last_error:
        raise last_error
    raise NotFound("No hemos encontrado un poema al azar ahora mismo.")


def meta():
    return {
        "jurisdictions": rights.public_jurisdictions(),
        "languages": [{"key": k, "label": v["label"]} for k, v in curated.LANGUAGES.items()],
        "themes": [{"key": k, "label": v["label"]} for k, v in curated.THEMES.items()],
        "movements": [{"key": k, "label": v["label"]} for k, v in curated.MOVEMENTS.items()],
        "eras": [{"key": k, "label": v["label"]} for k, v in curated.ERAS.items()],
        "sources": [{"key": k, **v} for k, v in SOURCE_INFO.items()],
        "wikimediaIdentified": bool(config.CONTACT),
        "statusLabels": rights.STATUS_LABELS,
    }
