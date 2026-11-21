"""Tertulia: writings published from the Writer's Studio, profile shelves and book sharing.

Same simulated accounts as test_social (Ana, Bea, Caro) on a throwaway SQLite database.
"""
import io

from tests.test_social import ANA, BEA, CARO, app, befriend, c, data, me, writing  # noqa: F401

TEXT = "Primer verso\nsegundo verso\n\nOtra estrofa, con su espacio."


def publish(c, tok, wid, audience="friends", key="k1", **extra):
    return c.post(tok, "/api/publications", json={"writingId": wid, "audience": audience, "clientKey": key, **extra})


def test_publish_is_always_explicit_and_drafts_stay_private(c):
    befriend(c, ANA, BEA)
    w = writing(c, ANA, "Mi poema", TEXT)
    # the writing exists but nothing is published until the author confirms
    assert data(c.get(BEA, "/api/publications"))["items"] == []
    assert publish(c, ANA, w["id"], audience=None).status_code == 400  # no audience chosen -> refused
    assert data(c.get(BEA, "/api/publications"))["items"] == []
    assert data(c.get(ANA, f"/api/publications/by-writing/{w['id']}"))["publication"] is None


def test_friends_read_it_with_formatting_and_strangers_cannot(c):
    befriend(c, ANA, BEA)
    w = writing(c, ANA, "Mi poema", TEXT)
    pub = data(publish(c, ANA, w["id"], intro="Para quien quiera"), 201)
    assert pub["content"] == TEXT and pub["title"] == "Mi poema" and pub["audience"] == "friends"
    feed = data(c.get(BEA, "/api/publications"))["items"]
    assert [i["id"] for i in feed] == [pub["id"]]
    assert feed[0]["preview"].startswith("Primer verso\nsegundo verso")  # line breaks kept in the preview
    assert "content" not in feed[0]  # lists never carry the full text
    full = data(c.get(BEA, f"/api/publications/{pub['id']}"))
    assert full["content"] == TEXT and full["author"]["name"]
    # Caro is not a friend: the direct URL looks like a missing page, and so does the cover/feed
    assert c.get(CARO, f"/api/publications/{pub['id']}").status_code == 404
    assert c.get(CARO, f"/api/publications/{pub['id']}/cover").status_code == 404
    assert data(c.get(CARO, "/api/publications"))["items"] == []
    assert c.post(CARO, f"/api/publications/{pub['id']}/react", json={"reaction": "gracias"}).status_code == 404


def test_idempotent_and_one_publication_per_writing(c):
    befriend(c, ANA, BEA)
    w = writing(c, ANA)
    a = data(publish(c, ANA, w["id"]), 201)
    again = data(publish(c, ANA, w["id"]))  # same key: same publication
    assert again["id"] == a["id"]
    dup = publish(c, ANA, w["id"], key="other")
    assert dup.status_code == 409 and dup.get_json()["existingId"] == a["id"]
    assert len(data(c.get(ANA, "/api/publications?scope=mine"))["items"]) == 1


def test_private_audience_and_withdrawal_hide_it_everywhere(c):
    befriend(c, ANA, BEA)
    w = writing(c, ANA, "Escondido", TEXT)
    pub = data(publish(c, ANA, w["id"], audience="private"), 201)
    assert c.get(BEA, f"/api/publications/{pub['id']}").status_code == 404
    assert data(c.get(BEA, "/api/publications"))["items"] == []
    # make it visible, then withdraw it
    data(c.patch(ANA, f"/api/publications/{pub['id']}", json={"audience": "friends"}))
    assert c.get(BEA, f"/api/publications/{pub['id']}").status_code == 200
    data(c.patch(ANA, f"/api/publications/{pub['id']}", json={"audience": "private"}))
    assert c.get(BEA, f"/api/publications/{pub['id']}").status_code == 404
    assert c.get(BEA, f"/api/publications/{pub['id']}/cover").status_code == 404
    assert data(c.get(BEA, "/api/publications"))["items"] == []
    card = data(c.get(BEA, "/api/social/people/" + me(c, ANA)["username"]))
    assert card.get("writings") == []
    # the author still has it, and can delete it
    assert c.get(ANA, f"/api/publications/{pub['id']}").status_code == 200
    data(c.delete(ANA, f"/api/publications/{pub['id']}"))
    assert c.get(ANA, f"/api/publications/{pub['id']}").status_code == 404


