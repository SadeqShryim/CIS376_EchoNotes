from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.db import supabase
from app.dependencies import get_current_user
from app.storage import delete_file, get_signed_url, upload_file

# Accept anything that is clearly audio, plus the common container MIMEs that
# Chrome / browsers report when recording audio-only tracks (tab capture with
# MediaRecorder emits `video/webm` even when the file has no video track), and
# fall back to a filename-extension check so the extension can upload even when
# the `content_type` header is missing or generic.
ALLOWED_MIME_PREFIXES = ("audio/",)
ALLOWED_MIME_EXACT = {
    "video/webm",
    "video/mp4",
    "application/octet-stream",
    "application/x-matroska",
}
ALLOWED_EXTS = {".mp3", ".wav", ".m4a", ".mp4", ".webm", ".ogg", ".oga", ".flac", ".aac"}

BUCKET = "audio-uploads"

router = APIRouter()


@router.post("/audio/upload")
async def upload_audio(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    mime = (file.content_type or "").lower()
    ext = Path(file.filename).suffix.lower()
    accepted = (
        mime.startswith(ALLOWED_MIME_PREFIXES)
        or mime in ALLOWED_MIME_EXACT
        or ext in ALLOWED_EXTS
    )
    if not accepted:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: mime={mime or 'unknown'!r}, extension={ext or 'none'!r}",
        )

    # Normalise webm/mp4 containers that carry only audio to an audio/* MIME so
    # browsers will happily feed the resulting signed URL straight into an
    # <audio> element. The file on disk is unchanged; only the Content-Type
    # stored on the Supabase object and the audio_files.mime_type row change.
    normalised_mime = mime
    if mime in {"video/webm", "application/x-matroska"} or ext == ".webm":
        normalised_mime = "audio/webm"
    elif mime == "video/mp4" and ext in {".m4a", ".mp4"}:
        normalised_mime = "audio/mp4"
    elif not mime:
        normalised_mime = "application/octet-stream"

    storage_name = f"{uuid4()}_{Path(file.filename).name}"
    contents = await file.read()

    upload_file(BUCKET, storage_name, contents, normalised_mime)

    row = {
        "filename": file.filename,
        "file_path": storage_name,
        "file_size": len(contents),
        "mime_type": normalised_mime,
        "owner_type": "user",
        "owner_id": user_id,
    }

    result = supabase.table("audio_files").insert(row).execute()
    return result.data[0]


@router.get("/media/{file_path:path}")
def serve_media(file_path: str, token: str | None = None):
    """Serve audio via signed URL (Supabase Storage)."""
    if not token:
        raise HTTPException(status_code=400, detail="Missing token query parameter")
    try:
        auth_result = supabase.auth.get_user(token)
        user_id = str(auth_result.user.id)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = (
        supabase.table("audio_files")
        .select("id")
        .eq("file_path", file_path)
        .eq("owner_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="File not found")

    signed_url = get_signed_url(BUCKET, file_path)
    return {"url": signed_url}


@router.get("/audio")
def list_audio(user_id: str = Depends(get_current_user)):
    result = (
        supabase.table("audio_files")
        .select("*")
        .eq("owner_type", "user")
        .eq("owner_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.delete("/audio/{audio_id}")
def delete_audio(audio_id: str, user_id: str = Depends(get_current_user)):
    result = (
        supabase.table("audio_files")
        .select("id, file_path")
        .eq("id", audio_id)
        .eq("owner_type", "user")
        .eq("owner_id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Audio not found")

    record = result.data[0]
    delete_file(BUCKET, record["file_path"])

    supabase.table("audio_files").delete().eq("id", audio_id).execute()
    return {"ok": True}
