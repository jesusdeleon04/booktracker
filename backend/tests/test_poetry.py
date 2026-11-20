"""Poetry library: rights engine, verse extraction, ids and the API surface.

No network: sources are monkeypatched with real-shaped samples.
"""
import os
import tempfile

import pytest

from services.poetry import catalog, curated, rights, wikisource


@pytest.fixture()
def client():
    from app import create_app

    app = create_app("sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db"))
    return app.test_client()


@pytest.fixture(autouse=True)
def fixed_year(monkeypatch):
    monkeypatch.setattr(rights, "today_year", lambda: 2026)


# ── rights engine ───────────────────────────────────────────────────────────


def classify(**kw):
    kw.setdefault("source_declares_pd", True)
    return rights.classify(**kw)


def test_public_domain_everywhere_for_old_authors():
    for jur in rights.JURISDICTIONS:
        r = classify(author_name="Gustavo Adolfo Bécquer", author_death=1870, pub_year=1885, jurisdiction=jur)
        assert r["status"] == "public_domain", jur
        assert r["allowsFullText"]


def test_neruda_and_borges_are_protected():
    neruda = classify(author_name="Pablo Neruda", author_death=1973, jurisdiction="intl")
    assert neruda["status"] == "protected" and not neruda["allowsFullText"]
    assert neruda["until"] == 1973 + 80 + 1
    borges = classify(author_name="Jorge Luis Borges", author_death=1986, jurisdiction="ar")
    assert borges["status"] == "protected"
    assert "2056" in borges["explanation"]


def test_jurisdiction_changes_the_answer():
    # Rilke (†1926): free in Spain and the EU, still protected in Mexico (life + 100) in 2026.
    assert classify(author_name="Rilke", author_death=1926, jurisdiction="es")["status"] == "public_domain"
    mx = classify(author_name="Rilke", author_death=1926, jurisdiction="mx")
    assert mx["status"] == "protected" and mx["until"] == 2027
    # Lorca (†1936): Spain applies 80 years to authors who died before 1987.
    assert classify(author_name="Lorca", author_death=1936, jurisdiction="es")["status"] == "public_domain"
    assert classify(author_name="Lorca", author_death=1936, jurisdiction="mx")["status"] == "protected"
    # Spain uses 70 years for authors who died from 1987 on.
    assert rights.jurisdiction_term("es", 1990) == 70 and rights.jurisdiction_term("es", 1936) == 80


def test_unknown_when_source_or_dates_are_missing():
    assert classify(author_name="X", author_death=1800, source_declares_pd=False)["status"] == "unknown"
    r = classify(author_name="Anónimo", author_death=None, pub_year=1990)
    assert r["status"] == "unknown" and not r["allowsFullText"]
    # Very old publication without a known death date is safe.
    assert classify(author_name="Anónimo", author_death=None, pub_year=1700)["status"] == "public_domain"


def test_translations_need_the_translator():
    r = classify(author_name="Baudelaire", author_death=1867, is_translation=True)
    assert r["status"] == "unknown"
    r = classify(author_name="Baudelaire", author_death=1867, is_translation=True,
                 translator_name="Eduardo Marquina", translator_death=1946, jurisdiction="intl")
    assert r["status"] == "protected"  # the translation is protected even if the original is not
    assert "traductor" in r["explanation"]
    r = classify(author_name="Baudelaire", author_death=1867, is_translation=True,
                 translator_name="T", translator_death=1900, jurisdiction="intl")
    assert r["status"] == "public_domain"


def test_open_licence_and_united_states_rules():
    r = classify(author_name="Anon", license_name="CC BY-SA", license_url="https://creativecommons.org/")
    assert r["status"] == "open_license" and r["allowsFullText"]
    assert classify(author_name="A", author_death=1980, pub_year=1920, jurisdiction="us")["status"] == "public_domain"
    assert classify(author_name="A", author_death=1980, pub_year=1950, jurisdiction="us")["status"] == "protected"


def test_source_with_a_shorter_term_is_not_enough():
    # es.wikisource marks some pages "70 p.m.a. o menos": not free where the term is 80.
    r = classify(author_name="A", author_death=1950, source_max_term=70, jurisdiction="ve")
    assert r["status"] == "public_domain"
    r = classify(author_name="A", author_death=1940, source_max_term=70, jurisdiction="co")
    assert r["status"] == "protected"


# ── verse extraction ────────────────────────────────────────────────────────

