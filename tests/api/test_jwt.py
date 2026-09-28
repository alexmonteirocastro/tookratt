import pytest

from api.jwt_verify import (
    JWKS_CACHE_TTL_SECONDS,
    JWKS_FORCED_REFETCH_SECONDS,
    JWKS_MAX_STALE_SECONDS,
    JWKS_REFRESH_BACKOFF_SECONDS,
    JwksCache,
    JwksUnavailable,
    TokenVerifier,
)
from tests.api_auth import (
    MEMBER_SUB,
    TEST_ISSUER,
    TEST_KID,
    fetch_test_jwks,
    sign_access_token,
)


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


def test_ttl_refresh_is_the_only_fetch_when_the_kid_is_missing():
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
    now["t"] += JWKS_CACHE_TTL_SECONDS

    assert cache.public_key("missing-kid") is None
    assert calls["n"] == 1


def test_failed_refresh_still_verifies_a_cached_token():
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        if calls["n"] > 1:
            raise JwksUnavailable("down")
        return fetch_test_jwks()

    now = {"t": 1_000.0}
    cache = JwksCache(
        "https://test.supabase.co/jwks",
        fetch=fetch,
        clock=lambda: now["t"],
    )
    verifier = TokenVerifier(
        issuer=TEST_ISSUER,
        audience="authenticated",
        jwks=cache,
    )
    token = sign_access_token()

    assert verifier.verify(token)["sub"] == MEMBER_SUB
    now["t"] += JWKS_CACHE_TTL_SECONDS
    assert verifier.verify(token)["sub"] == MEMBER_SUB
    assert calls["n"] == 2


def test_second_request_inside_the_backoff_does_not_fetch():
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        if calls["n"] > 1:
            raise JwksUnavailable("down")
        return fetch_test_jwks()

    now = {"t": 1_000.0}
    cache = JwksCache(
        "https://test.supabase.co/jwks",
        fetch=fetch,
        clock=lambda: now["t"],
    )
    assert cache.public_key(TEST_KID) is not None
    now["t"] += JWKS_CACHE_TTL_SECONDS
    assert cache.public_key(TEST_KID) is not None

    now["t"] += 1
    assert cache.public_key(TEST_KID) is not None
    assert calls["n"] == 2

    now["t"] += JWKS_REFRESH_BACKOFF_SECONDS
    assert cache.public_key(TEST_KID) is not None
    assert calls["n"] == 3


def test_cold_cache_failure_raises():
    def fetch() -> dict:
        raise JwksUnavailable("down")

    cache = JwksCache("https://test.supabase.co/jwks", fetch=fetch)
    with pytest.raises(JwksUnavailable):
        cache.public_key(TEST_KID)


def test_failed_forced_refetch_starts_the_window():
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        if calls["n"] > 1:
            raise JwksUnavailable("down")
        return fetch_test_jwks()

    now = {"t": 1_000.0}
    cache = JwksCache(
        "https://test.supabase.co/jwks",
        fetch=fetch,
        clock=lambda: now["t"],
    )
    assert cache.public_key(TEST_KID) is not None

    assert cache.public_key("missing-kid") is None
    assert cache.public_key("another-missing-kid") is None

    assert calls["n"] == 2


def test_keys_older_than_an_hour_are_not_served_when_refresh_fails():
    calls = {"n": 0}

    def fetch() -> dict:
        calls["n"] += 1
        if calls["n"] > 1:
            raise JwksUnavailable("down")
        return fetch_test_jwks()

    now = {"t": 1_000.0}
    cache = JwksCache(
        "https://test.supabase.co/jwks",
        fetch=fetch,
        clock=lambda: now["t"],
    )
    assert cache.public_key(TEST_KID) is not None
    now["t"] += JWKS_MAX_STALE_SECONDS
    with pytest.raises(JwksUnavailable):
        cache.public_key(TEST_KID)
