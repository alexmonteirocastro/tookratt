"""Shared timeout for outbound HTTPS calls (GoTrue and JWKS)."""

# (connect seconds, read seconds). requests waits forever if this is omitted.
REQUEST_TIMEOUT = (3.0, 10.0)
