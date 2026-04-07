import io
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def init_session(token: str) -> str:
    r = client.post("/session/init", headers={"X-Session-Token": token})
    assert r.status_code == 200
    return r.json()["session_id"]


def upload_audio(token: str) -> str:
    files = {"file": ("test.mp3", io.BytesIO(b"fake audio bytes"), "audio/mpeg")}
    r = client.post(
        "/audio/upload",
        headers={"X-Session-Token": token},
        files=files,
    )
    assert r.status_code == 200
    return r.json()["id"]


@patch("app.routers.jobs.submit_transcription")
def test_submit_transcription_returns_job_id(mock_submit):
    mock_submit.return_value = "aai_test_123"
    token = "test-transcription-1"
    init_session(token)
    audio_id = upload_audio(token)

    r = client.post(
        f"/jobs/transcribe/{audio_id}",
        headers={"X-Session-Token": token},
    )
    assert r.status_code == 200
    data = r.json()
    assert "job_id" in data
    mock_submit.assert_called_once()


@patch("app.routers.jobs.submit_transcription")
def test_transcription_job_status_queued(mock_submit):
    mock_submit.return_value = "aai_test_456"
    token = "test-transcription-2"
    init_session(token)
    audio_id = upload_audio(token)

    create_r = client.post(
        f"/jobs/transcribe/{audio_id}",
        headers={"X-Session-Token": token},
    )
    job_id = create_r.json()["job_id"]

    status_r = client.get(
        f"/jobs/{job_id}/status",
        headers={"X-Session-Token": token},
    )
    assert status_r.status_code == 200
    assert status_r.json()["status"] == "queued"
