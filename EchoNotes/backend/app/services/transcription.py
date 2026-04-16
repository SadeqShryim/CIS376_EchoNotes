import os

import httpx
import assemblyai as aai

from app.db import supabase
from app.dependencies import now_iso

API_KEY = os.environ.get("ASSEMBLYAI_API_KEY", "")
API_BASE = "https://api.assemblyai.com/v2"

aai.settings.api_key = API_KEY

TERMINAL_DB_STATES = {"succeeded", "failed"}


def submit_transcription(audio_url: str, webhook_url: str) -> str:
    """Submit audio to AssemblyAI for transcription with speaker diarization.

    Uses the REST API directly to support speech_models parameter.
    Returns the AssemblyAI transcript ID.
    """
    resp = httpx.post(
        f"{API_BASE}/transcript",
        headers={"authorization": API_KEY},
        json={
            "audio_url": audio_url,
            "speaker_labels": True,
            "webhook_url": webhook_url,
            "speech_models": ["universal-2"],
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["id"]


def get_transcript(transcript_id: str) -> aai.Transcript:
    """Fetch a transcript from AssemblyAI by ID (may be in any state)."""
    return aai.Transcript.get_by_id(transcript_id)


def format_transcript(transcript: aai.Transcript) -> str:
    """Format speaker-labeled utterances into readable text."""
    if not transcript.utterances:
        return transcript.text or ""
    lines = []
    for utterance in transcript.utterances:
        lines.append(f"Speaker {utterance.speaker}: {utterance.text}")
    return "\n".join(lines)


def _assemblyai_status_string(transcript: aai.Transcript) -> str:
    """Return the AssemblyAI transcript status as a lowercase string.

    The SDK exposes the status as an enum whose underlying value is the
    canonical lowercase string ("queued" / "processing" / "completed" /
    "error"). We pull `.value` when available and fall back to `str()` so
    minor SDK changes don't break our comparisons.
    """
    status = transcript.status
    raw = getattr(status, "value", None) or str(status)
    return raw.split(".")[-1].lower()


def fetch_and_finalize_job(job: dict) -> dict:
    """Pull the latest state from AssemblyAI and update our DB if terminal.

    Called from both the /jobs/{id}/status poll path and the AssemblyAI
    webhook. Idempotent — if the job is already terminal we return it as-is
    without an upstream call. Transient network failures to AssemblyAI are
    swallowed so that the caller's HTTP response still succeeds; the next
    poll will retry.
    """
    if job.get("status") in TERMINAL_DB_STATES:
        return job

    external_id = job.get("external_job_id")
    if not external_id:
        return job

    try:
        transcript = get_transcript(external_id)
    except Exception:
        return job

    state = _assemblyai_status_string(transcript)

    if state == "completed":
        text = format_transcript(transcript)
        supabase.table("audio_files").update({
            "transcript": text,
            "status": "transcribed",
            "updated_at": now_iso(),
        }).eq("id", job["audio_file_id"]).execute()
        supabase.table("transcription_jobs").update({
            "status": "succeeded",
            "completed_at": now_iso(),
        }).eq("id", job["id"]).execute()
        return {**job, "status": "succeeded", "completed_at": now_iso()}

    if state == "error":
        error_message = getattr(transcript, "error", None) or "Transcription failed"
        supabase.table("transcription_jobs").update({
            "status": "failed",
            "error_message": str(error_message),
            "completed_at": now_iso(),
        }).eq("id", job["id"]).execute()
        return {
            **job,
            "status": "failed",
            "error_message": str(error_message),
            "completed_at": now_iso(),
        }

    # queued / processing / anything else — keep polling on the next tick.
    return job
