import logging

from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from api.jwt_verify import JwksCache, JwksUnavailable, use_jwks_cache_for_tests
from api.main import app
from db.settings import get_settings
from logging_config import AUTH_LOGGER_NAME
from tests.api_auth import (
    AUTH_HEADERS,
    TEST_API_KEY,
    TEST_JWKS_URL,
    USER_HEADERS,
    sign_access_token,
    unsigned_token,
)
from tests.mock_settings import api_settings_namespace

client = TestClient(app, headers=USER_HEADERS)
service_client = TestClient(app, headers=AUTH_HEADERS)


def test_jobs_stats_accepts_service_key():
    response = service_client.get("/jobs/stats", params={"country": "XX"})

    # Auth passed. Country validation is the next gate, and it does not need
    # The Hub. A 401 or 403 here would mean the service key was rejected.
    assert response.status_code == 422


def test_jobs_search_accepts_user_token():
    from types import SimpleNamespace
    from unittest.mock import patch

    with (
        patch("api.main.get_qdrant_client", return_value=object()),
        patch(
            "api.main.query_jobs_in_qdrant",
            return_value=SimpleNamespace(points=[]),
        ),
    ):
        response = client.get("/jobs/search", params={"q": "backend"})

    assert response.status_code == 200


def test_jobs_search_rejects_service_key():
    response = service_client.get("/jobs/search", params={"q": "backend"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


def test_chat_rejects_service_key():
    response = service_client.post("/chat", json={"question": "backend roles?"})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


def test_missing_credentials_are_401():
    response = TestClient(app).get("/jobs/search", params={"q": "backend"})

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "missing_credentials"


def test_malformed_bearer_is_401():
    response = TestClient(app, headers={"Authorization": "Bearer not-a-jwt"}).get(
        "/jobs/search", params={"q": "backend"}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_token"


def test_expired_token_is_401():
    token = sign_access_token(exp=1_000_000_000)
    response = TestClient(app, headers={"Authorization": f"Bearer {token}"}).get(
        "/jobs/search", params={"q": "backend"}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "expired_token"


def test_wrong_issuer_is_401():
    token = sign_access_token(issuer="https://evil.example/auth/v1")
    response = TestClient(app, headers={"Authorization": f"Bearer {token}"}).get(
        "/jobs/search", params={"q": "backend"}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_issuer"


def test_wrong_audience_is_401():
    token = sign_access_token(audience="anon")
    response = TestClient(app, headers={"Authorization": f"Bearer {token}"}).get(
        "/jobs/search", params={"q": "backend"}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_audience"


def test_hs256_token_is_401():
    token = sign_access_token(algorithm="HS256")
    response = TestClient(app, headers={"Authorization": f"Bearer {token}"}).get(
        "/jobs/search", params={"q": "backend"}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_token"


def test_alg_none_token_is_401():
    response = TestClient(
        app, headers={"Authorization": f"Bearer {unsigned_token()}"}
    ).get("/jobs/search", params={"q": "backend"})

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_token"


def test_missing_sub_is_401():
    token = sign_access_token(omit={"sub"})
    response = TestClient(app, headers={"Authorization": f"Bearer {token}"}).get(
        "/jobs/search", params={"q": "backend"}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_token"


def test_token_signed_by_another_key_is_401():
    other = ec.generate_private_key(ec.SECP256R1())
    token = sign_access_token(private_key=other)
    response = TestClient(app, headers={"Authorization": f"Bearer {token}"}).get(
        "/jobs/search", params={"q": "backend"}
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_token"


def test_top_level_role_admin_without_app_metadata_is_not_admin():
    token = sign_access_token(role=None, top_level_role="admin")
    response = TestClient(app, headers={"Authorization": f"Bearer {token}"}).get(
        "/admin/users"
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "forbidden"


def test_member_cannot_call_admin():
    response = client.get("/admin/users")

    assert response.status_code == 403


def test_service_key_cannot_call_admin():
    response = service_client.get("/admin/users")

    assert response.status_code == 403


def test_jwks_unavailable_is_503():
    def fail() -> dict:
        raise JwksUnavailable("down")

    use_jwks_cache_for_tests(JwksCache(TEST_JWKS_URL, fetch=fail))
    response = client.get("/jobs/search", params={"q": "backend"})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "auth_unavailable"


def test_unknown_kid_is_401_and_token_is_not_logged(caplog):
    token = sign_access_token(kid="not-in-the-document")
    with caplog.at_level(logging.INFO, logger=AUTH_LOGGER_NAME):
        response = TestClient(app, headers={"Authorization": f"Bearer {token}"}).get(
            "/jobs/search", params={"q": "backend"}
        )

    assert response.status_code == 401
    assert token not in caplog.text


def test_denial_log_puts_reason_in_the_message_not_the_label(caplog):
    with caplog.at_level(logging.INFO, logger=AUTH_LOGGER_NAME):
        service_client.get("/jobs/search", params={"q": "backend"})

    denied = [
        record
        for record in caplog.records
        if getattr(record, "event", None) == "auth_denied"
    ]
    assert denied
    assert all(not hasattr(record, "reason") for record in denied)
    assert "service_key" in caplog.text
    assert TEST_API_KEY not in caplog.text


def test_health_remains_unauthenticated():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_service_key_outside_the_allowlist_is_not_a_user():
    mock_settings = api_settings_namespace(tookratt_api_keys={"other-key"})
    app.dependency_overrides[get_settings] = lambda: mock_settings
    try:
        response = service_client.get("/jobs/stats", params={"country": "XX"})
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 401
