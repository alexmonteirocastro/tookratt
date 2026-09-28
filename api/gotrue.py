"""HTTPS client for the Supabase Auth admin API. No SQL."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import requests

from api.outbound import REQUEST_TIMEOUT

BAN_DURATION = "876000h"
USERS_PAGE_SIZE = 50


class GoTrueUnavailable(Exception):
    """Timeout, transport error, or HTTP 5xx. Callers answer 502."""


class GoTrueEmailExists(Exception):
    """``generate_link`` returned 422 ``email_exists``. Callers answer 409."""


class GoTrueNotFound(Exception):
    """The admin API has no user with this id."""


class GoTrueRejected(Exception):
    """Any other 4xx. The response body is not kept."""

    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        super().__init__(f"HTTP {status_code}")


class GoTrueAdmin:
    def __init__(self, base_url: str, secret_key: str) -> None:
        self._root = base_url.rstrip("/") + "/auth/v1/admin"
        self._secret_key = secret_key

    def generate_link(self, link_type: str, email: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/generate_link",
            json={"type": link_type, "email": email},
        )

    def list_users(self, page: int) -> dict[str, Any]:
        return self._request(
            "GET",
            "/users",
            params={"page": page, "per_page": USERS_PAGE_SIZE},
        )

    def get_user(self, user_id: UUID) -> dict[str, Any]:
        return self._request("GET", f"/users/{user_id}")

    def update_user(self, user_id: UUID, body: dict[str, str]) -> dict[str, Any]:
        return self._request("PUT", f"/users/{user_id}", json=body)

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self._secret_key,
            "Authorization": f"Bearer {self._secret_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = requests.request(
                method,
                self._root + path,
                headers=self._headers(),
                timeout=REQUEST_TIMEOUT,
                **kwargs,
            )
        except requests.RequestException as exc:
            raise GoTrueUnavailable from exc
        if response.status_code >= 500:
            raise GoTrueUnavailable
        if response.status_code == 404:
            raise GoTrueNotFound
        if response.status_code == 422 and _error_code(response) == "email_exists":
            raise GoTrueEmailExists
        if response.status_code >= 400:
            raise GoTrueRejected(response.status_code)
        if response.status_code == 204 or not response.content:
            return {}
        try:
            body = response.json()
        except ValueError as exc:
            raise GoTrueUnavailable from exc
        if not isinstance(body, dict):
            raise GoTrueUnavailable
        return body


def _error_code(response: requests.Response) -> str | None:
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    code = body.get("error_code")
    if isinstance(code, str):
        return code
    return None
