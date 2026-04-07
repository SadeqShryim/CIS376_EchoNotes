import io
import uuid
from unittest.mock import patch

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


def upload_audio(token: str) -> str:
    files = {"file": ("test.mp3", io.BytesIO(b"fake audio bytes"), "audio/mpeg")}
    r = client.post(
        "/audio/upload",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
    )
    assert r.status_code == 200
    return r.json()["id"]


def set_transcript(audio_id: str, transcript: str):
    """Write a transcript directly into the audio_files row."""
    from app.db import supabase

    supabase.table("audio_files").update({"transcript": transcript}).eq(
        "id", audio_id
    ).execute()


@patch("app.routers.summary.summarize_transcript")
def test_summarize_with_transcript(mock_summarize):
    mock_summarize.return_value = "## Key Points\n- Discussed roadmap"

    token = signup_and_get_token()
    audio_id = upload_audio(token)
    set_transcript(audio_id, "Speaker A: Let's discuss the roadmap")

    r = client.post(
        f"/audio/{audio_id}/summarize",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["summary"] == "## Key Points\n- Discussed roadmap"
    mock_summarize.assert_called_once_with("Speaker A: Let's discuss the roadmap")


def test_summarize_without_transcript():
    token = signup_and_get_token()
    audio_id = upload_audio(token)

    r = client.post(
        f"/audio/{audio_id}/summarize",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400
    assert "transcript" in r.json()["detail"].lower()


@patch("app.routers.summary.summarize_transcript")
def test_get_stored_summary(mock_summarize):
    mock_summarize.return_value = "## Key Points\n- Action items assigned"

    token = signup_and_get_token()
    audio_id = upload_audio(token)
    set_transcript(audio_id, "Speaker B: Assign tasks to team")

    # Summarize first
    client.post(
        f"/audio/{audio_id}/summarize",
        headers={"Authorization": f"Bearer {token}"},
    )

    # GET the stored summary
    r = client.get(
        f"/audio/{audio_id}/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    assert r.json()["summary"] == "## Key Points\n- Action items assigned"


def test_get_summary_not_found():
    token = signup_and_get_token()
    r = client.get(
        "/audio/00000000-0000-0000-0000-000000000000/summary",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 404


def test_summarize_requires_auth():
    r = client.post("/audio/some-id/summarize")
    assert r.status_code == 401


def test_get_summary_requires_auth():
    r = client.get("/audio/some-id/summary")
    assert r.status_code == 401
