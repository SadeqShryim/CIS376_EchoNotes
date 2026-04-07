from fastapi import APIRouter, Depends, Header, HTTPException

from app.dependencies import _sessions, get_session_id

router = APIRouter()


@router.post("/session/init")
def session_init(x_session_token: str | None = Header(default=None)):
    if not x_session_token:
        raise HTTPException(status_code=400, detail="Missing X-Session-Token header")
    session_id = _sessions.get(x_session_token)
    if not session_id:
        session_id = f"session-{len(_sessions) + 1}"
        _sessions[x_session_token] = session_id
    return {"session_id": session_id}


@router.get("/session/me")
def session_me(session_id: str = Depends(get_session_id)):
    return {"session_id": session_id}
