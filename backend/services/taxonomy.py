"""
Literary taxonomy: app genres, cross-genre themes and moods.

This is the single source of truth for both the API and the UI (served at
`/api/meta`). Genre/theme detection works on the raw subjects returned by Open
Library and Google Books, which lets the recommender connect books from
different genres that share themes (e.g. existentialism in philosophy *and* in
fiction).
"""
from .text import fold

GENRES = [
    {
        "key": "fantasia", "label": "Fantasía", "tagline": "Mundos imposibles, magia y mitos",
        "colors": ["#2E3B5E", "#7B5EA7"], "query": "fantasy",
        "strong": ["fantasy", "fantasy fiction", "epic fantasy", "high fantasy", "fantasia", "wizards", "dragons",
                   "sword and sorcery", "magic fiction", "fantastic fiction"],
        "weak": ["magic", "elves", "fairy tales", "sorcery", "magia", "imaginary places", "quests", "mythical creatures"],
    },
    {
        "key": "ciencia-ficcion", "label": "Ciencia ficción", "tagline": "Futuros posibles, preguntas imposibles",
        "colors": ["#0F2F3A", "#2F8C8C"], "query": "science fiction",
        "strong": ["science fiction", "sci fi", "scifi", "ciencia ficcion", "space opera", "cyberpunk", "time travel",
                   "american science fiction", "english science fiction"],
        "weak": ["robots", "aliens", "extraterrestrial beings", "space colonies", "interplanetary voyages",
                 "life on other planets", "androids", "artificial intelligence", "futurology"],
    },
    {
        "key": "romance", "label": "Romance", "tagline": "Amores que cambian el rumbo",
        "colors": ["#5A1F2E", "#C2566B"], "query": "romance",
        "strong": ["romance", "romance fiction", "love stories", "novela romantica", "romantic fiction",
                   "romantic suspense fiction", "contemporary romance", "historical romance"],
        "weak": ["love", "man woman relationships", "courtship", "marriage", "romantic comedy"],
    },
    {
        "key": "thriller", "label": "Thriller", "tagline": "Tensión que no te deja dormir",
        "colors": ["#1C1C1C", "#8C2A1C"], "query": "thriller",
        "strong": ["thriller", "thrillers", "suspense", "suspense fiction", "psychological thriller", "espionage",
                   "spy stories", "thrillers fiction"],
        "weak": ["conspiracies", "kidnapping", "terrorism", "serial murderers", "fugitives from justice"],
    },
    {
        "key": "misterio", "label": "Misterio", "tagline": "Enigmas, pistas y detectives",
        "colors": ["#22263A", "#5A6B8C"], "query": "mystery",
        "strong": ["mystery", "mystery fiction", "mysteries", "detective and mystery stories", "whodunit",
                   "police procedural", "private investigators", "misterio", "novela policiaca", "policiaca",
                   "crime fiction", "detective fiction"],
        "weak": ["murder", "crime", "homicide", "investigation", "detectives", "asesinato", "police"],
    },
    {
        "key": "terror", "label": "Terror", "tagline": "Lo que acecha en la oscuridad",
        "colors": ["#120E0E", "#5C1A1A"], "query": "horror",
        "strong": ["horror", "horror fiction", "horror tales", "terror", "ghost stories", "gothic fiction",
                   "haunted houses", "vampires", "horror stories"],
        "weak": ["supernatural", "monsters", "occult", "zombies", "ghosts", "gothic", "fear", "demonology"],
    },
    {
        "key": "filosofia", "label": "Filosofía", "tagline": "Las grandes preguntas, sin prisa",
        "colors": ["#2B2A26", "#8A7A55"], "query": "philosophy",
        "strong": ["philosophy", "filosofia", "existentialism", "existencialismo", "philosophical novels",
                   "philosophical fiction", "ethics", "metaphysics", "stoicism", "phenomenology", "epistemology",
                   "political philosophy", "moral philosophy"],
        "weak": ["nihilism", "philosophers", "absurd", "existential", "free will", "reason"],
    },
    {
        "key": "psicologia", "label": "Psicología", "tagline": "La mente, sus luces y sus sombras",
        "colors": ["#2C2340", "#8B6FB0"], "query": "psychology",
        "strong": ["psychology", "psicologia", "psychoanalysis", "psychiatry", "cognitive psychology",
                   "social psychology", "mental health", "psychological fiction", "psychological"],
        "weak": ["emotions", "behavior", "personality", "mental illness", "self actualization psychology",
                 "consciousness", "neuropsychology"],
    },
    {
        "key": "historia", "label": "Historia", "tagline": "El pasado que nos explica",
        "colors": ["#3A2A1A", "#A0763E"], "query": "history",
        "strong": ["history", "historia", "world history", "military history", "ancient history", "civilization",
                   "historiography", "historical fiction", "historia universal"],
        "weak": ["historical", "medieval", "revolution", "empire", "world war", "civil war", "antiquities"],
    },
    {
        "key": "clasicos", "label": "Literatura clásica", "tagline": "Obras que resisten al tiempo",
        "colors": ["#2F2418", "#B08D57"], "query": "classic literature",
        "strong": ["classics", "classic literature", "classical literature", "clasicos", "literatura clasica",
                   "fiction classics", "classic fiction"],
        "weak": ["nobel prize", "open syllabus project", "canon"],
    },
    {
        "key": "contemporanea", "label": "Literatura contemporánea", "tagline": "Voces de nuestro tiempo",
        "colors": ["#1F2E2A", "#5E8C7A"], "query": "literary fiction",
        "strong": ["literary fiction", "contemporary fiction", "fiction literary", "literatura contemporanea",
                   "magic realism", "magical realism", "magic realism literature", "contemporary literature"],
        "weak": ["literary", "contemporary", "domestic fiction", "latin american fiction", "spanish american fiction",
                 "coming of age", "bildungsroman"],
    },
    {
        "key": "desarrollo-personal", "label": "Desarrollo personal", "tagline": "Hábitos, propósito y crecimiento",
        "colors": ["#3A3220", "#D1A84B"], "query": "self-help",
        "strong": ["self help", "personal development", "personal growth", "autoayuda",
                   "self improvement", "self actualization", "success", "self help techniques"],
        "weak": ["habits", "habit", "motivation", "productivity", "mindfulness", "happiness", "conduct of life",
                 "leadership"],
    },
    {
        "key": "ciencia", "label": "Ciencia", "tagline": "El universo explicado con asombro",
        "colors": ["#13263A", "#4C86B8"], "query": "popular science",
        "strong": ["science", "popular science", "physics", "biology", "astronomy", "cosmology", "evolution",
                   "chemistry", "neuroscience", "genetics", "ciencia", "mathematics", "astrophysics"],
        "weak": ["natural history", "brain", "quantum theory", "life sciences", "nature", "scientists"],
    },
    {
        "key": "biografias", "label": "Biografías", "tagline": "Vidas que merecen contarse",
        "colors": ["#302620", "#9C6B4E"], "query": "biography",
        "strong": ["biography", "autobiography", "memoir", "memoirs", "biografia", "memorias",
                   "biography autobiography", "personal narratives", "autobiografia"],
        "weak": ["diaries", "correspondence", "letters"],
    },
    {
        "key": "poesia", "label": "Poesía", "tagline": "La palabra en estado puro",
        "colors": ["#2A1F33", "#B07A9E"], "query": "poetry",
        "strong": ["poetry", "poesia", "poems", "poemas", "sonnets", "verse"],
        "weak": ["poets", "lyric poetry"],
    },
    {
        "key": "drama", "label": "Drama", "tagline": "Escenas, conflicto y catarsis",
        "colors": ["#331616", "#A8483A"], "query": "drama",
        "strong": ["drama", "plays", "theater", "theatre", "teatro", "tragedy", "tragedia", "english drama"],
        "weak": ["comedies", "playwrights"],
    },
    {
        "key": "distopia", "label": "Distopía", "tagline": "Sociedades al borde del abismo",
        "colors": ["#1A1D1F", "#6E7F6A"], "query": "dystopias",
        "strong": ["dystopia", "dystopias", "dystopian", "distopia", "distopias", "totalitarianism",
                   "post apocalyptic", "dystopian fiction", "totalitarismo"],
        "weak": ["surveillance", "apocalyptic", "utopias", "end of the world", "censorship"],
    },
    {
        "key": "aventura", "label": "Aventura", "tagline": "Viajes, mapas y horizontes",
        "colors": ["#1F3326", "#C27C2E"], "query": "adventure",
        "strong": ["adventure stories", "adventure fiction", "sea stories", "pirates", "survival"],
        "weak": ["adventure", "aventura", "aventuras", "action and adventure", "voyages", "explorers", "quests", "treasure",
                 "shipwrecks", "relatos de aventuras"],
    },
]

