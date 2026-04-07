import pytest
from dotenv import load_dotenv

load_dotenv()

from app.db import supabase


@pytest.fixture(autouse=True)
def clean_test_data():
    """Delete all test data after each test."""
    yield
    supabase.table("transcription_jobs").delete().like("owner_id", "session-%").execute()
    supabase.table("audio_files").delete().like("owner_id", "session-%").execute()