def test_editing_the_original_never_changes_the_publication_until_asked(c):
    befriend(c, ANA, BEA)
    w = writing(c, ANA, "Versión uno", TEXT)
    pub = data(publish(c, ANA, w["id"]), 201)
    data(c.patch(ANA, f"/api/studio/writings/{w['id']}", json={"content": "Texto nuevo", "title": "Versión dos", "baseVersion": w["version"]}))
    seen = data(c.get(BEA, f"/api/publications/{pub['id']}"))
    assert seen["content"] == TEXT and seen["title"] == "Versión uno" and seen["updatedAt"] is None
    mine = data(c.get(ANA, f"/api/publications/{pub['id']}"))
    assert mine["pendingChanges"] is True
    refreshed = data(c.post(ANA, f"/api/publications/{pub['id']}/refresh"))
    assert refreshed["content"] == "Texto nuevo" and refreshed["title"] == "Versión dos" and refreshed["updatedAt"]
    assert data(c.get(BEA, f"/api/publications/{pub['id']}"))["updatedAt"]  # readers can tell it was updated
    assert data(c.get(ANA, f"/api/publications/{pub['id']}"))["pendingChanges"] is False


def test_losing_the_original_keeps_the_publication(c):
    befriend(c, ANA, BEA)
    w = writing(c, ANA, "Se queda", TEXT)
    pub = data(publish(c, ANA, w["id"]), 201)
    data(c.delete(ANA, f"/api/studio/writings/{w['id']}"))
    assert data(c.get(BEA, f"/api/publications/{pub['id']}"))["content"] == TEXT
    assert c.post(ANA, f"/api/publications/{pub['id']}/refresh").status_code == 404


def test_unfriending_and_blocking_revoke_access_immediately(c):
    bea = befriend(c, ANA, BEA)
    w = writing(c, ANA, "Solo amigos", TEXT)
    pub = data(publish(c, ANA, w["id"]), 201)
    data(c.delete(ANA, f"/api/social/friends/{bea}"))
    assert c.get(BEA, f"/api/publications/{pub['id']}").status_code == 404
    assert data(c.get(BEA, "/api/publications"))["items"] == []
    befriend(c, ANA, BEA)
    assert c.get(BEA, f"/api/publications/{pub['id']}").status_code == 200
    data(c.post(ANA, "/api/social/blocks", json={"userId": bea}))
    assert c.get(BEA, f"/api/publications/{pub['id']}").status_code == 404


def test_profile_section_respects_audience_and_the_users_choice(c):
    befriend(c, ANA, BEA)
    ana = me(c, ANA)
    w1, w2 = writing(c, ANA, "Para amigos", TEXT), writing(c, ANA, "Para mí", TEXT)
    data(publish(c, ANA, w1["id"], key="a"), 201)
    data(publish(c, ANA, w2["id"], audience="private", key="b"), 201)

    def titles(tok):
        card = data(c.get(tok, f"/api/social/people/{ana['username']}"))
        return [x["title"] for x in card.get("writings", [])]

    assert titles(BEA) == ["Para amigos"]  # the private one never appears
    assert titles(ANA) == ["Para amigos"]  # "view as others see me"
    # a stranger sees no writings at all
    assert "writings" not in data(c.get(CARO, f"/api/social/people/{ana['username']}"))
    # hide the section from the profile: friends still reach the publication through the feed
    data(c.patch(ANA, "/api/social/me", json={"privacy": {"showWritings": "nobody"}}))
    assert titles(BEA) == []
    assert len(data(c.get(BEA, "/api/publications"))["items"]) == 1
    # a writing is never more public than its audience
    assert c.patch(ANA, "/api/social/me", json={"privacy": {"showWritings": "everyone"}}).status_code == 400


def test_reactions_and_replies_are_private_to_each_reader(c):
    befriend(c, ANA, BEA)
    befriend(c, ANA, CARO)
    w = writing(c, ANA, "Conversación", TEXT)
    pid = data(publish(c, ANA, w["id"]), 201)["id"]
    assert c.post(ANA, f"/api/publications/{pid}/react", json={"reaction": "gracias"}).status_code == 400  # not your own
    data(c.post(BEA, f"/api/publications/{pid}/react", json={"reaction": "conmovido"}))
    assert c.post(BEA, f"/api/publications/{pid}/react", json={"reaction": "xx"}).status_code == 400
    mine = data(c.get(ANA, f"/api/publications/{pid}"))
    assert [r["reaction"] for r in mine["reactions"]] == ["conmovido"]
    assert "reactions" not in data(c.get(CARO, f"/api/publications/{pid}"))  # no counters for readers
    data(c.post(BEA, f"/api/publications/{pid}/comments", json={"body": "Me quedé pensando en la segunda estrofa."}), 201)
    assert data(c.get(CARO, f"/api/publications/{pid}"))["threads"] == []  # Caro cannot read Bea's thread
    thread = data(c.get(ANA, f"/api/publications/{pid}"))["threads"]
    assert len(thread) == 1 and thread[0]["messages"][0]["body"].startswith("Me quedé")
    bea_id = thread[0]["reader"]["id"]
    data(c.post(ANA, f"/api/publications/{pid}/comments", json={"body": "Gracias por leerlo.", "threadUserId": bea_id}), 201)
    assert len(data(c.get(BEA, f"/api/publications/{pid}"))["threads"][0]["messages"]) == 2
    # the author can only answer someone who wrote first
    caro_id = me(c, CARO)["id"]
    assert c.post(ANA, f"/api/publications/{pid}/comments", json={"body": "hola", "threadUserId": caro_id}).status_code == 404
    data(c.post(BEA, f"/api/publications/{pid}/react", json={"reaction": None}))
    assert data(c.get(ANA, f"/api/publications/{pid}"))["reactions"] == []
    kinds = [n["kind"] for n in data(c.get(ANA, "/api/social/notifications"))["items"]]
    assert "pub_comment" in kinds
    kinds = [n["kind"] for n in data(c.get(BEA, "/api/social/notifications"))["items"]]
    assert "pub_reply" in kinds


