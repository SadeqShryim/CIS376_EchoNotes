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


@patch("app.routers.webhooks.get_transcript")
@patch("app.routers.webhooks.format_transcript")
@patch("app.routers.jobs.submit_transcription")
def test_webhook_completed_saves_transcript(mock_submit, mock_format, mock_get):
    aai_id = "aai_webhook_test_1"
    mock_submit.return_value = aai_id
    mock_format.return_value = "Speaker A: Hello\nSpeaker B: Hi there"

    token = "test-webhook-1"
    init_session(token)
    audio_id = upload_audio(token)

    # Submit transcription job
    create_r = client.post(
        f"/jobs/transcribe/{audio_id}",
        headers={"X-Session-Token": token},
    )
    job_id = create_r.json()["job_id"]

    # Simulate AssemblyAI webhook callback
    webhook_r = client.post("/webhooks/assemblyai", json={
        "transcript_id": aai_id,
        "status": "completed",
    })
    assert webhook_r.status_code == 200

    # Verify job status updated to succeeded
    status_r = client.get(
        f"/jobs/{job_id}/status",
        headers={"X-Session-Token": token},
    )
    assert status_r.json()["status"] == "succeeded"

    # Verify transcript saved to audio_files
    audio_r = client.get("/audio", headers={"X-Session-Token": token})
    audio = [a for a in audio_r.json() if a["id"] == audio_id][0]
    assert audio["transcript"] == "Speaker A: Hello\nSpeaker B: Hi there"
    assert audio["status"] == "transcribed"


@patch("app.routers.jobs.submit_transcription")
def test_webhook_error_updates_status(mock_submit):
    aai_id = "aai_webhook_error_1"
    mock_submit.return_value = aai_id

    token = "test-webhook-2"
    init_session(token)
    audio_id = upload_audio(token)

    create_r = client.post(
        f"/jobs/transcribe/{audio_id}",
        headers={"X-Session-Token": token},
    )
    job_id = create_r.json()["job_id"]

    # Simulate AssemblyAI error webhook
    webhook_r = client.post("/webhooks/assemblyai", json={
        "transcript_id": aai_id,
        "status": "error",
        "error": "Audio too short",
    })
    assert webhook_r.status_code == 200

    # Verify job status updated to failed
    status_r = client.get(
        f"/jobs/{job_id}/status",
        headers={"X-Session-Token": token},
    )
    assert status_r.json()["status"] == "failed"


def test_webhook_missing_transcript_id():
    r = client.post("/webhooks/assemblyai", json={"status": "completed"})
    assert r.status_code == 400


def test_webhook_unknown_transcript_id():
    r = client.post("/webhooks/assemblyai", json={
        "transcript_id": "nonexistent",
        "status": "completed",
    })
    assert r.status_code == 404
