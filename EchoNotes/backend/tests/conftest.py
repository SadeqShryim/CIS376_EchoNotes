import pytest
from dotenv import load_dotenv

load_dotenv()

from app.db import supabase
from app.storage import delete_file


@pytest.fixture(autouse=True)
def clean_test_data():
    """Delete all test data after each test."""
    yield
    # Get file paths before deleting DB records
    files = (
        supabase.table("audio_files")
        .select("file_path")
        .like("owner_id", "session-%")
        .execute()
    )
    # Clean up Supabase Storage
    for f in files.data:
        try:
            delete_file("audio-uploads", f["file_path"])
        except Exception:
            pass
    # Clean up DB
    supabase.table("transcription_jobs").delete().like("owner_id", "session-%").execute()
    supabase.table("audio_files").delete().like("owner_id", "session-%").execute()
