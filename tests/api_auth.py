"""Static service key and a local ES256 pair for API tests. No live Supabase."""

from __future__ import annotations

import base64
import json
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from jwt.algorithms import ECAlgorithm

TEST_API_KEY = "test-api-key"
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_API_KEY}"}

TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_SUPABASE_SECRET = "sb_secret_test"
TEST_ISSUER = f"{TEST_SUPABASE_URL}/auth/v1"
TEST_JWKS_URL = f"{TEST_ISSUER}/.well-known/jwks.json"
TEST_KID = "test-key"
MEMBER_SUB = "11111111-1111-4111-8111-111111111111"
ADMIN_SUB = "22222222-2222-4222-8222-222222222222"
_TOKEN_EXP = 4_102_444_800

_private_key = ec.generate_private_key(ec.SECP256R1())
_public_jwk = json.loads(ECAlgorithm.to_jwk(_private_key.public_key()))
_public_jwk["kid"] = TEST_KID
_public_jwk["alg"] = "ES256"
_public_jwk["use"] = "sig"


def fetch_test_jwks() -> dict[str, Any]:
    return {"keys": [_public_jwk]}


def sign_access_token(
    *,
    role: str | None = "member",
    sub: str = MEMBER_SUB,
    email: str = "member@example.com",
    issuer: str = TEST_ISSUER,
    audience: str = "authenticated",
    exp: int = _TOKEN_EXP,
    top_level_role: str = "authenticated",
    omit: set[str] | None = None,
    private_key: ec.EllipticCurvePrivateKey | None = None,
    kid: str = TEST_KID,
    algorithm: str = "ES256",
) -> str:
    claims: dict[str, Any] = {
        "sub": sub,
        "aud": audience,
        "iss": issuer,
        "exp": exp,
        "email": email,
        "role": top_level_role,
        "app_metadata": {} if role is None else {"role": role},
    }
    for name in omit or set():
        claims.pop(name, None)
    key: Any = private_key or _private_key
    if algorithm == "HS256":
        key = "test-hs256-secret-at-least-32-bytes"
    return jwt.encode(claims, key, algorithm=algorithm, headers={"kid": kid})


def unsigned_token() -> str:
    """``alg: none`` token. PyJWT refuses to sign these."""
    header = _b64({"alg": "none", "typ": "JWT", "kid": TEST_KID})
    payload = _b64(
        {
            "sub": MEMBER_SUB,
            "aud": "authenticated",
            "iss": TEST_ISSUER,
            "exp": _TOKEN_EXP,
            "role": "authenticated",
        }
    )
    return f"{header}.{payload}."


def _b64(value: dict[str, Any]) -> str:
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


USER_HEADERS = {"Authorization": f"Bearer {sign_access_token()}"}
_ADMIN_TOKEN = sign_access_token(
    role="admin",
    sub=ADMIN_SUB,
    email="admin@example.com",
)
ADMIN_HEADERS = {"Authorization": f"Bearer {_ADMIN_TOKEN}"}
