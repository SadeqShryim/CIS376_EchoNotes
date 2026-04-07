import pytest
from dotenv import load_dotenv

load_dotenv()

from app.db import supabase
from app.storage import delete_file

TEST_EMAIL_SUFFIX = "@echonotes-test.com"


@pytest.fixture(autouse=True)
def clean_test_data():
    """Delete all test users and their data after each test."""
    yield
    try:
        users_response = supabase.auth.admin.list_users()
        test_users = [
            u for u in users_response
            if u.email and u.email.endswith(TEST_EMAIL_SUFFIX)
        ]
    except Exception:
        test_users = []

    for user in test_users:
        uid = str(user.id)
        # Clean storage files
        try:
            files = (
                supabase.table("audio_files")
                .select("file_path")
                .eq("owner_id", uid)
                .execute()
            )
            for f in files.data:
                try:
                    delete_file("audio-uploads", f["file_path"])
                except Exception:
                    pass
        except Exception:
            pass
        # Clean DB records
        try:
            supabase.table("transcription_jobs").delete().eq("owner_id", uid).execute()
        except Exception:
            pass
        try:
            supabase.table("audio_files").delete().eq("owner_id", uid).execute()
        except Exception:
            pass
        # Delete test user
        try:
            supabase.auth.admin.delete_user(uid)
        except Exception:
            pass
