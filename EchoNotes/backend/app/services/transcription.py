import os

import httpx
import assemblyai as aai

API_KEY = os.environ.get("ASSEMBLYAI_API_KEY", "")
API_BASE = "https://api.assemblyai.com/v2"

aai.settings.api_key = API_KEY


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
    """Fetch a completed transcript from AssemblyAI by ID."""
    return aai.Transcript.get_by_id(transcript_id)


def format_transcript(transcript: aai.Transcript) -> str:
    """Format speaker-labeled utterances into readable text."""
    if not transcript.utterances:
        return transcript.text or ""
    lines = []
    for utterance in transcript.utterances:
        lines.append(f"Speaker {utterance.speaker}: {utterance.text}")
    return "\n".join(lines)
