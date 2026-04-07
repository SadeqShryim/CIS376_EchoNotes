import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app.db import supabase
from app.dependencies import get_current_user, now_iso

router = APIRouter()


@router.post("/jobs/transcribe/{audio_file_id}")
def create_transcription_job(
    audio_file_id: str,
    user_id: str = Depends(get_current_user),
):
    audio_result = (
        supabase.table("audio_files")
        .select("id")
        .eq("id", audio_file_id)
        .eq("owner_id", user_id)
        .execute()
    )

    if not audio_result.data:
        raise HTTPException(status_code=404, detail="Audio not found")

    job_row = {
        "audio_file_id": audio_file_id,
        "status": "queued",
        "owner_id": user_id,
    }
    result = supabase.table("transcription_jobs").insert(job_row).execute()
    return {"job_id": result.data[0]["id"]}


@router.get("/jobs/{job_id}/status")
def get_job_status(job_id: str, user_id: str = Depends(get_current_user)):
    result = (
        supabase.table("transcription_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("owner_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    return result.data[0]


async def transcription_worker():
    """Background worker — will be replaced by AssemblyAI webhooks in Stream B."""
    while True:
        result = (
            supabase.table("transcription_jobs")
            .select("*")
            .eq("status", "queued")
            .execute()
        )

        for job in result.data:
            try:
                supabase.table("transcription_jobs").update({
                    "status": "running",
                    "started_at": now_iso(),
                }).eq("id", job["id"]).execute()

                audio_result = (
                    supabase.table("audio_files")
                    .select("*")
                    .eq("id", job["audio_file_id"])
                    .execute()
                )

                if not audio_result.data:
                    raise Exception("Audio file not found")

                audio = audio_result.data[0]

                await asyncio.sleep(3)

                transcript_text = f"Transcription of {audio['filename']}"

                supabase.table("audio_files").update({
                    "transcript": transcript_text,
                    "status": "transcribed",
                    "updated_at": now_iso(),
                }).eq("id", job["audio_file_id"]).execute()

                supabase.table("transcription_jobs").update({
                    "status": "succeeded",
                    "completed_at": now_iso(),
                }).eq("id", job["id"]).execute()

            except Exception as e:
                supabase.table("transcription_jobs").update({
                    "status": "failed",
                    "error_message": str(e),
                    "completed_at": now_iso(),
                }).eq("id", job["id"]).execute()

        await asyncio.sleep(2)
