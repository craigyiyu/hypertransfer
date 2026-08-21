"""transaction_compliance_rules.py — per-transfer Travel Rule / KYC compliance rules.

This module is intentionally dependency-free (no database, no HTTP, no framework
imports) so it can be unit-tested in isolation and reused by the API layer.

Rules implemented:
  - HKD 8,000 switches basic versus enhanced Travel Rule field depth. It never
    makes Travel Rule optional: every transfer, including the 1-unit verification
    transfer, carries its own basic or enhanced pack.
  - KYC expiry is the earlier of six calendar months after approval and the
    earliest expiry date of any relied-on identity document.
  - Any change to the actual payment fingerprint (asset, network, amount, source
    type, source identifier, counterparty) invalidates the prior pre-check and
    forces re-validation before address issuance.
"""

import calendar
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal, Optional

HKD_TRAVEL_RULE_THRESHOLD = Decimal("8000")

# Transfer legs: every test and main VA transfer creates a distinct pack.
VERIFICATION_LEG = "verification"
MAIN_LEG = "main"
TRANSFER_LEGS = frozenset({VERIFICATION_LEG, MAIN_LEG})


def _add_calendar_months(epoch_seconds: int, months: int) -> int:
    """Add whole calendar months on UTC, clamping the day to the target month's
    last day (e.g. 31 Jan + 6 months -> 31 Jul; 31 Aug + 6 months -> 28/29 Feb)."""
    dt = datetime.fromtimestamp(epoch_seconds, tz=timezone.utc)
    month_index = dt.year * 12 + (dt.month - 1) + months
    year, month = divmod(month_index, 12)
    month += 1
    # Clamp to the last day of the target month (handles leap years).
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return int(datetime(year, month, day, dt.hour, dt.minute, dt.second, tzinfo=timezone.utc).timestamp())


def kyc_valid_until(approved_at: int, document_expiries: list[int]) -> int:
    """Authoritative KYC expiry:

        valid_until = min(approved_at + six calendar months,
                          earliest expiry date of any relied-on identity document)

    `document_expiries` are Unix timestamps (seconds) of relied-on identity
    documents. An empty list means no document constraint (fall back to six
    calendar months). Calendar-month arithmetic is used, never `180 * 86400`.
    """
    six_months = _add_calendar_months(int(approved_at), 6)
    if not document_expiries:
        return six_months
    earliest_document = min(int(expiry) for expiry in document_expiries)
    return min(six_months, earliest_document)


def travel_rule_depth(actual_hkd_amount: Decimal) -> Literal["basic", "enhanced"]:
    """Field depth for the actual amount's Transaction Travel Rule Pack.

    - below HKD 8,000 -> "basic" Travel Rule data (still required);
    - HKD 8,000 and above -> "enhanced" originator fields in addition to basic.
    There is no "not_required" outcome: HKD 8,000 only switches field depth.
    """
    if Decimal(actual_hkd_amount) >= HKD_TRAVEL_RULE_THRESHOLD:
        return "enhanced"
    return "basic"


@dataclass(frozen=True)
class PaymentFingerprint:
    """Immutable fingerprint of the actual, confirmed payment.

    Mirrors the TypeScript `PaymentFingerprint` in
    `client/src/lib/transaction-compliance.ts`.
    """

    asset: str  # "USDT" | "USDC"
    network: str  # "ethereum" | "tron"
    actual_amount: str  # decimal string
    source_type: str  # "wallet" | "vasp"
    source_identifier: str  # wallet address or VASP/account reference
    counterparty_id: Optional[str] = None  # VASP/counterparty reference (optional)


def payment_change_requires_revalidation(
    before: PaymentFingerprint, after: PaymentFingerprint
) -> bool:
    """Return True when the actual payment differs from the earlier pre-check in
    any fingerprint property. If the amount crosses the threshold, or the asset,
    network, source wallet, exchange account, or counterparty differs, the prior
    pre-check cannot be reused and the payment must return to the necessary
    data/validation step."""
    return before != after