GENRE_BY_KEY = {g["key"]: g for g in GENRES}

ADJACENT = {
    "filosofia": ["psicologia", "poesia", "ciencia-ficcion", "clasicos", "distopia", "ciencia"],
    "psicologia": ["filosofia", "thriller", "contemporanea", "ciencia", "desarrollo-personal"],
    "fantasia": ["aventura", "ciencia-ficcion", "terror", "clasicos", "poesia"],
    "ciencia-ficcion": ["distopia", "filosofia", "ciencia", "fantasia", "terror"],
    "romance": ["drama", "contemporanea", "clasicos", "poesia"],
    "thriller": ["misterio", "terror", "psicologia", "distopia"],
    "misterio": ["thriller", "clasicos", "historia", "terror"],
    "terror": ["thriller", "fantasia", "clasicos", "misterio", "psicologia"],
    "historia": ["biografias", "clasicos", "aventura", "filosofia"],
    "clasicos": ["filosofia", "drama", "poesia", "historia", "romance"],
    "contemporanea": ["drama", "psicologia", "romance", "poesia", "biografias"],
    "desarrollo-personal": ["psicologia", "filosofia", "biografias", "ciencia"],
    "ciencia": ["filosofia", "ciencia-ficcion", "historia", "psicologia"],
    "biografias": ["historia", "desarrollo-personal", "contemporanea"],
    "poesia": ["filosofia", "drama", "clasicos", "romance"],
    "drama": ["clasicos", "poesia", "contemporanea", "romance"],
    "distopia": ["ciencia-ficcion", "filosofia", "thriller", "historia"],
    "aventura": ["fantasia", "historia", "ciencia-ficcion", "clasicos"],
}

