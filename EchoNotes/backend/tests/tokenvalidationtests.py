from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_session_init_creates_and_reuses_session():
    token = "test-token-1"

    first = client.post("/session/init", headers={"X-Session-Token": token})
    assert first.status_code == 200
    session_id_1 = first.json()["session_id"]

    second = client.post("/session/init", headers={"X-Session-Token": token})
    assert second.status_code == 200
    session_id_2 = second.json()["session_id"]

    assert session_id_1 == session_id_2


def test_session_me_requires_token():
    res = client.get("/session/me")
    assert res.status_code == 400


def test_session_me_rejects_unknown_token():
    res = client.get("/session/me", headers={"X-Session-Token": "unknown-token"})
    assert res.status_code == 401