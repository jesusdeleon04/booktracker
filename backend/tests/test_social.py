"""Tertulia: profiles, friendships, blocks, shared books/poems and letters.

Three simulated accounts (tokens are validated by a stub instead of Supabase).
Everything runs against a throwaway SQLite database.
"""
import io
import os
import tempfile

import pytest

import config
from services import auth

ANA, BEA, CARO = "tok-ana", "tok-bea", "tok-caro"
TOKENS = {
    ANA: {"uid": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ana@example.com", "name": "Ana Lectora", "picture": "https://example.com/ana.jpg"},
    BEA: {"uid": "bbbbbbbb-0000-0000-0000-000000000002", "email": "bea@example.com", "name": "Bea Poeta", "picture": None},
    CARO: {"uid": "cccccccc-0000-0000-0000-000000000003", "email": "caro@example.com", "name": "Caro Extraña", "picture": None},
}


@pytest.fixture()
def app(monkeypatch):
    from app import create_app

    monkeypatch.setattr(config, "AUTH_REQUIRED", True)
    monkeypatch.setattr(auth, "verify", lambda t: TOKENS.get(t))
    return create_app("sqlite:///" + os.path.join(tempfile.mkdtemp(), "social.db"))


@pytest.fixture()
def c(app):
    client = app.test_client()

    class Caller:
        def __getattr__(self, method):
            def call(token, path, **kw):
                return getattr(client, method)(path, headers={"Authorization": f"Bearer {token}"}, **kw)
            return call

    return Caller()


def data(res, status=200):
    assert res.status_code == status, (res.status_code, res.get_json())
    return res.get_json()["data"]


def me(c, tok):
    return data(c.get(tok, "/api/social/me"))


def befriend(c, a, b):
    bid = me(c, b)["id"]
    data(c.post(a, "/api/social/requests", json={"userId": bid}), 201)
    req = data(c.get(b, "/api/social/requests"))["received"][0]
    data(c.post(b, f"/api/social/requests/{req['id']}/accept"))
    return bid


def writing(c, tok, title="Querida Bea", content="Te escribo desde la mesa de nogal.\n\nUn abrazo."):
    return data(c.post(tok, "/api/studio/writings", json={"title": title, "content": content}), 201)


# ── profiles & privacy ────────────────────────────────────────────────────


def test_local_mode_has_no_tertulia(monkeypatch):
    from app import create_app

    monkeypatch.setattr(config, "AUTH_REQUIRED", False)
    app = create_app("sqlite:///" + os.path.join(tempfile.mkdtemp(), "local.db"))
    assert app.test_client().get("/api/social/me").status_code == 403


def test_profile_is_created_from_google_and_customisations_win(c):
    p = me(c, ANA)
    assert p["username"].startswith("analectora") and p["googleName"] == "Ana Lectora"
    assert p["avatar"] == "https://example.com/ana.jpg" and p["email"] == "ana@example.com"
    p = data(c.patch(ANA, "/api/social/me", json={"displayName": "Anita", "username": "ana_lee", "bio": "Leo de noche."}))
    assert p["name"] == "Anita" and p["username"] == "ana_lee"
    TOKENS[ANA]["name"] = "Ana Cambiada en Google"
    try:
        p = me(c, ANA)
        assert p["name"] == "Anita" and p["googleName"] == "Ana Cambiada en Google"  # Google never overwrites
    finally:
        TOKENS[ANA]["name"] = "Ana Lectora"
    assert c.patch(ANA, "/api/social/me", json={"username": "a"}).status_code == 400
    me(c, BEA)
    bea = me(c, BEA)["username"]
    assert c.patch(ANA, "/api/social/me", json={"username": bea}).status_code == 409


def test_profiles_never_expose_email_and_respect_privacy(c):
    me(c, ANA), me(c, BEA)
    data(c.patch(BEA, "/api/social/me", json={"privacy": {"showGenres": "nobody"}}))
    bea = me(c, BEA)["username"]
    view = data(c.get(ANA, f"/api/social/people/{bea}"))
    assert "email" not in view and "genres" not in view
    found = data(c.get(ANA, "/api/social/search?q=bea"))
    assert [p["username"] for p in found] == [bea] and "email" not in found[0]
    data(c.patch(BEA, "/api/social/me", json={"privacy": {"discoverable": False}}))
    assert data(c.get(ANA, "/api/social/search?q=bea")) == []
    assert c.get(ANA, f"/api/social/people/{bea}").status_code == 404
    befriend(c, BEA, ANA)  # a friend still sees the profile
    assert c.get(ANA, f"/api/social/people/{bea}").status_code == 200
    assert c.patch(ANA, "/api/social/me", json={"privacy": {"showGenres": "todos"}}).status_code == 400


def test_email_lookup_is_exact_generic_and_rate_limited(c):
    me(c, BEA), me(c, CARO)
    found = data(c.post(ANA, "/api/social/lookup", json={"email": "BEA@example.com"}))
    assert found["name"] == "Bea Poeta"
    data(c.patch(CARO, "/api/social/me", json={"privacy": {"emailLookup": False}}))
    hidden = c.post(ANA, "/api/social/lookup", json={"email": "caro@example.com"})
    missing = c.post(ANA, "/api/social/lookup", json={"email": "nadie@example.com"})
    assert hidden.status_code == missing.status_code == 404
    assert hidden.get_json()["error"] == missing.get_json()["error"]  # can't tell them apart
    assert c.post(ANA, "/api/social/lookup", json={"email": "bea"}).status_code == 400
    codes = [c.post(ANA, "/api/social/lookup", json={"email": f"x{i}@example.com"}).status_code for i in range(12)]
    assert 429 in codes


# ── friendships & blocks ──────────────────────────────────────────────────


def test_friend_requests_are_reciprocal_and_never_duplicated(c):
    ana, bea = me(c, ANA)["id"], me(c, BEA)["id"]
    assert c.post(ANA, "/api/social/requests", json={"userId": ana}).status_code == 400  # no self-friendship
    first = data(c.post(ANA, "/api/social/requests", json={"userId": bea}), 201)
    again = data(c.post(ANA, "/api/social/requests", json={"userId": bea}))
    assert again["requestId"] == first["requestId"]  # idempotent, no duplicate
    assert data(c.get(ANA, "/api/social/requests"))["sent"][0]["person"]["id"] == bea
    assert c.post(ANA, f"/api/social/requests/{first['requestId']}/accept").status_code == 404  # can't self-accept
    assert data(c.get(BEA, "/api/social/summary"))["requests"] == 1
    # Bea asking back is an acceptance, not a second request.
    assert data(c.post(BEA, "/api/social/requests", json={"userId": ana}))["status"] == "accepted"
    assert [f["id"] for f in data(c.get(ANA, "/api/social/friends"))["items"]] == [bea]
    assert [f["id"] for f in data(c.get(BEA, "/api/social/friends"))["items"]] == [ana]
    kinds = [n["kind"] for n in data(c.get(ANA, "/api/social/notifications"))["items"]]
    assert "friend_accept" in kinds
    assert c.post(ANA, "/api/social/requests", json={"userId": bea}).status_code == 409  # already friends
    data(c.delete(BEA, f"/api/social/friends/{ana}"))
    assert data(c.get(ANA, "/api/social/friends"))["items"] == []


def test_decline_is_discreet_and_cancel_works(c):
    ana, bea, caro = me(c, ANA)["id"], me(c, BEA)["id"], me(c, CARO)["id"]
    req = data(c.post(ANA, "/api/social/requests", json={"userId": bea}), 201)
    data(c.post(BEA, f"/api/social/requests/{req['requestId']}/decline"))
    assert data(c.get(BEA, "/api/social/requests"))["received"] == []
    assert len(data(c.get(ANA, "/api/social/requests"))["sent"]) == 1  # Ana is never told "no"
    assert data(c.post(ANA, "/api/social/requests", json={"userId": bea}))["status"] == "pending"
    req2 = data(c.post(ANA, "/api/social/requests", json={"userId": caro}), 201)
    assert c.delete(CARO, f"/api/social/requests/{req2['requestId']}").status_code == 404  # only the sender cancels
    data(c.delete(ANA, f"/api/social/requests/{req2['requestId']}"))
    assert data(c.get(CARO, "/api/social/requests"))["received"] == []
    assert data(c.get(CARO, "/api/social/notifications"))["items"] == []


def test_blocking_hides_people_and_ends_the_friendship(c):
    ana = me(c, ANA)["id"]
    bea = befriend(c, ANA, BEA)
    data(c.post(BEA, "/api/social/blocks", json={"userId": ana}))
    assert data(c.get(ANA, "/api/social/friends"))["items"] == []
    assert data(c.get(ANA, "/api/social/search?q=bea")) == []
    assert c.get(ANA, f"/api/social/people/{me(c, BEA)['username']}").status_code == 404
    assert c.post(ANA, "/api/social/requests", json={"userId": bea}).status_code == 404
    assert c.post(ANA, "/api/social/lookup", json={"email": "bea@example.com"}).status_code == 404
    assert [b["id"] for b in data(c.get(BEA, "/api/social/blocks"))] == [ana]
    data(c.delete(BEA, f"/api/social/blocks/{ana}"))
    assert data(c.get(ANA, "/api/social/search?q=bea"))


# ── obsequios ─────────────────────────────────────────────────────────────


def test_book_recommendation_keeps_each_library_independent(c):
    bea = befriend(c, ANA, BEA)
    caro = me(c, CARO)["id"]
    book = data(c.post(ANA, "/api/books", json={"book": {"title": "Ficciones", "authors": ["Jorge Luis Borges"]},
                                                "status": "read", "rating": 5, "notes": "Mis notas privadas"}), 201)
    assert c.post(ANA, "/api/social/books", json={"bookId": book["id"], "recipients": [caro]}).status_code == 403
    sent = data(c.post(ANA, "/api/social/books", json={"bookId": book["id"], "recipients": [bea], "note": "Te va a gustar",
                                                       "clientKey": "k1"}), 201)
    data(c.post(ANA, "/api/social/books", json={"bookId": book["id"], "recipients": [bea], "clientKey": "k1"}), 201)
    inbox = data(c.get(BEA, "/api/social/shared?box=received"))
    assert len(inbox["items"]) == 1 and inbox["unseen"] == 1  # same clientKey: one recommendation
    item = inbox["items"][0]
    assert item["book"]["title"] == "Ficciones" and item["senderRating"] == 5 and item["note"] == "Te va a gustar"
    assert "Mis notas privadas" not in str(item)
    assert any(n["kind"] == "book" for n in data(c.get(BEA, "/api/social/notifications"))["items"])
    # Bea adds it to her own library as "want"; Ana's copy doesn't change.
    mine = data(c.post(BEA, "/api/books", json={"book": item["book"], "status": "want"}), 201)
    data(c.post(BEA, f"/api/social/shared/book/{sent['ids'][0]}/saved", json={"bookId": mine["id"]}))
    assert c.post(BEA, f"/api/social/shared/book/{sent['ids'][0]}/saved", json={"bookId": book["id"]}).status_code == 404
    anas = data(c.get(ANA, f"/api/books/{book['id']}"))
    assert anas["status"] == "read" and anas["rating"] == 5 and anas["notes"] == "Mis notas privadas"
    assert data(c.get(BEA, f"/api/books/{mine['id']}"))["status"] == "want"
    reacted = data(c.post(BEA, f"/api/social/shared/book/{sent['ids'][0]}/react", json={"reaction": "gracias", "reply": "¡Qué ilusión!"}))
    assert reacted["reactionLabel"] == "Gracias"
    assert any(n["kind"] == "book_reply" for n in data(c.get(ANA, "/api/social/notifications"))["items"])
    assert c.post(ANA, f"/api/social/shared/book/{sent['ids'][0]}/react", json={"reaction": "gracias"}).status_code == 404
    # Ending the friendship: the recipient loses access, the sender keeps the record.
    data(c.delete(ANA, f"/api/social/friends/{bea}"))
    assert data(c.get(BEA, "/api/social/shared?box=received"))["items"] == []
    assert c.get(BEA, f"/api/social/shared/book/{sent['ids'][0]}").status_code == 404
    assert len(data(c.get(ANA, "/api/social/shared?box=sent"))["items"]) == 1
    assert data(c.get(BEA, f"/api/books/{mine['id']}"))["title"] == "Ficciones"  # her own copy stays


def test_poem_sharing_respects_rights(c, monkeypatch):
    from services.poetry import catalog

    def fake_poem(pid, j):
        free = pid.endswith("free")
        return {
            "id": pid, "title": "Rima LIII" if free else "Poema protegido", "altTitle": None, "subtitle": None,
            "author": {"name": "Bécquer" if free else "Neruda", "qid": "Q1", "birthYear": 1836, "deathYear": 1870 if free else 1973},
            "translator": None, "lang": "es", "collection": "Rimas", "year": 1871, "linecount": 4,
            "source": {"name": "Wikisource", "pageUrl": "https://es.wikisource.org/wiki/X"},
            "rights": {"status": "public_domain" if free else "protected", "label": "x", "universal": free, "allowsFullText": free},
            "attribution": "«Rima LIII», Bécquer", "lines": ["Volverán las oscuras golondrinas", "  en tu balcón", "", "sus nidos a colgar"] if free else None,
        }

    monkeypatch.setattr(catalog, "get_poem", fake_poem)
    bea = befriend(c, ANA, BEA)
    free = data(c.post(ANA, "/api/social/poems", json={"poemId": "ws.es.free", "recipients": [bea], "note": "Para ti"}), 201)
    assert free["textShared"] is True
    prot = data(c.post(ANA, "/api/social/poems", json={"poemId": "ws.es.prot", "recipients": [bea]}), 201)
    assert prot["textShared"] is False
    got = data(c.get(BEA, f"/api/social/shared/poem/{free['ids'][0]}"))
    assert got["poem"]["lines"] == ["Volverán las oscuras golondrinas", "  en tu balcón", "", "sus nidos a colgar"]
    ref = data(c.get(BEA, f"/api/social/shared/poem/{prot['ids'][0]}"))
    assert ref["poem"]["lines"] is None and ref["poem"]["source"]["pageUrl"]
    data(c.post(BEA, f"/api/social/shared/poem/{free['ids'][0]}/saved"))
    assert data(c.get(BEA, f"/api/social/shared/poem/{free['ids'][0]}"))["saved"] is True
    caro = me(c, CARO)["id"]
    assert c.post(ANA, "/api/social/poems", json={"poemId": "ws.es.free", "recipients": [caro]}).status_code == 403


# ── correspondence ────────────────────────────────────────────────────────


def test_letters_are_private_frozen_and_survive_unfriending(c):
    bea = befriend(c, ANA, BEA)
    caro = befriend(c, ANA, CARO)  # Caro is Ana's friend, but the letter isn't for her
    draft = writing(c, ANA)
    assert c.get(BEA, f"/api/studio/writings/{draft['id']}").status_code == 404  # drafts stay private
    sent = data(c.post(ANA, "/api/letters", json={"writingId": draft["id"], "recipients": [bea], "subject": "Desde Bogotá",
                                                   "content": draft["content"], "stationery": "verjurado", "seal": "azul",
                                                   "clientKey": "carta-1"}), 201)
    dup = data(c.post(ANA, "/api/letters", json={"writingId": draft["id"], "recipients": [bea], "clientKey": "carta-1"}))
    assert dup["id"] == sent["id"] and dup["duplicate"]
    inbox = data(c.get(BEA, "/api/letters?box=inbox"))
    assert inbox["unread"] == 1 and inbox["items"][0]["excerpt"] is None  # a sealed envelope hides its contents
    assert any(n["kind"] == "letter" for n in data(c.get(BEA, "/api/social/notifications"))["items"])
    assert data(c.get(BEA, "/api/social/summary"))["letters"] == 1
    # A third person can't open it, even by URL; nor can anyone edit it.
    assert c.get(CARO, f"/api/letters/{sent['id']}").status_code == 404
    assert c.post(CARO, f"/api/letters/{sent['id']}/read").status_code == 404
    assert c.patch(ANA, f"/api/letters/{sent['id']}", json={"content": "otra cosa"}).status_code in (404, 405)
    letter = data(c.get(BEA, f"/api/letters/{sent['id']}"))
    assert letter["content"] == draft["content"] and letter["stationery"] == "verjurado" and letter["role"] == "recipient"
    assert letter["readAt"] is None
    data(c.post(BEA, f"/api/letters/{sent['id']}/read"))
    assert data(c.get(BEA, "/api/letters?box=inbox&filter=unread"))["items"] == []
    record = data(c.get(ANA, "/api/letters?box=sent"))["items"][0]
    assert record["recipients"][0]["readAt"] and record["subject"] == "Desde Bogotá"
    # Editing the draft afterwards doesn't change what Bea received.
    data(c.patch(ANA, f"/api/studio/writings/{draft['id']}", json={"content": "Texto cambiado", "baseVersion": draft["version"]}))
    assert data(c.get(BEA, f"/api/letters/{sent['id']}"))["content"] == draft["content"]
    # Not friends any more: the delivered letter stays Bea's, and still nobody else can read it.
    data(c.delete(BEA, f"/api/social/friends/{me(c, ANA)['id']}"))
    assert data(c.get(BEA, f"/api/letters/{sent['id']}"))["content"] == draft["content"]
    assert c.get(CARO, f"/api/letters/{sent['id']}").status_code == 404
    assert c.post(ANA, "/api/letters", json={"writingId": draft["id"], "recipients": [bea]}).status_code == 403
    assert caro


def test_multiple_recipients_see_only_their_envelope_and_removal_is_personal(c):
    bea = befriend(c, ANA, BEA)
    caro = befriend(c, ANA, CARO)
    draft = writing(c, ANA, "A las dos", "Hola a las dos.")
    sent = data(c.post(ANA, "/api/letters", json={"writingId": draft["id"], "recipients": [bea, caro]}), 201)
    for tok, name in ((BEA, "Bea Poeta"), (CARO, "Caro Extraña")):
        letter = data(c.get(tok, f"/api/letters/{sent['id']}"))
        assert "recipients" not in letter and letter["recipient"]["name"] == name
    assert len(data(c.get(ANA, f"/api/letters/{sent['id']}"))["recipients"]) == 2
    data(c.post(BEA, f"/api/letters/{sent['id']}/hide"))
    assert c.get(BEA, f"/api/letters/{sent['id']}").status_code == 404
    assert data(c.get(CARO, f"/api/letters/{sent['id']}"))["content"] == "Hola a las dos."
    data(c.post(ANA, f"/api/letters/{sent['id']}/hide"))
    assert data(c.get(CARO, f"/api/letters/{sent['id']}"))["content"] == "Hola a las dos."  # sender removing it doesn't take it from Caro
    data(c.post(CARO, f"/api/letters/{sent['id']}/hide"))
    assert c.get(ANA, f"/api/letters/{sent['id']}").status_code == 404


def test_letter_keeps_its_cover_and_only_participants_get_it(c):
    bea = befriend(c, ANA, BEA)
    me(c, CARO)
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")
    img = data(c.post(ANA, "/api/studio/images", data={"file": (io.BytesIO(png), "c.png")}, content_type="multipart/form-data"), 201)
    draft = data(c.post(ANA, "/api/studio/writings", json={"title": "Con portada", "content": "Mira.", "coverImageId": img["id"]}), 201)
    sent = data(c.post(ANA, "/api/letters", json={"writingId": draft["id"], "recipients": [bea]}), 201)
    letter = data(c.get(BEA, f"/api/letters/{sent['id']}"))
    assert letter["cover"]["url"] == f"/api/letters/{sent['id']}/cover"
    assert c.get(BEA, letter["cover"]["url"]).data == png
    assert c.get(CARO, letter["cover"]["url"]).status_code == 404
    data(c.delete(ANA, f"/api/studio/images/{img['id']}?force=1"))
    assert c.get(BEA, letter["cover"]["url"]).data == png  # the letter keeps its own copy


def test_deleted_sender_account_leaves_the_letter_with_its_recipient(app, c):
    from models import User, db

    bea = befriend(c, ANA, BEA)
    draft = writing(c, ANA, "Última carta", "Guárdala.")
    sent = data(c.post(ANA, "/api/letters", json={"writingId": draft["id"], "recipients": [bea]}), 201)
    with app.app_context():
        db.session.delete(User.query.filter_by(email="ana@example.com").first())
        db.session.commit()
    letter = data(c.get(BEA, f"/api/letters/{sent['id']}"))
    assert letter["content"] == "Guárdala." and letter["sender"]["name"] == "Ana Lectora"


def test_notifications_can_be_marked_read(c):
    befriend(c, ANA, BEA)
    items = data(c.get(ANA, "/api/social/notifications"))["items"]
    assert items and not items[0]["read"]
    data(c.post(ANA, "/api/social/notifications/read", json={"all": True}))
    assert all(n["read"] for n in data(c.get(ANA, "/api/social/notifications"))["items"])
    assert data(c.get(ANA, "/api/social/summary"))["notifications"] == 0