FICTION_GENRES = {"fantasia", "ciencia-ficcion", "romance", "thriller", "misterio", "terror", "clasicos",
                  "contemporanea", "drama", "distopia", "aventura", "poesia"}
NONFICTION_GENRES = {"filosofia", "psicologia", "historia", "desarrollo-personal", "ciencia", "biografias"}

# Cross-genre themes: what a book is *about*, independent of its shelf.
THEMES = [
    {"key": "existencialismo", "label": "Existencialismo",
     "match": ["existentialism", "existential", "absurd", "absurdism", "meaning of life", "existencialismo",
               "existencial", "nihilism", "angst", "sentido de la vida"]},
    {"key": "identidad", "label": "Identidad",
     "match": ["identity", "selfhood", "self discovery", "identidad", "self perception", "identity psychology"]},
    {"key": "memoria", "label": "Memoria",
     "match": ["memory", "memories", "memoria", "recuerdos", "nostalgia", "remembrance", "recollections"]},
    {"key": "muerte", "label": "La muerte",
     "match": ["death", "dying", "grief", "mourning", "muerte", "duelo", "loss", "bereavement", "suicide"]},
    {"key": "amor", "label": "Amor",
     "match": ["love", "amor", "love stories", "desire", "man woman relationships", "relationships",
               "marriage", "romance"]},
    {"key": "soledad", "label": "Soledad",
     "match": ["loneliness", "solitude", "soledad", "isolation", "alienation", "alienacion", "outsiders"]},
    {"key": "mente", "label": "La mente",
     "match": ["consciousness", "mind", "conciencia", "mental illness", "madness", "insanity", "locura",
               "psychological fiction", "fiction psychological", "unconscious", "dreams", "psychology",
               "neuroscience", "brain"]},
    {"key": "poder", "label": "Poder",
     "match": ["power", "politics", "political", "politica", "totalitarianism", "government", "revolution",
               "tyranny", "dictatorship", "dictators", "propaganda", "political fiction"]},
    {"key": "guerra", "label": "Guerra",
     "match": ["war", "guerra", "world war", "military", "soldiers", "holocaust", "battles",
               "world war 1939 1945", "world war 1914 1918", "civil war"]},
    {"key": "tecnologia", "label": "Tecnología",
     "match": ["artificial intelligence", "robots", "technology", "computers", "inteligencia artificial",
               "cyberpunk", "virtual reality", "androids", "internet", "machine learning"]},
    {"key": "naturaleza", "label": "Naturaleza",
     "match": ["nature", "naturaleza", "animals", "environment", "ecology", "wilderness", "ocean", "sea",
               "climate", "forests", "natural history"]},
    {"key": "familia", "label": "Familia",
     "match": ["family", "familia", "fathers", "mothers", "siblings", "parent and child", "families",
               "fathers and sons", "mothers and daughters", "brothers", "sisters"]},
    {"key": "crecer", "label": "Crecer",
     "match": ["coming of age", "bildungsroman", "adolescence", "youth", "juventud", "growing up",
               "childhood", "infancia", "teenagers"]},
    {"key": "fe", "label": "Espiritualidad",
     "match": ["religion", "faith", "spirituality", "spiritual life", "god", "dios", "mysticism", "buddhism",
               "zen", "theology", "christianity", "meditation"]},
    {"key": "libertad", "label": "Libertad",
     "match": ["freedom", "libertad", "liberty", "oppression", "slavery", "emancipation", "free will"]},
    {"key": "sociedad", "label": "Desigualdad",
     "match": ["society", "social classes", "social conditions", "inequality", "sociedad", "social life and customs",
               "class", "poverty", "social problems", "racism"]},
    {"key": "viajes", "label": "Viajes",
     "match": ["travel", "journeys", "voyages and travels", "viajes", "road", "voyages", "travelers"]},
    {"key": "mitos", "label": "Mitología",
     "match": ["mythology", "myths", "legends", "mitologia", "folklore", "gods", "mythical creatures"]},
    {"key": "crimen", "label": "Crimen",
     "match": ["crime", "murder", "criminals", "guilt", "asesinato", "culpa", "justice", "trials"]},
    {"key": "felicidad", "label": "Propósito",
     "match": ["happiness", "felicidad", "purpose", "meaning", "well being", "wellbeing", "mindfulness",
               "conduct of life", "success"]},
    {"key": "cosmos", "label": "El cosmos",
     "match": ["universe", "cosmology", "astronomy", "stars", "cosmos", "outer space", "space", "physics",
               "black holes"]},
    {"key": "tiempo", "label": "El tiempo",
     "match": ["time", "time travel", "tiempo", "eternity", "immortality"]},
    {"key": "arte", "label": "Creación",
     "match": ["art", "artists", "authorship", "writers", "music", "musicians", "creativity",
               "painters", "books and reading"]},
]
THEME_BY_KEY = {t["key"]: t for t in THEMES}

