"""Multi-user mode: every account sees only its own data."""
import os
import tempfile

import pytest

import config
from services import auth


@pytest.fixture()
def client(monkeypatch):
    from app import create_app

    monkeypatch.setattr(config, "AUTH_REQUIRED", True)
    tokens = {
        "tok-ana": {"uid": "11111111-1111-1111-1111-111111111111", "email": "ana@example.com", "name": "Ana"},
        "tok-bea": {"uid": "22222222-2222-2222-2222-222222222222", "email": "bea@example.com", "name": "Bea"},
    }
    monkeypatch.setattr(auth, "verify", lambda t: tokens.get(t))
    # BT_TEST_DATABASE_URL lets a developer run this suite against Postgres.
    app = create_app(os.environ.get("BT_TEST_DATABASE_URL") or "sqlite:///" + os.path.join(tempfile.mkdtemp(), "auth.db"))
    return app.test_client()


def h(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_is_required_for_data_but_not_for_config_or_poetry(client):
    assert client.get("/api/books").status_code == 401
    assert client.get("/api/studio").status_code == 401
    assert client.post("/api/import", json={"app": "booktracker", "books": []}).status_code == 401
    assert client.get("/api/books", headers=h("bad-token")).status_code == 401
    cfg = client.get("/api/config").get_json()["data"]
    assert cfg["authRequired"] is True
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/poetry/meta").status_code == 200


def test_each_account_only_sees_its_own_writings_and_books(client):
    w = client.post("/api/studio/writings", json={"title": "Solo de Ana", "content": "secreto"}, headers=h("tok-ana"))
    assert w.status_code == 201
    wid = w.get_json()["data"]["id"]
    book = {"title": "Rayuela", "authors": ["Julio Cortázar"], "categories": ["Fiction"]}
    assert client.post("/api/books", json={"book": book, "status": "read"}, headers=h("tok-ana")).status_code == 201

    bea = client.get("/api/studio", headers=h("tok-bea")).get_json()["data"]
    assert bea["writings"] == []
    assert client.get(f"/api/studio/writings/{wid}", headers=h("tok-bea")).status_code == 404
    assert client.patch(f"/api/studio/writings/{wid}", json={"title": "robado"}, headers=h("tok-bea")).status_code == 404
    assert client.delete(f"/api/studio/writings/{wid}", headers=h("tok-bea")).status_code == 404
    assert client.get("/api/books", headers=h("tok-bea")).get_json()["data"] == []
    ana = client.get("/api/studio", headers=h("tok-ana")).get_json()["data"]
    assert [x["title"] for x in ana["writings"]] == ["Solo de Ana"]


def test_import_goes_to_the_signed_in_account_only(client):
    backup = {"app": "booktracker", "version": 1, "books": [{"id": 1, "title": "Ficciones", "authors": ["Borges"], "status": "read"}],
              "lists": [], "studio": {"writings": [{"title": "Mi poema", "content": "verso"}], "categories": []}}
    res = client.post("/api/import", json=backup, headers=h("tok-ana"))
    assert res.status_code == 200 and res.get_json()["data"]["books"] == 1
    assert [b["title"] for b in client.get("/api/books", headers=h("tok-ana")).get_json()["data"]] == ["Ficciones"]
    assert client.get("/api/books", headers=h("tok-bea")).get_json()["data"] == []
    # a second import into a populated account needs explicit confirmation
    assert client.post("/api/import", json=backup, headers=h("tok-ana")).status_code == 409


def test_cover_media_url_is_unguessable_but_scoped(client):
    import io

    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082")
    up = client.post("/api/studio/images", data={"file": (io.BytesIO(png), "c.png")}, content_type="multipart/form-data", headers=h("tok-ana"))
    url = up.get_json()["data"]["url"]
    assert client.get(url).status_code == 200  # <img> tags can't send headers
    assert client.get("/api/studio/media/" + "0" * 32).status_code == 404
    assert client.get("/api/studio/images", headers=h("tok-bea")).get_json()["data"] == []