ES_HTML = """<div id="ws-data"><span class="ws-title">Volverán las oscuras golondrinas</span></div>
<div class="ws-poema ws-poema-hi"><div class="ws-poema-estrofa"><span class="ws-poema-line">Volverán las oscuras golondrinas<span class="ws-poema-break"><br/></span></span><span class="ws-poema-line">En tu balcón sus nidos á colgar,<span class="ws-poema-break"><br/></span></span><span class="ws-poema-line"><span class="ws-poema-indent" style="width:2em">  </span>Jugando llamarán.<span class="ws-poema-break"><br/></span></span></div><div class="ws-poema-estrofa"><span class="ws-poema-line">Pero aquellas que el vuelo refrenaban<br/></span></div></div>"""

DE_HTML = """<div class="poem">
<p><b>DER PANTHER</b><br/>
<span style="font-size:95%">IM JARDIN DES PLANTES, PARIS</span><br/>
<br/>
Sein Blick ist vom Vorübergehn der Stäbe<br/>
so müd geworden, daß er nichts mehr hält.<br/>
<br/>
</p>
<div class="ws-noexport" style="position:relative;"><span class="zeilennummer">5</span></div>Der weiche Gang geschmeidig starker Schritte,<br/>
<p>der sich im allerkleinsten Kreise dreht,<br/>
</p></div>"""

FR_HTML = """<div class="poem verse">
<p><br />
Souvent, pour s’amuser, les hommes d’équipage<br />
&#160;&#160;&#160;&#160;Prennent des albatros<span class="pagenum">[11]</span>, vastes oiseaux des mers,<br />
<br />
À peine les ont-ils déposés sur les planches,
</p></div>"""


def test_spanish_wikisource_keeps_lines_stanzas_and_indent():
    lines = wikisource.extract_poem(ES_HTML)
    assert lines == [
        "Volverán las oscuras golondrinas",  # never dropped although it equals the title
        "En tu balcón sus nidos á colgar,",
        "    Jugando llamarán.",
        "",
        "Pero aquellas que el vuelo refrenaban",
    ]


def test_german_line_numbers_and_heading_are_removed():
    lines = wikisource.extract_poem(DE_HTML, ("Der Panther", "Der Panther", "Im Jardin des Plantes, Paris"))
    assert lines[0] == "Sein Blick ist vom Vorübergehn der Stäbe"
    assert "5" not in "".join(lines)
    assert lines[2] == ""  # stanza break preserved
    assert lines[3:] == ["Der weiche Gang geschmeidig starker Schritte,", "der sich im allerkleinsten Kreise dreht,"]


def test_french_page_numbers_and_spaces():
    lines = wikisource.extract_poem(FR_HTML)
    assert lines[0].startswith("Souvent")
    assert lines[1] == "    Prennent des albatros, vastes oiseaux des mers,"
    assert lines[2] == "" and lines[3].startswith("À peine")


def test_titles_are_cleaned():
    assert wikisource.clean_segment("Rimas (Bécquer, 1885)/Rima LIII") == "Rima LIII"
    assert wikisource.clean_segment("Ozymandias (Shelley)") == "Ozymandias"
    assert wikisource.clean_segment("Les Fleurs du mal (1868)/L’Albatros") == "L’Albatros"
    assert wikisource.clean_segment("Canción del pirata") == "Canción del pirata"


# ── ids, interpretation, API ────────────────────────────────────────────────


def test_ids_roundtrip_and_validation():
    pid = catalog.make_id("wikisource", "es", "Rimas (Bécquer, 1885)/Rima LIII")
    assert "/" not in pid and catalog.parse_id(pid) == ("wikisource", "es", "Rimas (Bécquer, 1885)/Rima LIII")
    pid = catalog.make_id("poetrydb", "en", "Emily Dickinson\nHope is the thing with feathers")
    assert catalog.parse_id(pid)[2].startswith("Emily Dickinson\n")
    for bad in ("", "ws.xx.QQ", "nope", "ws.es.***"):
        with pytest.raises(catalog.NotFound):
            catalog.parse_id(bad)


