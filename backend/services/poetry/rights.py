"""
Copyright status of a poem, per jurisdiction.

The app never assumes a text is free because it is online. A poem is shown in
full (and can be stored, downloaded as PDF or copied to the studio) only when:

  * the source publishes it under an open licence (CC BY / CC BY-SA), or
  * the source declares it public domain AND our own check, with the author's
    (and translator's) death year or the publication year, confirms it for the
    reader's jurisdiction.

Everything else is shown as a reference (title, author, first line as an
identifying incipit, link to the source).
"""
from datetime import date

# Term = years after the author's death; the work enters the public domain on
# 1 January of (death year + term + 1).
JURISDICTIONS = {
    "intl": {"label": "Internacional (prudente: vida + 80)", "term": 80},
    "es": {"label": "España", "term": 80},  # 80 for authors who died before 7-12-1987, else 70
    "mx": {"label": "México", "term": 100},
    "co": {"label": "Colombia", "term": 80},
    "ar": {"label": "Argentina", "term": 70},
    "cl": {"label": "Chile", "term": 70},
    "pe": {"label": "Perú", "term": 70},
    "uy": {"label": "Uruguay", "term": 70},
    "ve": {"label": "Venezuela", "term": 60},
    "eu": {"label": "Unión Europea", "term": 70},
    "us": {"label": "Estados Unidos", "term": None},  # publication year based
}

STATUS_LABELS = {
    "public_domain": "Dominio público",
    "open_license": "Licencia abierta",
    "protected": "Protegido por derechos de autor",
    "unknown": "Derechos sin verificar",
}


def today_year():
    return date.today().year


def _de(name):
    """'de' + name with the Spanish contraction: 'de el traductor' → 'del traductor'."""
    return "del " + name[3:] if name.startswith("el ") else "de " + name


def jurisdiction_term(jur, death_year):
    if jur == "es" and death_year is not None:
        return 80 if death_year < 1987 else 70
    return JURISDICTIONS.get(jur, JURISDICTIONS["intl"])["term"]


def _pd_from_death(jur, death_year, year):
    term = jurisdiction_term(jur, death_year)
    free_from = death_year + term + 1
    return year >= free_from, free_from


def classify(
    *,
    author_name="",
    author_death=None,
    translator_name=None,
    translator_death=None,
    is_translation=False,
    pub_year=None,
    source_declares_pd=False,
    source_max_term=None,
    license_name=None,
    license_url=None,
    jurisdiction="intl",
):
    jur = jurisdiction if jurisdiction in JURISDICTIONS else "intl"
    jlabel = JURISDICTIONS[jur]["label"]
    year = today_year()
    result = {
        "jurisdiction": jur,
        "jurisdictionLabel": jlabel,
        "license": license_name,
        "licenseUrl": license_url,
        "until": None,
    }

    def done(status, explanation, until=None):
        result.update(
            status=status,
            label=STATUS_LABELS[status] + (f" · {license_name}" if status == "open_license" and license_name else ""),
            explanation=explanation,
            until=until,
            allowsFullText=status in ("public_domain", "open_license"),
        )
        return result

    if license_name:
        return done("open_license", f"La fuente publica este texto con licencia {license_name}: puede leerse, guardarse y compartirse citando la autoría y la fuente.")

    if not source_declares_pd:
        return done("unknown", "La fuente no declara el estado de derechos de este texto. Mostramos solo la referencia y el enlace.")

    if is_translation and not translator_name:
        return done("unknown", "Es una traducción y la fuente no identifica al traductor, cuyos derechos son independientes del original. Mostramos solo la referencia.")

    # United States: works published before 96 years ago are public domain.
    if jur == "us":
        if pub_year and pub_year <= year - 96:
            return done("public_domain", f"Publicado en {pub_year}: en Estados Unidos las obras publicadas antes de {year - 95} son de dominio público.")
        if author_death and author_death + 70 < year and not pub_year:
            return done("public_domain", f"{author_name or 'El autor'} murió en {author_death} y la obra no consta como publicada recientemente.")
        until = (pub_year + 96) if pub_year else None
        return done("protected" if pub_year else "unknown",
                    f"En Estados Unidos la protección depende del año de publicación ({pub_year or 'desconocido'}).", until)

    people = [(author_name or "El autor", author_death)]
    if is_translation or translator_name:
        people.append((f"el traductor {translator_name}" if translator_name else "el traductor", translator_death))

    frees = []
    for name, death in people:
        if death is None:
            if pub_year and pub_year <= year - 150:
                frees.append((True, None, name, None))
                continue
            return done("unknown", f"No conocemos la fecha de muerte {_de(name)}, necesaria para comprobar los derechos en {jlabel}. Mostramos solo la referencia y el enlace a la fuente.")
        ok, free_from = _pd_from_death(jur, death, year)
        frees.append((ok, free_from, name, death))

    blocked = [f for f in frees if not f[0]]
    if blocked:
        _, free_from, name, death = max(blocked, key=lambda f: f[1])
        return done(
            "protected",
            f"{name[0].upper() + name[1:]} murió en {death}; en {jlabel} el plazo es de {jurisdiction_term(jur, death)} años, "
            f"así que la obra está protegida hasta el 31 de diciembre de {free_from - 1}. Solo mostramos la referencia y el enlace a la fuente.",
            until=free_from,
        )

    if source_max_term is not None and jurisdiction_term(jur, people[0][1]) and jurisdiction_term(jur, people[0][1]) > source_max_term:
        return done(
            "protected",
            f"Según la fuente, este texto solo es de dominio público en países con plazos de hasta {source_max_term} años tras la muerte del autor; en {jlabel} el plazo es mayor.",
        )

    details = "; ".join(f"{n} murió en {d}" for _, _, n, d in frees if d) or "La obra se publicó hace más de 150 años"
    since = max((f[1] for f in frees if f[1]), default=None)
    return done(
        "public_domain",
        f"{details[0].upper() + details[1:]}. En {jlabel} es de dominio público"
        + (f" desde {since}" if since else "")
        + ", y la fuente lo publica como texto libre.",
    )


def public_jurisdictions():
    return [{"key": k, "label": v["label"]} for k, v in JURISDICTIONS.items()]
