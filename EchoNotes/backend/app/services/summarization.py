import os

import anthropic

_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))

SYSTEM_PROMPT = (
    "You are a meeting-notes assistant. Given a transcript, produce a concise "
    "structured summary with these sections:\n"
    "## Key Points\n"
    "- Bullet the most important topics discussed\n\n"
    "## Action Items\n"
    "- Bullet any tasks, decisions, or follow-ups assigned\n\n"
    "## Speaker Highlights\n"
    "- Briefly note each speaker's main contributions\n\n"
    "Keep it short and actionable. Do not repeat the transcript verbatim."
)


def summarize_transcript(transcript: str) -> str:
    """Send transcript to Claude and return a structured summary."""
    message = _client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": transcript}],
    )
    return message.content[0].text
