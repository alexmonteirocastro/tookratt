"""Local ES256 verification of Supabase access tokens (ADR-0019, ALE-214)."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import Any

import requests
from jwt import PyJWK, get_unverified_header
from jwt import decode as jwt_decode
from jwt.exceptions import (
    DecodeError,
    ExpiredSignatureError,
    InvalidAudienceError,
    InvalidIssuerError,
    InvalidTokenError,
    MissingRequiredClaimError,
    PyJWTError,
)

from api.outbound import REQUEST_TIMEOUT

JWKS_CACHE_TTL_SECONDS = 600
JWKS_FORCED_REFETCH_SECONDS = 60
SUPABASE_JWT_AUDIENCE = "authenticated"

Clock = Callable[[], float]
JwksFetch = Callable[[], dict[str, Any]]

_override_cache: JwksCache | None = None
_caches: dict[str, JwksCache] = {}
_caches_lock = threading.Lock()


class TokenError(Exception):
    """A bearer value is not a usable access token. ``reason`` is a log field."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


class JwksUnavailable(Exception):
    """The JWKS document could not be fetched. Callers answer 503."""


class JwksCache:
    """Cache Supabase's JWKS for 10 minutes.

    An unknown ``kid`` may force one extra fetch, and at most one such fetch
    every 60 seconds. A scanner sending random key ids otherwise hits JWKS
    on every request.
    """

    def __init__(
        self,
        url: str,
        *,
        fetch: JwksFetch | None = None,
        clock: Clock | None = None,
    ) -> None:
        self._url = url
        self._fetch = fetch or self._http_fetch
        self._clock = clock or time.monotonic
        self._keys: dict[str, Any] = {}
        self._fetched_at: float | None = None
        self._last_forced_at: float | None = None
        self._lock = threading.Lock()

    def public_key(self, kid: str) -> Any | None:
        """Return the key for ``kid``, or None when it is not in the document."""
        with self._lock:
            now = self._clock()
            if self._needs_refresh(now):
                self._refresh(now)
            if kid in self._keys:
                return self._keys[kid]
            if self._forced_recently(now):
                return None
            self._refresh(now)
            self._last_forced_at = self._clock()
            return self._keys.get(kid)

    def _needs_refresh(self, now: float) -> bool:
        if self._fetched_at is None:
            return True
        return now - self._fetched_at >= JWKS_CACHE_TTL_SECONDS

    def _forced_recently(self, now: float) -> bool:
        if self._last_forced_at is None:
            return False
        return now - self._last_forced_at < JWKS_FORCED_REFETCH_SECONDS

    def _refresh(self, now: float) -> None:
        document = self._fetch()
        self._keys = _keys_from_document(document)
        self._fetched_at = now

    def _http_fetch(self) -> dict[str, Any]:
        try:
            response = requests.get(self._url, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as exc:
            raise JwksUnavailable("JWKS request failed") from exc
        if response.status_code != 200:
            raise JwksUnavailable("JWKS request failed")
        try:
            body = response.json()
        except ValueError as exc:
            raise JwksUnavailable("JWKS body is not JSON") from exc
        if not isinstance(body, dict):
            raise JwksUnavailable("JWKS body is not an object")
        return body


def _keys_from_document(document: dict[str, Any]) -> dict[str, Any]:
    raw_keys = document.get("keys")
    if not isinstance(raw_keys, list):
        raise JwksUnavailable("JWKS document has no keys")
    keys: dict[str, Any] = {}
    for item in raw_keys:
        if not isinstance(item, dict):
            continue
        kid = item.get("kid")
        if not isinstance(kid, str) or not kid:
            continue
        if item.get("kty") != "EC":
            continue
        try:
            keys[kid] = PyJWK.from_dict(item).key
        except PyJWTError as exc:
            raise JwksUnavailable("JWKS key could not be parsed") from exc
    return keys


def supabase_issuer(url: str) -> str:
    return url.rstrip("/") + "/auth/v1"


def supabase_jwks_url(url: str) -> str:
    return supabase_issuer(url) + "/.well-known/jwks.json"


def get_jwks_cache(url: str) -> JwksCache:
    if _override_cache is not None:
        return _override_cache
    with _caches_lock:
        cache = _caches.get(url)
        if cache is None:
            cache = JwksCache(url)
            _caches[url] = cache
        return cache


def use_jwks_cache_for_tests(cache: JwksCache | None) -> None:
    """Point every verifier at ``cache``. Tests only."""
    global _override_cache
    _override_cache = cache


class TokenVerifier:
    """Verify one access token against a JWKS cache."""

    def __init__(self, *, issuer: str, audience: str, jwks: JwksCache) -> None:
        self._issuer = issuer
        self._audience = audience
        self._jwks = jwks

    def verify(self, token: str) -> dict[str, Any]:
        try:
            header = get_unverified_header(token)
        except DecodeError as exc:
            raise TokenError("bad_signature") from exc
        if header.get("alg") != "ES256":
            raise TokenError("bad_signature")
        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            raise TokenError("bad_signature")
        key = self._jwks.public_key(kid)
        if key is None:
            raise TokenError("bad_signature")
        try:
            claims = jwt_decode(
                token,
                key,
                algorithms=["ES256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iss", "aud", "sub"]},
            )
        except ExpiredSignatureError as exc:
            raise TokenError("expired") from exc
        except InvalidIssuerError as exc:
            raise TokenError("wrong_iss") from exc
        except InvalidAudienceError as exc:
            raise TokenError("wrong_aud") from exc
        except MissingRequiredClaimError as exc:
            raise TokenError("bad_signature") from exc
        except InvalidTokenError as exc:
            raise TokenError("bad_signature") from exc
        if not isinstance(claims, dict):
            raise TokenError("bad_signature")
        return claims
