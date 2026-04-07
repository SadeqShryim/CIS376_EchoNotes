from fastapi import APIRouter, Depends, HTTPException

from app.db import supabase
from app.dependencies import get_current_user
from app.services.summarization import summarize_transcript

router = APIRouter()


@router.post("/audio/{audio_file_id}/summarize")
def create_summary(
    audio_file_id: str,
    user_id: str = Depends(get_current_user),
):
    result = (
        supabase.table("audio_files")
        .select("id, transcript")
        .eq("id", audio_file_id)
        .eq("owner_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Audio not found")

    audio = result.data[0]
    if not audio.get("transcript"):
        raise HTTPException(
            status_code=400,
            detail="No transcript available. Transcribe the audio first.",
        )

    summary = summarize_transcript(audio["transcript"])

    supabase.table("audio_files").update({"summary": summary}).eq(
        "id", audio_file_id
    ).execute()

    return {"summary": summary}


@router.get("/audio/{audio_file_id}/summary")
def get_summary(
    audio_file_id: str,
    user_id: str = Depends(get_current_user),
):
    result = (
        supabase.table("audio_files")
        .select("id, summary")
        .eq("id", audio_file_id)
        .eq("owner_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Audio not found")

    return {"summary": result.data[0].get("summary")}
