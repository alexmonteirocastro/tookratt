"""Admin invite, list, revoke, restore, and reset-link routes (ALE-214)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from api.auth import UserCaller, require_admin
from api.gotrue import (
    BAN_DURATION,
    GoTrueAdmin,
    GoTrueEmailExists,
    GoTrueNotFound,
    GoTrueRejected,
    GoTrueUnavailable,
)
from api.schemas import (
    ActionLinkResponse,
    AdminUserListResponse,
    AdminUserResponse,
    InviteRequest,
)
from db.settings import Settings, get_settings
from logging_config import log_admin_action

router = APIRouter(dependencies=[Depends(require_admin)])


def get_gotrue_admin(
    settings: Annotated[Settings, Depends(get_settings)],
) -> GoTrueAdmin:
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Auth service is unavailable.",
                "code": "auth_unavailable",
            },
        )
    return GoTrueAdmin(settings.supabase_url, settings.supabase_secret_key)


def _unavailable(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=502,
        detail={
            "message": "Auth service is unavailable.",
            "code": "auth_unavailable",
        },
    )


def _action_link(payload: dict[str, Any]) -> str:
    link = payload.get("action_link")
    if not isinstance(link, str) or not link:
        raise GoTrueUnavailable
    return link


def _target_id(payload: dict[str, Any], fallback: str) -> str:
    user_id = payload.get("id")
    if isinstance(user_id, str) and user_id:
        return user_id
    return fallback


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _status(
    user: dict[str, Any], now: datetime
) -> Literal["active", "invited", "revoked"]:
    banned_until = _parse_datetime(user.get("banned_until"))
    if banned_until is not None and banned_until > now:
        return "revoked"
    if user.get("invited_at") and not user.get("last_sign_in_at"):
        return "invited"
    return "active"


def _role(user: dict[str, Any]) -> str | None:
    metadata = user.get("app_metadata")
    if not isinstance(metadata, dict):
        return None
    role = metadata.get("role")
    if isinstance(role, str) and role:
        return role
    return None


def _to_admin_user(user: dict[str, Any], now: datetime) -> AdminUserResponse | None:
    raw_id = user.get("id")
    if not isinstance(raw_id, str):
        return None
    try:
        user_id = UUID(raw_id)
    except ValueError:
        return None
    email = user.get("email")
    return AdminUserResponse(
        id=user_id,
        email=email if isinstance(email, str) else None,
        status=_status(user, now),
        created_at=_parse_datetime(user.get("created_at")),
        last_sign_in_at=_parse_datetime(user.get("last_sign_in_at")),
        role=_role(user),
    )


@router.post("/admin/invites", response_model=ActionLinkResponse)
def create_invite(
    body: InviteRequest,
    response: Response,
    admin: Annotated[UserCaller, Depends(require_admin)],
    gotrue: Annotated[GoTrueAdmin, Depends(get_gotrue_admin)],
) -> ActionLinkResponse:
    # email_exists is a confirmed account. An invite that was never accepted
    # gets a fresh link from GoTrue, so sending the form again is the resend.
    try:
        payload = gotrue.generate_link("invite", body.email)
        link = _action_link(payload)
    except GoTrueEmailExists as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "That person already has an account.",
                "code": "account_exists",
            },
        ) from exc
    except GoTrueRejected as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Invite was rejected.",
                "code": "invalid_invite",
            },
        ) from exc
    except GoTrueUnavailable as exc:
        raise _unavailable(exc) from exc
    log_admin_action(
        action="invite",
        actor_sub=admin.sub,
        target_user_id=_target_id(payload, ""),
    )
    response.headers["Cache-Control"] = "no-store"
    return ActionLinkResponse(action_link=link)


@router.get("/admin/users", response_model=AdminUserListResponse)
def list_users(
    gotrue: Annotated[GoTrueAdmin, Depends(get_gotrue_admin)],
    page: int = Query(1, ge=1),
) -> AdminUserListResponse:
    try:
        payload = gotrue.list_users(page)
    except (GoTrueUnavailable, GoTrueRejected, GoTrueNotFound) as exc:
        raise _unavailable(exc) from exc
    raw_users = payload.get("users")
    if not isinstance(raw_users, list):
        raise _unavailable(GoTrueUnavailable())
    now = datetime.now(UTC)
    users = [
        mapped
        for item in raw_users
        if isinstance(item, dict) and (mapped := _to_admin_user(item, now)) is not None
    ]
    return AdminUserListResponse(users=users, page=page)


@router.post("/admin/users/{user_id}/revoke", status_code=204)
def revoke_user(
    user_id: UUID,
    admin: Annotated[UserCaller, Depends(require_admin)],
    gotrue: Annotated[GoTrueAdmin, Depends(get_gotrue_admin)],
) -> None:
    try:
        if UUID(admin.sub) == user_id:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "You cannot revoke your own account.",
                    "code": "self_revoke",
                },
            )
    except ValueError:
        pass
    try:
        gotrue.update_user(user_id, {"ban_duration": BAN_DURATION})
    except GoTrueNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail={"message": "User not found.", "code": "not_found"},
        ) from exc
    except (GoTrueUnavailable, GoTrueRejected) as exc:
        raise _unavailable(exc) from exc
    log_admin_action(
        action="revoke",
        actor_sub=admin.sub,
        target_user_id=str(user_id),
    )


@router.post("/admin/users/{user_id}/restore", status_code=204)
def restore_user(
    user_id: UUID,
    admin: Annotated[UserCaller, Depends(require_admin)],
    gotrue: Annotated[GoTrueAdmin, Depends(get_gotrue_admin)],
) -> None:
    try:
        gotrue.update_user(user_id, {"ban_duration": "none"})
    except GoTrueNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail={"message": "User not found.", "code": "not_found"},
        ) from exc
    except (GoTrueUnavailable, GoTrueRejected) as exc:
        raise _unavailable(exc) from exc
    log_admin_action(
        action="restore",
        actor_sub=admin.sub,
        target_user_id=str(user_id),
    )


@router.post("/admin/users/{user_id}/reset-link", response_model=ActionLinkResponse)
def reset_link(
    user_id: UUID,
    response: Response,
    admin: Annotated[UserCaller, Depends(require_admin)],
    gotrue: Annotated[GoTrueAdmin, Depends(get_gotrue_admin)],
) -> ActionLinkResponse:
    try:
        user = gotrue.get_user(user_id)
    except GoTrueNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail={"message": "User not found.", "code": "not_found"},
        ) from exc
    except (GoTrueUnavailable, GoTrueRejected) as exc:
        raise _unavailable(exc) from exc
    banned_until = _parse_datetime(user.get("banned_until"))
    if banned_until is not None and banned_until > datetime.now(UTC):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Restore this account before sending a reset link.",
                "code": "restore_first",
            },
        )
    email = user.get("email")
    if not isinstance(email, str) or not email:
        raise _unavailable(GoTrueUnavailable())
    try:
        payload = gotrue.generate_link("recovery", email)
        link = _action_link(payload)
    except (GoTrueEmailExists, GoTrueRejected, GoTrueUnavailable) as exc:
        raise _unavailable(exc) from exc
    log_admin_action(
        action="reset_link",
        actor_sub=admin.sub,
        target_user_id=str(user_id),
    )
    response.headers["Cache-Control"] = "no-store"
    return ActionLinkResponse(action_link=link)
