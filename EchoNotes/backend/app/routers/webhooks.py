from fastapi import APIRouter, HTTPException, Request

from app.db import supabase
from app.services.transcription import fetch_and_finalize_job

router = APIRouter()


@router.post("/webhooks/assemblyai")
async def assemblyai_webhook(request: Request):
    body = await request.json()
    transcript_id = body.get("transcript_id")

    if not transcript_id:
        raise HTTPException(status_code=400, detail="Missing transcript_id")

    # Find the job by external_job_id (AssemblyAI transcript id).
    job_result = (
        supabase.table("transcription_jobs")
        .select("*")
        .eq("external_job_id", transcript_id)
        .execute()
    )

    if not job_result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    # Reuse the same finalize path the polling endpoint uses so webhook and
    # poll can never disagree on the canonical DB state.
    fetch_and_finalize_job(job_result.data[0])
    return {"ok": True}
