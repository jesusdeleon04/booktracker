"""
Poetry library API (read-only, public sources).

The user's collection lives in Supabase (with RLS); this blueprint only finds,
verifies and serves poems. Full texts are returned only when the rights engine
allows it for the reader's jurisdiction (`?j=`).
"""
from flask import Blueprint, request

from services.http_client import SourceUnavailable
from services.poetry import catalog, rights

from .common import fail, ok

bp = Blueprint("poetry", __name__, url_prefix="/api/poetry")


def _jur():
    j = (request.args.get("j") or "intl").strip().lower()
    return j if j in rights.JURISDICTIONS else "intl"


def _int(name, default, lo, hi):
    try:
        return max(lo, min(hi, int(request.args.get(name, default))))
    except (TypeError, ValueError):
        return default


@bp.errorhandler(catalog.NotFound)
def _not_found(exc):
    return fail(str(exc) or "No encontrado.", 404)


@bp.errorhandler(SourceUnavailable)
def _unavailable(exc):
    host = str(exc)
    source = "poetrydb" if "poetrydb" in host else "wikisource" if "wikisource" in host else "wikidata"
    err = catalog.source_error(source)
    return fail(err["message"], 503, source=source)


@bp.get("/meta")
def meta():
    return ok(catalog.meta())


@bp.get("/interpret")
def interpret():
    q = (request.args.get("q") or "").strip()[:200]
    if not q:
        return fail("Escribe algo que buscar.")
    return ok(catalog.interpret(q))


@bp.get("/search")
def search():
    q = (request.args.get("q") or "").strip()[:200]
    source = request.args.get("source", "wikisource")
    author = (request.args.get("author") or "").strip() or None
    theme = (request.args.get("theme") or "").strip() or None
    if not (q or author or theme):
        return fail("Falta la búsqueda.")
    return ok(catalog.search(
        q, source=source, lang=request.args.get("lang", "es"), jurisdiction=_jur(),
        offset=_int("offset", 0, 0, 5000), limit=_int("limit", 10, 1, 20), author_qid=author, theme=theme,
    ))


@bp.get("/poems/<pid>")
def poem(pid):
    return ok(catalog.get_poem(pid, _jur()))


@bp.get("/authors/<qid>")
def author(qid):
    return ok(catalog.author(qid, _jur()))


@bp.get("/poets")
def poets():
    return ok(catalog.poets_filtered(
        movement=request.args.get("movement") or None, era=request.args.get("era") or None,
        language=request.args.get("language") or None, section=request.args.get("section") or None,
        jurisdiction=_jur(),
    ))


@bp.get("/explore")
def explore():
    return ok(catalog.explore(_jur()))


@bp.get("/daily")
def daily():
    return ok(catalog.daily(_jur()))


@bp.get("/random")
def random_poem():
    return ok(catalog.random_poem(_jur(), request.args.get("lang") or None))
