import io
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def unique_email():
    return f"test_{uuid.uuid4().hex[:8]}@echonotes-test.com"


def signup_and_get_token():
    email = unique_email()
    r = client.post("/auth/signup", json={"email": email, "password": "TestPass123!"})
    assert r.status_code == 200
    return r.json()["access_token"]


def test_audio_list_rejects_without_token():
    r = client.get("/audio")
    assert r.status_code == 401


def test_audio_list_rejects_invalid_token():
    r = client.get("/audio", headers={"Authorization": "Bearer invalid-token"})
    assert r.status_code == 401


def test_audio_list_accepts_valid_token():
    token = signup_and_get_token()
    r = client.get("/audio", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == []


def test_jobs_rejects_without_token():
    r = client.get("/jobs/some-job-id/status")
    assert r.status_code == 401


def test_upload_and_list_with_auth():
    token = signup_and_get_token()
    files = {"file": ("test.mp3", io.BytesIO(b"fake audio bytes"), "audio/mpeg")}
    upload = client.post(
        "/audio/upload",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
    )
    assert upload.status_code == 200
    uploaded = upload.json()
    assert uploaded["owner_type"] == "user"

    listing = client.get("/audio", headers={"Authorization": f"Bearer {token}"})
    assert listing.status_code == 200
    rows = listing.json()
    assert any(r["id"] == uploaded["id"] for r in rows)


def test_audio_isolation_between_users():
    token_a = signup_and_get_token()
    token_b = signup_and_get_token()

    files = {"file": ("a.mp3", io.BytesIO(b"fake audio"), "audio/mpeg")}
    upload = client.post(
        "/audio/upload",
        headers={"Authorization": f"Bearer {token_a}"},
        files=files,
    )
    assert upload.status_code == 200
    uploaded_id = upload.json()["id"]

    # User B should not see User A's files
    list_b = client.get("/audio", headers={"Authorization": f"Bearer {token_b}"})
    assert all(r["id"] != uploaded_id for r in list_b.json())

    # User B cannot delete User A's file
    del_b = client.delete(
        f"/audio/{uploaded_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert del_b.status_code == 404

    # User A can delete their own file
    del_a = client.delete(
        f"/audio/{uploaded_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert del_a.status_code == 200