MOODS = [
    {"key": "pensar", "label": "Para pensar", "blurb": "Ideas que se quedan contigo días después.",
     "colors": ["#2B2A26", "#8A7A55"], "queries": ["philosophy", "existentialism", "consciousness", "political science"],
     "genres": ["filosofia", "distopia", "ciencia"], "themes": ["existencialismo", "mente", "poder"]},
    {"key": "melancolico", "label": "Melancólico", "blurb": "Memoria, pérdida y belleza a media luz.",
     "colors": ["#1E2633", "#6B7F99"], "queries": ["grief", "memory", "loneliness", "nostalgia"],
     "genres": ["contemporanea", "poesia", "clasicos"], "themes": ["memoria", "muerte", "soledad"]},
    {"key": "evasion", "label": "Evasión total", "blurb": "Otros mundos para olvidarte de este.",
     "colors": ["#2E3B5E", "#7B5EA7"], "queries": ["fantasy", "adventure", "space opera", "quests"],
     "genres": ["fantasia", "aventura", "ciencia-ficcion"], "themes": ["viajes", "mitos"]},
    {"key": "inquietante", "label": "Inquietante", "blurb": "Historias que dejan la luz encendida.",
     "colors": ["#120E0E", "#5C1A1A"], "queries": ["horror", "gothic fiction", "psychological fiction", "ghost stories"],
     "genres": ["terror", "thriller", "distopia"], "themes": ["mente", "crimen"]},
    {"key": "luminoso", "label": "Luminoso", "blurb": "Calidez, humor y esperanza.",
     "colors": ["#3A3220", "#D1A84B"], "queries": ["friendship", "humorous fiction", "hope", "kindness"],
     "genres": ["contemporanea", "romance", "desarrollo-personal"], "themes": ["felicidad", "amor", "familia"]},
    {"key": "adrenalina", "label": "Adrenalina", "blurb": "Imposible soltarlo antes del final.",
     "colors": ["#1C1C1C", "#8C2A1C"], "queries": ["suspense", "thriller", "detective and mystery stories", "survival"],
     "genres": ["thriller", "misterio", "aventura"], "themes": ["crimen"]},
    {"key": "romantico", "label": "Corazón abierto", "blurb": "Amores, desamores y todo lo que hay en medio.",
     "colors": ["#5A1F2E", "#C2566B"], "queries": ["love stories", "romance", "love poetry", "relationships"],
     "genres": ["romance", "drama", "poesia"], "themes": ["amor"]},
    {"key": "curioso", "label": "Curiosidad", "blurb": "Para entender cómo funciona todo.",
     "colors": ["#13263A", "#4C86B8"], "queries": ["popular science", "cosmology", "evolution", "history of science"],
     "genres": ["ciencia", "historia", "biografias"], "themes": ["cosmos", "naturaleza"]},
]
MOOD_BY_KEY = {m["key"]: m for m in MOODS}

