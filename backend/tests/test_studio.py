"""Writer's Studio API tests (offline)."""
import io
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture()
def client():
    from app import create_app

    app = create_app("sqlite:///" + os.path.join(tempfile.mkdtemp(), "studio.db"))
    return app.test_client()


def data(resp):
    return resp.get_json()["data"]


def test_default_categories_and_create(client):
    overview = data(client.get("/api/studio"))
    names = [c["name"] for c in overview["categories"]]
    assert names[:3] == ["Poesía", "Pensamientos", "Reflexiones"] and "Otros" in names and len(names) == 10
    poesia = overview["categories"][0]["id"]

    r = client.post("/api/studio/writings", json={"title": "Nocturno", "content": "La luna\nsobre el agua", "categoryId": poesia})
    assert r.status_code == 201
    w = data(r)
    assert w["wordCount"] == 5 and w["charCount"] == len("La luna\nsobre el agua") and w["version"] == 1

    # Without a category it lands in "Otros"
    w2 = data(client.post("/api/studio/writings", json={"content": "algo"}))
    otros = next(c["id"] for c in overview["categories"] if c["name"] == "Otros")
    assert w2["categoryId"] == otros


def test_autosave_versions_and_conflicts(client):
    w = data(client.post("/api/studio/writings", json={"title": "Carta", "content": "Querida"}))
    r = client.patch(f"/api/studio/writings/{w['id']}", json={"content": "Querida Ana,", "baseVersion": 1, "caret": 12})
    saved = data(r)
    assert saved["version"] == 2 and saved["wordCount"] == 2

    # Moving the caret only does not bump the version nor the modification date
    r = client.patch(f"/api/studio/writings/{w['id']}", json={"caret": 3, "scroll": 0.4})
    assert data(r)["version"] == 2 and data(r)["updatedAt"] == saved["updatedAt"]
    full = data(client.get(f"/api/studio/writings/{w['id']}"))
    assert full["caret"] == 3 and full["content"] == "Querida Ana,"

    # A stale tab cannot overwrite newer text…
    stale = client.patch(f"/api/studio/writings/{w['id']}", json={"content": "otra cosa", "baseVersion": 1})
    assert stale.status_code == 409 and stale.get_json()["writing"]["content"] == "Querida Ana,"
    # …unless the writer explicitly keeps their version
    forced = client.patch(f"/api/studio/writings/{w['id']}", json={"content": "otra cosa", "baseVersion": 1, "force": True})
    assert data(forced)["version"] == 3

    # Metadata edits (category, cover) don't bump the text version, so they never conflict
    cats = data(client.get("/api/studio"))["categories"]
    moved = data(client.patch(f"/api/studio/writings/{w['id']}", json={"categoryId": cats[0]["id"], "baseVersion": 1}))
    assert moved["version"] == 3 and moved["categoryId"] == cats[0]["id"]


def test_creation_is_idempotent(client):
    first = client.post("/api/studio/writings", json={"content": "Hola", "clientKey": "draft-abc"})
    again = client.post("/api/studio/writings", json={"content": "Hola", "clientKey": "draft-abc"})
    assert first.status_code == 201 and again.status_code == 200
    assert data(first)["id"] == data(again)["id"]
    assert len(data(client.get("/api/studio"))["writings"]) == 1


def test_categories_crud_moves_writings(client):
    cats = data(client.get("/api/studio"))["categories"]
    new = data(client.post("/api/studio/categories", json={"name": "Haikus", "color": "#E9A34F"}))
    assert client.post("/api/studio/categories", json={"name": "haikus"}).status_code == 409
    w = data(client.post("/api/studio/writings", json={"content": "Viejo estanque", "categoryId": new["id"]}))
    renamed = data(client.patch(f"/api/studio/categories/{new['id']}", json={"name": "Haiku"}))
    assert renamed["name"] == "Haiku" and renamed["count"] == 1

    poesia = cats[0]["id"]
    r = data(client.delete(f"/api/studio/categories/{new['id']}?moveTo={poesia}"))
    assert r["movedTo"] == poesia and r["moved"] == 1
    assert data(client.get(f"/api/studio/writings/{w['id']}"))["categoryId"] == poesia


def test_cover_upload_validation_and_library(client):
    bad = client.post("/api/studio/images", data={"file": (io.BytesIO(b"<svg></svg>"), "x.svg")},
                      content_type="multipart/form-data")
    assert bad.status_code == 415

    up = client.post("/api/studio/images", data={"file": (io.BytesIO(PNG_1PX), "c.png"), "width": "1", "height": "1"},
                     content_type="multipart/form-data")
    assert up.status_code == 201
    img = data(up)
    file_resp = client.get(img["url"])
    assert file_resp.status_code == 200 and file_resp.mimetype == "image/png"
    file_resp.close()

    w = data(client.post("/api/studio/writings", json={"title": "Con portada", "coverImageId": img["id"]}))
    assert w["cover"]["id"] == img["id"]
    library = data(client.get("/api/studio/images"))
    assert library[0]["usedBy"] == 1
    # In use: deleting needs confirmation (force); the writing keeps working without cover
    assert client.delete(f"/api/studio/images/{img['id']}").status_code == 409
    assert client.delete(f"/api/studio/images/{img['id']}?force=1").status_code == 200
    assert data(client.get(f"/api/studio/writings/{w['id']}"))["cover"] is None


def test_delete_order_and_backup(client):
    a = data(client.post("/api/studio/writings", json={"title": "A", "content": "uno"}))
    b = data(client.post("/api/studio/writings", json={"title": "B", "content": "dos"}))
    client.post("/api/studio/order", json={"ids": [a["id"], b["id"]]})
    ws = {w["id"]: w for w in data(client.get("/api/studio"))["writings"]}
    assert ws[a["id"]]["position"] < ws[b["id"]]["position"]

    backup = data(client.get("/api/export"))
    assert len(backup["studio"]["writings"]) == 2

    assert client.delete(f"/api/studio/writings/{a['id']}").status_code == 200
    assert client.get(f"/api/studio/writings/{a['id']}").status_code == 404

    unconfirmed = client.post("/api/import", json=backup)
    assert unconfirmed.status_code == 409 and unconfirmed.get_json()["needsConfirm"]  # never replace by surprise
    restored = data(client.post("/api/import?replace=1", json=backup))
    assert restored["writings"] == 2
    titles = sorted(w["title"] for w in data(client.get("/api/studio"))["writings"])
    assert titles == ["A", "B"]


def test_backup_carries_cover_images(client):
    import base64

    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
    up = client.post("/api/studio/images", data={"file": (io.BytesIO(png), "c.png")}, content_type="multipart/form-data")
    img = data(up)
    assert img["url"].startswith("/api/studio/media/")
    assert client.get(img["url"]).data == png
    w = data(client.post("/api/studio/writings", json={"title": "Con portada", "content": "x", "coverImageId": img["id"]}))
    assert w["cover"]["id"] == img["id"]
    backup = data(client.get("/api/export?images=1"))
    assert backup["studio"]["images"] and backup["studio"]["images"][0]["data"]
    assert data(client.get("/api/export"))["studio"]["images"] == []
    # restore into the same account: a fresh image is created and the cover follows it
    assert client.post("/api/import?replace=1", json=backup).status_code == 200
    again = data(client.get("/api/studio"))["writings"][0]
    assert again["cover"] and again["cover"]["url"].startswith("/api/studio/media/")
    assert client.get(again["cover"]["url"]).data == png
