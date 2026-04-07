import os

import assemblyai as aai

aai.settings.api_key = os.environ.get("ASSEMBLYAI_API_KEY", "")


def submit_transcription(audio_url: str, webhook_url: str) -> str:
    """Submit audio to AssemblyAI for transcription with speaker diarization.

    Returns the AssemblyAI transcript ID.
    """
    config = aai.TranscriptionConfig(
        speaker_labels=True,
        webhook_url=webhook_url,
    )
    transcript = aai.Transcriber().submit(audio_url, config=config)
    return transcript.id


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
