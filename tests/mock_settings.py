from types import SimpleNamespace

from tests.api_auth import TEST_API_KEY, TEST_SUPABASE_SECRET, TEST_SUPABASE_URL


def api_settings_namespace(**overrides):
    """Minimal Settings stand-in for tests that mock api.main.get_settings."""
    defaults = {
        "qdrant_collection_name": "JOBS_ON_THE_HUB",
        "chat_question_max_length": 500,
        "chat_rate_limit": "10/minute",
        "chat_source_min_score": 0.85,
        "tookratt_api_keys": {TEST_API_KEY},
        "supabase_url": TEST_SUPABASE_URL,
        "supabase_secret_key": TEST_SUPABASE_SECRET,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)
