"""
Offline tests for Booktracker's core logic (no network access needed).

Run from the project root:  npm test   (or: python -m pytest backend/tests -q)
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from services import recommender  # noqa: E402
from services.taste import build_taste, preference_fit  # noqa: E402
from services.taxonomy import detect_genres, detect_themes  # noqa: E402
from services.text import (  # noqa: E402
    author_key,
    clean_title,
    dedupe_key,
    isbn10_to_13,
    loose_key,
    looks_like_isbn,
    same_author,
    subject_terms,
)


# ─── text ────────────────────────────────────────────────────────────────────


def test_author_keys_survive_transliteration():
    assert author_key("Fiódor Dostoyevski") == author_key("Fyodor Dostoyevsky") == author_key("Fiódor Dostoievski")
    assert author_key("Camus, Albert") == author_key("Albert Camus")
    assert same_author("Gabriel García Márquez", "Gabriel Garcia Marquez")


def test_duplicate_keys():
    assert dedupe_key("El extranjero", ["Albert Camus"]) == dedupe_key("El Extranjero: novela", ["A. Camus"])
    assert loose_key("El crimen y el castigo", ["Dostoievski"]) == loose_key("Crimen y castigo", ["Dostoyevsky"])


def test_isbn_helpers():
    assert looks_like_isbn("978-84-206-7420-9")
    assert not looks_like_isbn("cien años de soledad")
    assert isbn10_to_13("8420674206") == "9788420674209"


def test_clean_title_removes_edition_noise():
    assert clean_title("El guardián entre el centeno - 4. ed.") == "El guardián entre el centeno"


def test_open_library_descriptions_are_cleaned():
    from services.sources import clean_ol_description

    raw = (
        "From wikipedia:\n\nCrime and Punishment (Russian: tr. Prestupleniye; IPA: \\[prʲɪstʊ\\]) is a novel. "
        "It was first published in 1866.1 It was later published.\\[2\\] See [the text][1]\n\n----------\n[1]: https://x"
    )
    out = clean_ol_description(raw)
    assert out.startswith("Crime and Punishment")
    assert "IPA" not in out and "\\[" not in out and "[2]" not in out and "1866.1" not in out
    assert "the text" in out and "https" not in out
    assert clean_ol_description("*L'Étranger* est le premier roman.") == "L'Étranger est le premier roman."


# ─── taxonomy ────────────────────────────────────────────────────────────────


def test_genre_detection_prefers_strong_evidence():
    terms = subject_terms(["Philosophical novels", "Murder", "Relatos de aventuras", "Fiction, psychological",
                           "Classics", "Existentialism"])
    genres = detect_genres(terms, 1942)
    assert genres[0] == "filosofia"
    assert "misterio" not in genres  # "murder" alone is only weak evidence


def test_nonfiction_is_not_contemporary_fiction():
    terms = subject_terms(["Civilization", "World history", "Human beings", "Comics & graphic novels", "Evolution"])
    genres = detect_genres(terms, 2011)
    assert "historia" in genres and "contemporanea" not in genres


def test_themes_cross_genres():
    assert "existencialismo" in detect_themes(subject_terms(["Existentialism", "Meaning of life"]))


# ─── taste & scoring ─────────────────────────────────────────────────────────


def _book(**kw):
    base = {"id": 1, "title": "X", "authors": ["Albert Camus"], "status": "read", "rating": 5,
            "categories": ["Existentialism", "Philosophical novels", "Absurd (Philosophy)"],
            "genres": ["filosofia", "clasicos"], "description": "", "addedAt": "2026-01-01T00:00:00Z"}
    base.update(kw)
    return base


def _candidate(title, author, subjects, genres, **kw):
    b = {"id": f"ol:{title}", "title": title, "authors": [author], "categories": subjects,
         "terms": subject_terms(subjects), "genres": genres, "themes": detect_themes(subject_terms(subjects)),
         "description": "", "coverUrl": "x", "popularity": 500, "year": 1950, "dedupeKey": dedupe_key(title, [author])}
    b.update(kw)
    return b


def test_taste_learns_from_ratings_and_profile():
    profile = {"genres": ["psicologia"], "preferences": {"pace": -1, "purposes": ["pensar"]},
               "favoriteAuthors": [{"name": "Viktor Frankl"}]}
    taste = build_taste(profile, [_book(), _book(id=2, title="Bad", authors=["Someone Else"], rating=1,
                                                 categories=["Romance", "Love stories"], genres=["romance"])], [])
    assert taste.genre_w["filosofia"] > 0 and taste.genre_w["psicologia"] > 0
    assert taste.genre_w.get("romance", 0) < 0
    assert taste.author_w[author_key("Viktor Frankl")] > 0
    assert taste.is_known({"dedupeKey": dedupe_key("X", ["Albert Camus"])})


def test_scoring_prefers_related_books_across_genres():
    taste = build_taste({"genres": [], "preferences": {}, "favoriteAuthors": []}, [_book()], [])
    sartre = _candidate("La náusea", "Jean-Paul Sartre", ["Existentialism", "Philosophical novels"], ["filosofia"])
    scifi_existential = _candidate("Solaris", "Stanisław Lem", ["Science fiction", "Existentialism"], ["ciencia-ficcion"])
    romance = _candidate("Love Again", "Some Author", ["Romance", "Love stories"], ["romance"])
    s1, _ = recommender.score_book(sartre, taste)
    s2, _ = recommender.score_book(scifi_existential, taste)
    s3, _ = recommender.score_book(romance, taste)
    assert s1 > s3 and s2 > s3  # shared themes beat genre-unrelated books, even across genres


def test_explanations_reference_the_readers_books():
    taste = build_taste({"genres": [], "preferences": {}, "favoriteAuthors": []}, [_book(title="El extranjero")], [])
    cand = _candidate("La náusea", "Jean-Paul Sartre", ["Existentialism", "Philosophical novels"], ["filosofia"])
    _, comps = recommender.score_book(cand, taste)
    reasons = recommender.explain(cand, comps, taste)
    assert any("El extranjero" in r for r in reasons)


def test_preference_fit_uses_length_and_era():
    fit, notes = preference_fit({"pageCount": 150, "year": 1900}, {"length": -1, "era": -1})
    assert fit > 0 and ("length", True) in notes


# ─── API (library) ───────────────────────────────────────────────────────────


@pytest.fixture()
def client():
    from app import create_app

    db_path = os.path.join(tempfile.mkdtemp(), "test.db")
    app = create_app("sqlite:///" + db_path)
    return app.test_client()


def test_library_crud_and_duplicates(client):
    book = {"title": "Rayuela", "authors": ["Julio Cortázar"], "pageCount": 600, "year": 1963,
            "categories": ["Fiction", "Experimental fiction"]}
    r = client.post("/api/books", json={"book": book, "status": "reading"})
    assert r.status_code == 201
    data = r.get_json()["data"]
    assert data["status"] == "reading" and data["startedAt"]

    dup = client.post("/api/books", json={"book": {**book, "title": "RAYUELA"}, "status": "want"})
    assert dup.status_code == 409 and dup.get_json()["existingId"] == data["id"]

    r = client.patch(f"/api/books/{data['id']}", json={"status": "read", "rating": 4.5, "review": "Imprescindible"})
    updated = r.get_json()["data"]
    assert updated["status"] == "read" and updated["finishedAt"] and updated["rating"] == 4.5
    assert updated["currentPage"] == 600

    lists = client.get("/api/lists").get_json()["data"]
    assert len(lists) == 3
    r = client.post(f"/api/lists/{lists[0]['id']}/books", json={"bookId": data["id"]})
    assert data["id"] in r.get_json()["data"]["bookIds"]

    assert client.delete(f"/api/books/{data['id']}").status_code == 200
    assert client.get("/api/books").get_json()["data"] == []


def test_profile_and_export(client):
    r = client.patch("/api/profile", json={"genres": ["filosofia", "nope"], "preferences": {"pace": -1, "language": "es"},
                                           "readingGoal": 20})
    profile = r.get_json()["data"]["profile"]
    assert profile["genres"] == ["filosofia"] and profile["readingGoal"] == 20
    exported = client.get("/api/export").get_json()["data"]
    assert exported["app"] == "booktracker" and exported["profile"]["readingGoal"] == 20
