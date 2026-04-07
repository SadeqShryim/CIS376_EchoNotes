from dotenv import load_dotenv
load_dotenv()

import asyncio
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.db import supabase

app = FastAPI()

_sessions: dict[str, str] = {}  # In-memory pre-auth MVP (replaced by real auth later)

ALLOWED_MIME_PREFIXES = ("audio/",)
ALLOWED_MIME_FALLBACK = "application/octet-stream"  # Some browsers send this for audio

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


@app.get("/health")
def health():
    return {"status": "ok"}


def get_session_id(x_session_token: str | None = Header(default=None)) -> str:
    if not x_session_token:
        raise HTTPException(status_code=400, detail="Missing X-Session-Token header")
    session_id = _sessions.get(x_session_token)
    if not session_id:
        raise HTTPException(
            status_code=401,
            detail="Invalid or unknown session token. Call POST /session/init first.",
        )
    return session_id


@app.post("/session/init")
def session_init(x_session_token: str | None = Header(default=None)):
    if not x_session_token:
        raise HTTPException(status_code=400, detail="Missing X-Session-Token header")
    session_id = _sessions.get(x_session_token)
    if not session_id:
        session_id = f"session-{len(_sessions) + 1}"
        _sessions[x_session_token] = session_id
    return {"session_id": session_id}


@app.get("/session/me")
def session_me(session_id: str = Depends(get_session_id)):
    return {"session_id": session_id}


@app.post("/audio/upload")
async def upload_audio(
    file: UploadFile = File(...),
    session_id: str = Depends(get_session_id),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    mime = file.content_type or ""
    if not mime.startswith(ALLOWED_MIME_PREFIXES) and mime != ALLOWED_MIME_FALLBACK:
        raise HTTPException(
            status_code=400,
            detail=f"Only audio files are allowed. Got: {mime}",
        )

    storage_name = f"{uuid4()}_{Path(file.filename).name}"
    file_path = UPLOAD_DIR / storage_name

    contents = await file.read()
    file_path.write_bytes(contents)

    row = {
        "filename": file.filename,
        "file_path": storage_name,
        "file_size": len(contents),
        "mime_type": mime or "application/octet-stream",
        "owner_type": "session",
        "owner_id": session_id,
    }

    result = supabase.table("audio_files").insert(row).execute()
    return result.data[0]


@app.get("/media/{file_path:path}")
def serve_media(file_path: str, token: str | None = None):
    """Serve audio files with session auth via query param (audio elements can't send headers)."""
    if not token:
        raise HTTPException(status_code=400, detail="Missing token query parameter")
    session_id = _sessions.get(token)
    if not session_id:
        raise HTTPException(status_code=401, detail="Invalid session token")

    result = (
        supabase.table("audio_files")
        .select("id")
        .eq("file_path", file_path)
        .eq("owner_id", session_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="File not found")

    disk_file = UPLOAD_DIR / file_path
    if not disk_file.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(disk_file)


@app.get("/audio")
def list_audio(session_id: str = Depends(get_session_id)):
    result = (
        supabase.table("audio_files")
        .select("*")
        .eq("owner_type", "session")
        .eq("owner_id", session_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@app.delete("/audio/{audio_id}")
def delete_audio(audio_id: str, session_id: str = Depends(get_session_id)):
    result = (
        supabase.table("audio_files")
        .select("id, file_path")
        .eq("id", audio_id)
        .eq("owner_type", "session")
        .eq("owner_id", session_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Audio not found")

    record = result.data[0]

    disk_file = UPLOAD_DIR / record["file_path"]
    if disk_file.exists():
        disk_file.unlink()

    supabase.table("audio_files").delete().eq("id", audio_id).execute()
    return {"ok": True}


@app.post("/jobs/transcribe/{audio_file_id}")
def create_transcription_job(
    audio_file_id: str,
    session_id: str = Depends(get_session_id),
):
    audio_result = (
        supabase.table("audio_files")
        .select("id")
        .eq("id", audio_file_id)
        .eq("owner_id", session_id)
        .execute()
    )

    if not audio_result.data:
        raise HTTPException(status_code=404, detail="Audio not found")

    job_row = {
        "audio_file_id": audio_file_id,
        "status": "queued",
        "owner_id": session_id,
    }
    result = supabase.table("transcription_jobs").insert(job_row).execute()
    return {"job_id": result.data[0]["id"]}


@app.get("/jobs/{job_id}/status")
def get_job_status(job_id: str, session_id: str = Depends(get_session_id)):
    result = (
        supabase.table("transcription_jobs")
        .select("*")
        .eq("id", job_id)
        .eq("owner_id", session_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    return result.data[0]


async def transcription_worker():
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


@app.on_event("startup")
async def start_worker():
    asyncio.create_task(transcription_worker())
