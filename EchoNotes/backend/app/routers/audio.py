from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.db import supabase
from app.dependencies import _sessions, get_session_id
from app.storage import delete_file, get_signed_url, upload_file

ALLOWED_MIME_PREFIXES = ("audio/",)
ALLOWED_MIME_FALLBACK = "application/octet-stream"

BUCKET = "audio-uploads"

router = APIRouter()


@router.post("/audio/upload")
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

    from pathlib import Path
    storage_name = f"{uuid4()}_{Path(file.filename).name}"
    contents = await file.read()

    upload_file(BUCKET, storage_name, contents, mime or "application/octet-stream")

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


@router.get("/media/{file_path:path}")
def serve_media(file_path: str, token: str | None = None):
    """Serve audio via signed URL (Supabase Storage)."""
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

    signed_url = get_signed_url(BUCKET, file_path)
    return {"url": signed_url}


@router.get("/audio")
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


@router.delete("/audio/{audio_id}")
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
    delete_file(BUCKET, record["file_path"])

    supabase.table("audio_files").delete().eq("id", audio_id).execute()
    return {"ok": True}
