import logging
from uuid import UUID

from fastapi.testclient import TestClient

from api.admin import get_gotrue_admin
from api.gotrue import BAN_DURATION, GoTrueEmailExists, GoTrueUnavailable
from api.main import app
from logging_config import AUTH_LOGGER_NAME
from tests.api_auth import ADMIN_HEADERS, ADMIN_SUB, USER_HEADERS

ADMIN_ID = UUID("33333333-3333-4333-8333-333333333333")
LINK = "https://example.test/invite#this-must-not-be-logged"


class FakeGoTrue:
    def __init__(self) -> None:
        self.updates: list[tuple[UUID, dict[str, str]]] = []
        self.invite_error: Exception | None = None
        self.user: dict = {
            "id": str(ADMIN_ID),
            "email": "person@example.com",
            "banned_until": None,
            "app_metadata": {"role": "member"},
        }

    def generate_link(self, link_type: str, email: str) -> dict:
        if self.invite_error is not None:
            raise self.invite_error
        return {
            "action_link": LINK,
            "email_otp": "12345678",
            "hashed_token": "hashed-secret",
            "id": str(ADMIN_ID),
            "email": email,
        }

    def list_users(self, page: int) -> dict:
        return {
            "users": [
                {
                    "id": str(ADMIN_ID),
                    "email": "person@example.com",
                    "created_at": "2026-09-01T00:00:00Z",
                    "last_sign_in_at": None,
                    "invited_at": "2026-09-01T00:00:00Z",
                    "banned_until": None,
                    "app_metadata": {"role": "member"},
                }
            ]
        }

    def get_user(self, user_id: UUID) -> dict:
        return self.user

    def update_user(self, user_id: UUID, body: dict[str, str]) -> dict:
        self.updates.append((user_id, body))
        return {}


def _client() -> tuple[TestClient, FakeGoTrue]:
    fake = FakeGoTrue()
    app.dependency_overrides[get_gotrue_admin] = lambda: fake
    return TestClient(app, headers=ADMIN_HEADERS), fake


def test_invite_response_contains_only_the_action_link(caplog):
    client, _fake = _client()
    try:
        with caplog.at_level(logging.INFO, logger=AUTH_LOGGER_NAME):
            response = client.post(
                "/admin/invites", json={"email": "person@example.com"}
            )
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert response.status_code == 200
    assert response.json() == {"action_link": LINK}
    assert response.headers["cache-control"] == "no-store"
    assert "12345678" not in response.text
    assert "hashed-secret" not in response.text
    assert LINK not in caplog.text
    assert "person@example.com" not in caplog.text


def test_invite_email_exists_is_409():
    client, fake = _client()
    fake.invite_error = GoTrueEmailExists()
    try:
        response = client.post("/admin/invites", json={"email": "person@example.com"})
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "account_exists"


def test_invite_timeout_is_502():
    client, fake = _client()
    fake.invite_error = GoTrueUnavailable()
    try:
        response = client.post("/admin/invites", json={"email": "person@example.com"})
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert response.status_code == 502


def test_list_users_returns_one_page():
    client, _fake = _client()
    try:
        response = client.get("/admin/users", params={"page": 2})
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 2
    assert body["users"][0]["status"] == "invited"
    assert body["users"][0]["role"] == "member"


def test_revoke_sends_the_long_ban_and_refuses_self():
    client, fake = _client()
    try:
        denied = client.post(f"/admin/users/{ADMIN_SUB}/revoke")
        allowed = client.post(f"/admin/users/{ADMIN_ID}/revoke")
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert denied.status_code == 409
    assert denied.json()["detail"]["code"] == "self_revoke"
    assert allowed.status_code == 204
    assert fake.updates == [(ADMIN_ID, {"ban_duration": BAN_DURATION})]
    assert BAN_DURATION == "876000h"


def test_restore_clears_the_ban():
    client, fake = _client()
    try:
        response = client.post(f"/admin/users/{ADMIN_ID}/restore")
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert response.status_code == 204
    assert fake.updates == [(ADMIN_ID, {"ban_duration": "none"})]


def test_reset_link_on_a_banned_user_is_409():
    client, fake = _client()
    fake.user["banned_until"] = "2999-01-01T00:00:00Z"
    try:
        response = client.post(f"/admin/users/{ADMIN_ID}/reset-link")
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "restore_first"


def test_reset_link_returns_only_the_link():
    client, _fake = _client()
    try:
        response = client.post(f"/admin/users/{ADMIN_ID}/reset-link")
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert response.status_code == 200
    assert response.json() == {"action_link": LINK}
    assert response.headers["cache-control"] == "no-store"


def test_member_cannot_invite():
    response = TestClient(app, headers=USER_HEADERS).post(
        "/admin/invites", json={"email": "person@example.com"}
    )

    assert response.status_code == 403


def test_user_id_must_be_a_uuid():
    client, _fake = _client()
    try:
        response = client.post("/admin/users/not-a-uuid/revoke")
    finally:
        app.dependency_overrides.pop(get_gotrue_admin, None)

    assert response.status_code == 422
