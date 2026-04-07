from datetime import datetime, timezone

from fastapi import Header, HTTPException


# In-memory pre-auth MVP (replaced by real auth in feat/supabase-auth)
_sessions: dict[str, str] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
