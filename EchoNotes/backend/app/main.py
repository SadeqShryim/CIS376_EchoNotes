from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

_sessions: dict[str, str] = {}
_audio_records: list[dict] = []

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")

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

    storage_name = f"{uuid4()}_{Path(file.filename).name}"
    file_path = UPLOAD_DIR / storage_name

    contents = await file.read()
    file_path.write_bytes(contents)

    ts = now_iso()
    record = {
        "id": str(uuid4()),
        "filename": file.filename,
        "file_path": storage_name,
        "file_size": len(contents),
        "mime_type": file.content_type or "application/octet-stream",
        "duration_seconds": None,
        "transcript": None,
        "summary": None,
        "status": "uploaded",
        "created_at": ts,
        "updated_at": ts,
        "owner_type": "session",
        "owner_id": session_id,
    }
    _audio_records.append(record)
    return record


@app.get("/audio")
def list_audio(session_id: str = Depends(get_session_id)):
    rows = [
        r for r in _audio_records
        if r["owner_type"] == "session" and r["owner_id"] == session_id
    ]
    rows.sort(key=lambda r: r["created_at"], reverse=True)
    return rows


@app.delete("/audio/{audio_id}")
def delete_audio(audio_id: str, session_id: str = Depends(get_session_id)):
    idx = next(
        (
            i for i, r in enumerate(_audio_records)
            if r["id"] == audio_id
            and r["owner_type"] == "session"
            and r["owner_id"] == session_id
        ),
        None,
    )
    if idx is None:
        raise HTTPException(status_code=404, detail="Audio not found")

    record = _audio_records[idx]
    disk_file = UPLOAD_DIR / record["file_path"]
    if disk_file.exists():
        disk_file.unlink()

    _audio_records.pop(idx)
    return {"ok": True}