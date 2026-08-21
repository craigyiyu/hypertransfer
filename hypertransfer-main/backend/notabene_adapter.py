"""notabene_adapter.py — Notabene Travel Rule provider boundary.

Real Notabene integration is outside this prototype. The boundary guarantees:

  - Non-production uses the deterministic :class:`DemoNotabeneProvider`, which
    makes stable decisions from pack data only (no network, no secrets).
  - Production fails closed: :func:`resolve_notabene_provider` raises
    :class:`ProviderUnavailable` whenever the environment is production, with or
    without `NOTABENE_*` env values — the prototype never pretends to submit a
    real Travel Rule message. The API layer maps this to HTTP 503 before any
    custody-address issuance.
"""

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Optional, Protocol, runtime_checkable


class ProviderUnavailable(Exception):
    """Raised when production requires a provider that is not available.

    Mapped to HTTP 503 by the API layer; it must occur before any address
    issuance or funds acceptance.
    """


@dataclass(frozen=True)
class ProviderDecision:
    status: str  # "accepted" | "rejected" | "manual_review"
    reference: str
    reason_code: str


@runtime_checkable
class TransactionCompliancePack(Protocol):
    """Minimal view of a transaction compliance pack needed by providers."""

    id: str
    actual_hkd_amount: str  # decimal string (or Decimal)


class NotabeneProvider(Protocol):
    def validate_and_send(self, pack: TransactionCompliancePack) -> ProviderDecision:
        """Validate and submit the Travel Rule message for one transfer leg."""
        ...


class DemoNotabeneProvider:
    """Deterministic non-production adapter (no network, no credentials)."""

    def validate_and_send(self, pack: TransactionCompliancePack) -> ProviderDecision:
        try:
            amount = Decimal(str(pack.actual_hkd_amount))
        except (InvalidOperation, TypeError, ValueError):
            amount = Decimal("-1")
        if amount <= 0:
            return ProviderDecision("rejected", "", "invalid_amount")
        return ProviderDecision("accepted", f"NB-DEMO-{pack.id}", "")


# Environment keys that a real Notabene integration would require.
NOTABENE_REQUIRED_ENV = ("NOTABENE_APP_ID", "NOTABENE_API_KEY", "NOTABENE_BASE_URL")


def notabene_configured(env: dict) -> bool:
    """True when all required Notabene configuration values are present."""
    return all(bool(str(env.get(key) or "").strip()) for key in NOTABENE_REQUIRED_ENV)


def resolve_notabene_provider(
    env: dict,
    environment: str = "sandbox",
) -> NotabeneProvider:
    """Resolve the Travel Rule provider for the current environment.

    Fail-closed rule: in production this prototype raises
    :class:`ProviderUnavailable` regardless of configuration, because real
    Notabene submission is not implemented here. Non-production always gets the
    deterministic demo adapter.
    """
    if environment == "production":
        if not notabene_configured(env):
            raise ProviderUnavailable(
                "Notabene is not configured; Travel Rule submission is unavailable "
                "in production."
            )
        raise ProviderUnavailable(
            "Real Notabene integration is not available in this prototype; "
            "failing closed rather than pretending to submit."
        )
    return DemoNotabeneProvider()
