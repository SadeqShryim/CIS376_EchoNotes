import io
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def init(token: str):
    r = client.post("/session/init", headers={"X-Session-Token": token})
    assert r.status_code == 200
    return r.json()["session_id"]


def upload(token: str, filename: str):
    files = {"file": (filename, io.BytesIO(b"fake audio bytes"), "audio/mpeg")}
    r = client.post("/audio/upload", headers={"X-Session-Token": token}, files=files)
    assert r.status_code == 200
    return r.json()


def test_audio_isolation_between_sessions():
    token_a = "token-a"
    token_b = "token-b"

    session_a = init(token_a)
    session_b = init(token_b)
    assert session_a != session_b

    uploaded = upload(token_a, "a.mp3")
    assert uploaded["owner_type"] == "session"
    assert uploaded["owner_id"] == session_a

    list_a = client.get("/audio", headers={"X-Session-Token": token_a})
    list_b = client.get("/audio", headers={"X-Session-Token": token_b})

    assert list_a.status_code == 200
    assert list_b.status_code == 200

    rows_a = list_a.json()
    rows_b = list_b.json()

    assert any(r["id"] == uploaded["id"] for r in rows_a)
    assert all(r["id"] != uploaded["id"] for r in rows_b)

    del_b = client.delete(f"/audio/{uploaded['id']}", headers={"X-Session-Token": token_b})
    assert del_b.status_code == 404

    del_a = client.delete(f"/audio/{uploaded['id']}", headers={"X-Session-Token": token_a})
    assert del_a.status_code == 200