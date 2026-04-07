from datetime import datetime, timezone

from fastapi import Header, HTTPException

from app.db import supabase


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_current_user(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
        )
    token = authorization.removeprefix("Bearer ")
    try:
        result = supabase.auth.get_user(token)
        if result.user is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return str(result.user.id)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