def test_cover_is_served_only_to_people_who_can_read(c):
    befriend(c, ANA, BEA)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    up = c.post(ANA, "/api/studio/images", data={"file": (io.BytesIO(png), "c.png")}, content_type="multipart/form-data")
    w = writing(c, ANA, "Con portada", TEXT)
    if up.status_code == 201:
        img = up.get_json()["data"]
        data(c.patch(ANA, f"/api/studio/writings/{w['id']}", json={"coverImageId": img["id"], "baseVersion": w["version"]}))
    pub = data(publish(c, ANA, w["id"]), 201)
    assert pub["cover"], "the studio cover should travel with the publication"
    assert c.get(BEA, pub["cover"]["url"]).status_code == 200
    assert c.get(CARO, pub["cover"]["url"]).status_code == 404
    assert c.get(BEA, pub["cover"]["url"]).headers["Cache-Control"] == "private, no-store"


# ── book sharing and the profile shelf ────────────────────────────────────


def test_share_a_catalog_book_without_adding_it_to_the_library(c):
    bea = befriend(c, ANA, BEA)
    caro = me(c, CARO)["id"]
    book = {"id": "ol:OL45883W", "title": "Ficciones", "authors": ["Jorge Luis Borges"], "coverUrl": "https://covers.openlibrary.org/b/id/1-L.jpg", "year": 1944}
    body = {"book": book, "recipients": [bea], "note": "Léelo despacio", "clientKey": "share-1"}
    first = data(c.post(ANA, "/api/social/books", json=body), 201)
    again = data(c.post(ANA, "/api/social/books", json=body), 201)
    assert first["ids"] == again["ids"]  # pressing twice never duplicates
    assert data(c.get(ANA, "/api/books")) == []  # the sender's library is untouched
    got = data(c.get(BEA, "/api/social/shared?kind=book"))["items"]
    assert len(got) == 1 and got[0]["book"]["title"] == "Ficciones" and got[0]["note"] == "Léelo despacio"
    assert c.post(ANA, "/api/social/books", json={"book": {"authors": []}, "recipients": [bea]}).status_code == 400
    assert c.post(ANA, "/api/social/books", json={"book": book, "recipients": [caro]}).status_code == 403  # not a friend


def test_favorite_shelf_order_visibility_and_archetype(c):
    befriend(c, ANA, BEA)
    ids = []
    for t in ("Uno", "Dos", "Tres"):
        ids.append(data(c.post(ANA, "/api/books", json={"book": {"title": t, "authors": ["A"]}, "status": "read"}), 201)["id"])
    data(c.patch(ANA, "/api/social/me", json={"favoriteBookIds": [ids[2], ids[0], ids[1]]}))
    username = me(c, ANA)["username"]
    card = data(c.get(BEA, f"/api/social/people/{username}"))
    assert [b["title"] for b in card["favoriteBooks"]] == ["Tres", "Uno", "Dos"]
    assert "archetype" in card and set(card["favoriteBooks"][0]) >= {"title", "coverUrl", "description"}
    # hiding the shelf removes it from others' view but not from the user's library or selection
    data(c.patch(ANA, "/api/social/me", json={"privacy": {"showBooks": "nobody"}}))
    assert "favoriteBooks" not in data(c.get(BEA, f"/api/social/people/{username}"))
    assert len(me(c, ANA)["favoriteBooks"]) == 3 and len(data(c.get(ANA, "/api/books"))) == 3
    # books from somebody else's library can't be put on a shelf
    data(c.patch(BEA, "/api/social/me", json={"favoriteBookIds": ids}))
    assert me(c, BEA)["favoriteBooks"] == []
