import os

from fastapi import APIRouter, Depends, HTTPException, Request

from app.db import supabase
from app.dependencies import get_current_user, now_iso
from app.services.transcription import submit_transcription
from app.storage import get_signed_url

router = APIRouter()

BUCKET = "audio-uploads"


@router.post("/jobs/transcribe/{audio_file_id}")
def create_transcription_job(
    audio_file_id: str,
    request: Request,
    user_id: str = Depends(get_current_user),
):
    audio_result = (
        supabase.table("audio_files")
        .select("id, file_path")
        .eq("id", audio_file_id)
        .eq("owner_id", user_id)
        .execute()
    )

    if not audio_result.data:
        raise HTTPException(status_code=404, detail="Audio not found")

    audio = audio_result.data[0]

    # Generate signed URL for AssemblyAI to download the audio
    audio_url = get_signed_url(BUCKET, audio["file_path"])

    # Build webhook callback URL
    base = os.environ.get("WEBHOOK_BASE_URL", str(request.base_url).rstrip("/"))
    webhook_url = f"{base}/webhooks/assemblyai"

    # Submit to AssemblyAI
    external_id = submit_transcription(audio_url, webhook_url)

    job_row = {
        "audio_file_id": audio_file_id,
        "status": "queued",
        "owner_id": user_id,
        "external_job_id": external_id,
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
