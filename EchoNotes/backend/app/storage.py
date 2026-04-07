"""Supabase Storage helpers — works on both local dev and Vercel serverless."""

from app.db import supabase


def upload_file(bucket: str, path: str, data: bytes, content_type: str) -> None:
    """Upload a file to Supabase Storage."""
    supabase.storage.from_(bucket).upload(
        path,
        data,
        {"content-type": content_type},
    )


def delete_file(bucket: str, path: str) -> None:
    """Delete a file from Supabase Storage."""
    supabase.storage.from_(bucket).remove([path])


def get_signed_url(bucket: str, path: str, expires_in: int = 3600) -> str:
    """Generate a signed URL for temporary access (default 1 hour)."""
    result = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    return result["signedURL"]
