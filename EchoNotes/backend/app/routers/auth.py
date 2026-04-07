import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from gotrue.errors import AuthApiError
from pydantic import BaseModel

from app.db import supabase
from app.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class AuthRequest(BaseModel):
    email: str
    password: str


def _sign_in_with_password(email: str, password: str) -> dict:
    """Call GoTrue REST API directly to avoid mutating global client auth state."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    resp = httpx.post(
        f"{url}/auth/v1/token?grant_type=password",
        json={"email": email, "password": password},
        headers={"apikey": key},
    )
    if resp.status_code != 200:
        raise Exception(f"Sign-in failed: {resp.text}")
    return resp.json()


@router.post("/signup")
def signup(body: AuthRequest):
    try:
        user_response = supabase.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except AuthApiError as e:
        if "already" in str(e).lower():
            raise HTTPException(status_code=409, detail="User already exists")
        raise HTTPException(status_code=400, detail=str(e))

    try:
        data = _sign_in_with_password(body.email, body.password)
        return {
            "user_id": str(user_response.user.id),
            "access_token": data["access_token"],
        }
    except Exception:
        raise HTTPException(status_code=500, detail="User created but login failed")


@router.post("/login")
def login(body: AuthRequest):
    try:
        data = _sign_in_with_password(body.email, body.password)
        return {
            "user_id": data["user"]["id"],
            "access_token": data["access_token"],
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")


@router.post("/logout")
def logout(user_id: str = Depends(get_current_user)):
    return {"ok": True}


@router.get("/me")
def me(user_id: str = Depends(get_current_user)):
    return {"user_id": user_id}