PURPOSES = {
    "pensar": {"label": "Pensar", "genres": ["filosofia", "ciencia", "distopia"], "themes": ["existencialismo", "mente", "poder"]},
    "sentir": {"label": "Sentir", "genres": ["romance", "drama", "poesia", "contemporanea"], "themes": ["amor", "muerte", "familia", "memoria"]},
    "aprender": {"label": "Aprender", "genres": ["historia", "ciencia", "biografias", "psicologia", "desarrollo-personal"], "themes": ["cosmos", "sociedad"]},
    "escapar": {"label": "Escapar", "genres": ["fantasia", "aventura", "ciencia-ficcion", "misterio"], "themes": ["viajes", "mitos"]},
}

_NONFICTION = {"filosofia", "psicologia", "historia", "ciencia", "biografias", "desarrollo-personal"}
_FICTION_SAFE = {"philosophical novels", "philosophical fiction", "psychological fiction", "psychological",
                 "historical fiction"}
# Longest needle first, so "action and adventure fiction" hits the weak
# "action and adventure" before the strong "adventure fiction".
_GENRE_PATTERNS = [
    (g["key"], sorted([(fold(m), 2.0) for m in g["strong"]] + [(fold(m), 0.75) for m in g["weak"]],
                      key=lambda nw: -len(nw[0])))
    for g in GENRES
]
_FALSE_FRIENDS = {"romance literature", "romance languages", "romance philology", "romance fiction history and criticism"}
_THEME_PATTERNS = [(t["key"], [fold(m) for m in t["match"]]) for t in THEMES]


def _phrase_hits(phrase, needle):
    if phrase == needle:
        return True
    return f" {needle} " in f" {phrase} "


