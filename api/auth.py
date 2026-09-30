"""Access dependency: a service key or a Supabase access token (ALE-214)."""

from __future__ import annotations

import hmac
from dataclasses import dataclass
from typing import Annotated
from urllib.parse import urlparse

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from api.jwt_verify import (
    SUPABASE_JWT_AUDIENCE,
    JwksUnavailable,
    TokenError,
    TokenVerifier,
    get_jwks_cache,
    supabase_issuer,
    supabase_jwks_url,
)
from db.settings import Settings, get_settings
from logging_config import log_auth_denied

_bearer_scheme = HTTPBearer(auto_error=False)

PRODUCTION_SUPABASE_HOST = "jogkvchexsfiwezdpirb.supabase.co"
PRODUCTION_APP_PUBLIC_URL = "https://app.tookratt.com"


@dataclass(frozen=True)
class ServiceCaller:
    """Static key from ``TOOKRATT_API_KEYS``. No ``sub`` and no role."""

    kind: str = "service"


@dataclass(frozen=True)
class UserCaller:
    """Supabase user. ``role`` comes only from ``app_metadata.role``."""

    sub: str
    email: str | None
    role: str | None
    kind: str = "user"


Caller = ServiceCaller | UserCaller


def require_api_auth_config(settings: Settings) -> None:
    """Fail API startup when Supabase is not configured. Ingest does not call this."""
    missing: list[str] = []
    supabase_url = settings.supabase_url
    if not supabase_url:
        missing.append("SUPABASE_URL")
    if not settings.supabase_secret_key:
        missing.append("SUPABASE_SECRET_KEY")
    if missing:
        names = " and ".join(missing)
        raise RuntimeError(f"API startup requires {names}")
    host = urlparse(supabase_url).hostname
    if (
        host == PRODUCTION_SUPABASE_HOST
        and settings.app_public_url != PRODUCTION_APP_PUBLIC_URL
    ):
        raise RuntimeError(
            "API startup requires APP_PUBLIC_URL=https://app.tookratt.com "
            "when SUPABASE_URL is the production project"
        )


def _matches_service_key(candidate: str, keys: set[str]) -> bool:
    candidate_bytes = candidate.encode()
    for key in keys:
        key_bytes = key.encode()
        if len(key_bytes) != len(candidate_bytes):
            continue
        if hmac.compare_digest(key_bytes, candidate_bytes):
            return True
    return False


def _app_role(claims: dict[str, object]) -> str | None:
    metadata = claims.get("app_metadata")
    if not isinstance(metadata, dict):
        return None
    role = metadata.get("role")
    if not isinstance(role, str) or not role:
        return None
    return role


def _email(claims: dict[str, object]) -> str | None:
    email = claims.get("email")
    if isinstance(email, str) and email:
        return email
    return None


def get_token_verifier(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenVerifier:
    if not settings.supabase_url:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Auth service is unavailable.",
                "code": "auth_unavailable",
            },
        )
    return TokenVerifier(
        issuer=supabase_issuer(settings.supabase_url),
        audience=SUPABASE_JWT_AUDIENCE,
        jwks=get_jwks_cache(supabase_jwks_url(settings.supabase_url)),
    )


def _unauthorized(reason: str, credential_type: str) -> HTTPException:
    log_auth_denied(reason=reason, credential_type=credential_type)
    codes = {
        "missing": "missing_credentials",
        "expired": "expired_token",
        "wrong_iss": "invalid_issuer",
        "wrong_aud": "invalid_audience",
        "bad_signature": "invalid_token",
    }
    return HTTPException(
        status_code=401,
        detail={
            "message": "Missing or invalid credentials.",
            "code": codes.get(reason, "invalid_token"),
        },
    )


def _forbidden(reason: str, credential_type: str) -> HTTPException:
    log_auth_denied(reason=reason, credential_type=credential_type)
    return HTTPException(
        status_code=403,
        detail={
            "message": "Credentials are not allowed for this route.",
            "code": "forbidden",
        },
    )


def require_caller(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)
    ],
    settings: Annotated[Settings, Depends(get_settings)],
    verifier: Annotated[TokenVerifier, Depends(get_token_verifier)],
) -> Caller:
    if credentials is None or not credentials.credentials:
        raise _unauthorized("missing", "unknown")
    token = credentials.credentials
    if _matches_service_key(token, settings.tookratt_api_keys):
        return ServiceCaller()
    try:
        claims = verifier.verify(token)
    except JwksUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Auth service is unavailable.",
                "code": "auth_unavailable",
            },
        ) from exc
    except TokenError as exc:
        raise _unauthorized(exc.reason, "unknown") from exc
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise _unauthorized("bad_signature", "unknown")
    return UserCaller(sub=sub, email=_email(claims), role=_app_role(claims))


def require_user(
    caller: Annotated[Caller, Depends(require_caller)],
) -> UserCaller:
    if not isinstance(caller, UserCaller):
        raise _forbidden("service_key", "service")
    return caller


def require_admin(
    user: Annotated[UserCaller, Depends(require_user)],
) -> UserCaller:
    if user.role != "admin":
        raise _forbidden("wrong_role", "user")
    return user
