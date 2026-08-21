"""admission_provider_adapters.py — provider boundaries for the admission flow.

External capabilities (Okta, Notabene, Hex Trust, KYT) stay behind adapters.
Production fails closed when the required provider configuration is absent; this
prototype never claims a real Okta / Notabene / Hex Trust / KYT integration.

Session-token security: invitation and QR enrollment sessions are single-use
secrets. Only a salted SHA-256 hash is ever persisted (see the
`admission_invitation_sessions.token_hash` column); the raw token is never
stored, so a database leak cannot be replayed.
"""

import hashlib
import hmac
import secrets
from typing import Optional


class HostProvisioningUnavailable(Exception):
    """Raised when a Host identity cannot be provisioned (production Okta OIDC
    is a provider boundary; without real Okta the Host stays pending/disabled)."""


def hash_session_token(token: str, salt: Optional[str] = None) -> str:
    """Salted SHA-256 of a raw session/QR token.

    Returns `"<salt>$<hexdigest>"`. A fresh random salt is generated when none
    is provided, so equal tokens never produce equal stored values.
    """
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}:{token}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_session_token(stored: str, token: str) -> bool:
    """Constant-time verification of a stored `salt$hexdigest` against a raw
    token. Malformed stored values fail closed."""
    if not stored or "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    candidate = hash_session_token(token, salt=salt)
    return hmac.compare_digest(candidate, stored)


# Environment keys a real Okta OIDC integration would require.
OKTA_REQUIRED_ENV = ("OKTA_DOMAIN", "OKTA_CLIENT_ID", "OKTA_CLIENT_SECRET")


def okta_configured(env: dict) -> bool:
    """True when all required Okta OIDC configuration values are present."""
    return all(bool(str(env.get(key) or "").strip()) for key in OKTA_REQUIRED_ENV)


def require_host_provisioning(env: dict, environment: str) -> None:
    """Fail-closed Host provisioning gate.

    In production, Host activation requires a real Okta OIDC configuration;
    without it the Host cannot be provisioned as `active`. Non-production uses
    the existing staff session boundary (demo) and passes.
    """
    if environment == "production" and not okta_configured(env):
        raise HostProvisioningUnavailable(
            "Okta OIDC is not configured; Host provisioning is unavailable in "
            "production."
        )