def _fiction_signals(phrases):
    count = 0
    for p in phrases:
        if any(x in p for x in ("graphic", "comic", "criticism", "study and teaching", "history and")):
            continue
        if ("fiction" in p and "non" not in p) or "novel" in p or "ficcion" in p or "novela" in p or p == "romans":
            count += 1
    return count


def detect_genres(subjects, year=None, description=""):
    """
    Map raw subject phrases (already folded) to app genre keys, strongest first.

    Open Library subjects are crowd-sourced and noisy, so each genre collects
    strong evidence (an explicit genre label) and weak evidence (a motif such
    as "murder" or "magic"). Weak-only genres are kept only when nothing has
    strong evidence, and in fiction the non-fiction shelves ("history") only
    count as weak evidence.
    """
    phrases = list(subjects or [])
    nonfiction_hits = sum(
        1 for p in phrases for key, needles in _GENRE_PATTERNS if key in _NONFICTION
        for n, w in needles if w > 1 and p == n
    )
    fiction_count = _fiction_signals(phrases)
    fiction = fiction_count >= 2 or (fiction_count == 1 and nonfiction_hits <= 2)
    strong, weak, first_pos = {}, {}, {}
    for pos, phrase in enumerate(phrases):
        decay = 1 / (1 + pos / 12)
        for key, needles in _GENRE_PATTERNS:
            for needle, weight in needles:
                if not _phrase_hits(phrase, needle):
                    continue
                if key == "fantasia" and "realism" in phrase:
                    continue
                if key == "romance" and phrase in _FALSE_FRIENDS:
                    continue
                if weight > 1 and fiction and key in _NONFICTION and needle not in _FICTION_SAFE:
                    weight = 0.75
                bucket = strong if weight > 1 else weak
                bucket[key] = bucket.get(key, 0) + weight * decay
                first_pos.setdefault(key, pos)
                break
    scores = {k: min(strong.get(k, 0), 4) + min(weak.get(k, 0), 1.5) for k in set(strong) | set(weak)}
    if fiction and not (set(strong) & (FICTION_GENRES - {"clasicos", "contemporanea"})):
        if year and year < 1950:
            strong["clasicos"] = 1
            scores["clasicos"] = scores.get("clasicos", 0) + 1.5
        elif year and year >= 1970:
            strong["contemporanea"] = 1
            scores["contemporanea"] = scores.get("contemporanea", 0) + 1.5
    keys = [k for k in scores if k in strong] or [k for k in scores if scores[k] >= 1.0]
    if not keys and description:
        folded = f" {fold(description)} "
        for key, needles in _GENRE_PATTERNS:
            if any(f" {n} " in folded for n, w in needles if w > 1 and len(n) > 5):
                keys.append(key)
                scores[key] = 1
    keys.sort(key=lambda k: (-scores[k], first_pos.get(k, 999)))
    return keys[:3]


def detect_themes(subjects, description=""):
    scores = {}
    for phrase in subjects or []:
        for key, needles in _THEME_PATTERNS:
            if any(_phrase_hits(phrase, n) for n in needles):
                scores[key] = scores.get(key, 0) + 1
    if description:
        folded = f" {fold(description)} "
        for key, needles in _THEME_PATTERNS:
            if any(f" {n} " in folded for n in needles if len(n) > 4):
                scores[key] = scores.get(key, 0) + 0.5
    return [k for k, _ in sorted(scores.items(), key=lambda kv: -kv[1])][:6]


def genre_label(key):
    g = GENRE_BY_KEY.get(key)
    return g["label"] if g else key


def theme_label(key):
    t = THEME_BY_KEY.get(key)
    return t["label"] if t else key


def public_meta():
    return {
        "genres": [{k: g[k] for k in ("key", "label", "tagline", "colors")} for g in GENRES],
        "themes": [{"key": t["key"], "label": t["label"]} for t in THEMES],
        "moods": [{k: m[k] for k in ("key", "label", "blurb", "colors", "genres")} for m in MOODS],
        "purposes": [{"key": k, "label": v["label"]} for k, v in PURPOSES.items()],
    }
