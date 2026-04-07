from fastapi import APIRouter, Request, HTTPException

from app.db import supabase
from app.dependencies import now_iso
from app.services.transcription import get_transcript, format_transcript

router = APIRouter()


@router.post("/webhooks/assemblyai")
async def assemblyai_webhook(request: Request):
    body = await request.json()
    transcript_id = body.get("transcript_id")
    status = body.get("status")

    if not transcript_id:
        raise HTTPException(status_code=400, detail="Missing transcript_id")

    # Find the job by external_job_id
    job_result = (
        supabase.table("transcription_jobs")
        .select("*")
        .eq("external_job_id", transcript_id)
        .execute()
    )

    if not job_result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    job = job_result.data[0]

    if status == "completed":
        transcript = get_transcript(transcript_id)
        transcript_text = format_transcript(transcript)

        supabase.table("audio_files").update({
            "transcript": transcript_text,
            "status": "transcribed",
            "updated_at": now_iso(),
        }).eq("id", job["audio_file_id"]).execute()

        supabase.table("transcription_jobs").update({
            "status": "succeeded",
            "completed_at": now_iso(),
        }).eq("id", job["id"]).execute()

    elif status == "error":
        supabase.table("transcription_jobs").update({
            "status": "failed",
            "error_message": body.get("error", "Transcription failed"),
            "completed_at": now_iso(),
        }).eq("id", job["id"]).execute()

    return {"ok": True}
