from api.jwt_verify import JWKS_FORCED_REFETCH_SECONDS, JwksCache
from tests.api_auth import TEST_KID, fetch_test_jwks


def test_two_unknown_kid_lookups_fetch_once():
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        return fetch_test_jwks()

    now = {"t": 1_000.0}
    cache = JwksCache(
        "https://test.supabase.co/jwks",
        fetch=fetch,
        clock=lambda: now["t"],
    )
    assert cache.public_key(TEST_KID) is not None
    calls["n"] = 0

    assert cache.public_key("missing-kid") is None
    assert cache.public_key("another-missing-kid") is None

    assert calls["n"] == 1


def test_forced_refetch_is_allowed_again_after_the_window():
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        return fetch_test_jwks()

    now = {"t": 1_000.0}
    cache = JwksCache(
        "https://test.supabase.co/jwks",
        fetch=fetch,
        clock=lambda: now["t"],
    )
    cache.public_key(TEST_KID)
    calls["n"] = 0

    assert cache.public_key("missing-kid") is None
    now["t"] += JWKS_FORCED_REFETCH_SECONDS
    assert cache.public_key("missing-kid") is None

    assert calls["n"] == 2