def test_interpretation_without_network(monkeypatch):
    monkeypatch.setattr(catalog, "_people", lambda qids, errors=None: {
        q: {"qid": q, "key": curated.BY_QID.get(q), "name": curated.POETS[curated.BY_QID[q]][1], "birthYear": 1904,
            "deathYear": 1973, "image": None, "description": "", "wikisource": {}} for q in qids})
    monkeypatch.setattr(catalog.wikidata, "search_person", lambda name: (_ for _ in ()).throw(AssertionError(name)))
    r = catalog.interpret("poemas de amor")
    assert r["theme"]["key"] == "amor" and r["author"] is None
    r = catalog.interpret("Romanticismo")
    assert r["movement"]["key"] == "romanticismo"
    r = catalog.interpret("poesía del siglo XIX en francés")
    assert r["era"]["key"] == "xix" and r["language"] == "fr"


def test_curated_lookup_skips_wikidata_search(monkeypatch):
    from services.poetry import wikidata

    monkeypatch.setattr(wikidata.http_client, "get_json", lambda *a, **k: (_ for _ in ()).throw(AssertionError(a)))
    assert wikidata.search_person("Neruda") == "Q34189"
    assert wikidata.search_person("Emily Dickinson") == "Q4441"
    assert wikidata.search_person("Bécquer") == "Q203715"


def test_curated_data_is_consistent():
    for section in curated.SECTIONS:
        assert all(k in curated.POETS for k in section["poets"])
    assert all(k in curated.POETS for k in curated.FEATURED + curated.DAILY_ES)
    assert all(a in curated.POETRYDB_AUTHORS for a in curated.DAILY_EN)
    assert len({v[0] for v in curated.POETS.values()}) == len(curated.POETS)


def test_api_meta_and_errors(client):
    res = client.get("/api/poetry/meta")
    assert res.status_code == 200
    data = res.get_json()["data"]
    assert {j["key"] for j in data["jurisdictions"]} >= {"intl", "es", "mx", "us"}
    assert client.get("/api/poetry/poems/not-an-id").status_code == 404
    assert client.get("/api/poetry/search").status_code == 400


def test_protected_text_never_leaves_the_api(client, monkeypatch):
    page = {
        "lang": "es", "pageTitle": "X/Poema", "title": "Poema", "altTitle": None, "subtitle": None,
        "lines": ["Verso uno", "Verso dos"], "year": 1960, "publisher": None, "collection": "X",
        "authorPage": "Autor:Alguien", "authorName": "Alguien", "translatorPage": None, "translatorName": None,
        "mentionsTranslation": False, "wikidata": None, "sourceMaxTerm": None, "license": None, "licenseUrl": None,
        "url": "https://es.wikisource.org/wiki/X/Poema",
    }
    monkeypatch.setattr(catalog.wikisource, "fetch", lambda lang, title: dict(page))
    monkeypatch.setattr(catalog.wikisource, "page_qids", lambda lang, titles: {"Autor:Alguien": "Q1"})
    monkeypatch.setattr(catalog, "_people", lambda qids, errors=None: {"Q1": {
        "qid": "Q1", "key": None, "name": "Alguien", "birthYear": 1900, "deathYear": 1970, "image": None,
        "description": "", "writesIn": ["es"]}})
    pid = catalog.make_id("wikisource", "es", "X/Poema")
    data = client.get(f"/api/poetry/poems/{pid}?j=es").get_json()["data"]
    assert data["rights"]["status"] == "protected"
    assert data["lines"] is None and "Verso" not in str(data)
    assert data["linecount"] == 2 and data["source"]["pageUrl"].startswith("https://es.wikisource.org")


def test_studio_writing_keeps_a_poem_reference_only(client):
    pid = catalog.make_id("wikisource", "es", "Rimas (Bécquer, 1885)/Rima LIII")
    insp = {"poemId": pid, "title": "Rima LIII", "author": "Gustavo Adolfo Bécquer", "source": "Wikisource",
            "url": "https://es.wikisource.org/wiki/X", "rights": "Dominio público", "kind": "reflection",
            "lines": ["no debe guardarse"]}
    res = client.post("/api/studio/writings", json={"title": "Sobre la Rima LIII", "content": "", "inspiration": insp})
    assert res.status_code == 201
    w = res.get_json()["data"]
    assert w["inspiration"]["poemId"] == pid and "lines" not in w["inspiration"]
    bad = client.post("/api/studio/writings", json={"title": "x", "inspiration": {"poemId": "javascript:1", "url": "x"}})
    assert bad.get_json()["data"]["inspiration"] is None
    res = client.patch(f"/api/studio/writings/{w['id']}", json={"inspiration": None})
    assert res.get_json()["data"]["inspiration"] is None
    assert res.get_json()["data"]["version"] == w["version"]  # metadata only: no text version bump
