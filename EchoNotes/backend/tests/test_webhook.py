import io
import uuid
from unittest.mock import MagicMock, patch

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


@patch("app.services.transcription.format_transcript")
@patch("app.services.transcription.get_transcript")
@patch("app.routers.jobs.submit_transcription")
def test_webhook_completed_saves_transcript(mock_submit, mock_get, mock_format):
    # The webhook handler calls fetch_and_finalize_job (in app.services.transcription),
    # which in turn calls get_transcript + format_transcript by their bare module-global
    # names. Patches must target where they LIVE, not where they're imported, so mocks
    # land on the actual call sites inside fetch_and_finalize_job.
    aai_id = "aai_webhook_test_1"
    mock_submit.return_value = aai_id

    fake_transcript = MagicMock()
    fake_transcript.status = "completed"
    fake_transcript.utterances = [MagicMock()]
    mock_get.return_value = fake_transcript
    mock_format.return_value = "Speaker A: Hello\nSpeaker B: Hi there"

    token = signup_and_get_token()
    audio_id = upload_audio(token)

    # Submit transcription job
    create_r = client.post(
        f"/jobs/transcribe/{audio_id}",
        headers={"Authorization": f"Bearer {token}"},
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
        headers={"Authorization": f"Bearer {token}"},
    )
    assert status_r.json()["status"] == "succeeded"

    # Verify transcript saved to audio_files
    audio_r = client.get("/audio", headers={"Authorization": f"Bearer {token}"})
    audio = [a for a in audio_r.json() if a["id"] == audio_id][0]
    assert audio["transcript"] == "Speaker A: Hello\nSpeaker B: Hi there"
    assert audio["status"] == "transcribed"


@patch("app.services.transcription.get_transcript")
@patch("app.routers.jobs.submit_transcription")
def test_webhook_error_updates_status(mock_submit, mock_get):
    aai_id = "aai_webhook_error_1"
    mock_submit.return_value = aai_id

    fake_transcript = MagicMock()
    fake_transcript.status = "error"
    fake_transcript.error = "Audio too short"
    mock_get.return_value = fake_transcript

    token = signup_and_get_token()
    audio_id = upload_audio(token)

    create_r = client.post(
        f"/jobs/transcribe/{audio_id}",
        headers={"Authorization": f"Bearer {token}"},
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
        headers={"Authorization": f"Bearer {token}"},
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
