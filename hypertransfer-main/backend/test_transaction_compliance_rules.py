"""Unit tests for backend/transaction_compliance_rules.py — per-transfer compliance rules.

Covered here:
  - KYC expiry is the earlier of six calendar months and the earliest relied-on
    identity-document expiry
  - HKD 8,000 switches basic versus enhanced Travel Rule field depth; a low-value
    transfer is still "basic" and never "not_required"
  - any change to the payment fingerprint (asset, network, amount, source type,
    source identifier, counterparty) requires re-validation
  - every transfer leg (verification / main) is a distinct compliance event

These tests only exercise the pure module; they must not touch the database or HTTP.
"""

import calendar
import unittest
from datetime import datetime, timezone
from decimal import Decimal

from transaction_compliance_rules import (
    HKD_TRAVEL_RULE_THRESHOLD,
    PaymentFingerprint,
    kyc_valid_until,
    payment_change_requires_revalidation,
    travel_rule_depth,
)

# 2025-01-01 00:00:00 UTC — fixed epoch used by the plan's examples.
APPROVED_AT = 1_735_689_600


def add_calendar_months_utc(epoch_seconds: int, months: int) -> int:
    """Reference implementation: calendar-month arithmetic on UTC (day clamped to
    the target month's last day). Used only to build expectations; the module
    under test performs its own arithmetic."""
    dt = datetime.fromtimestamp(epoch_seconds, tz=timezone.utc)
    month_index = dt.year * 12 + (dt.month - 1) + months
    year, month = divmod(month_index, 12)
    month += 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return int(datetime(year, month, day, dt.hour, dt.minute, dt.second, tzinfo=timezone.utc).timestamp())


class KycValidUntilTests(unittest.TestCase):
    """KYC expiry: min(approved + 6 calendar months, earliest relied-on document expiry)."""

    def test_kyc_expiry_uses_earlier_document_expiry(self):
        approved_at = APPROVED_AT
        assert kyc_valid_until(approved_at, [approved_at + 90 * 86400]) == approved_at + 90 * 86400

    def test_no_documents_falls_back_to_six_calendar_months(self):
        assert kyc_valid_until(APPROVED_AT, []) == add_calendar_months_utc(APPROVED_AT, 6)

    def test_earliest_of_multiple_documents_wins(self):
        early = APPROVED_AT + 60 * 86400
        later = APPROVED_AT + 120 * 86400
        assert kyc_valid_until(APPROVED_AT, [later, early]) == early

    def test_document_expiry_after_six_months_does_not_shorten(self):
        far = APPROVED_AT + 400 * 86400
        assert kyc_valid_until(APPROVED_AT, [far]) == add_calendar_months_utc(APPROVED_AT, 6)

    def test_six_month_window_is_calendar_based_not_fixed_180_days(self):
        # Approved 2025-01-31 -> six calendar months = 2025-07-31 (181 days), not 180.
        jan31 = datetime(2025, 1, 31, tzinfo=timezone.utc).timestamp()
        expected = datetime(2025, 7, 31, tzinfo=timezone.utc).timestamp()
        assert kyc_valid_until(int(jan31), []) == int(expected)

    def test_month_end_clamping(self):
        # Approved 2025-08-31 -> six calendar months = 2026-02-28 (Feb 2026, no leap).
        aug31 = datetime(2025, 8, 31, tzinfo=timezone.utc).timestamp()
        expected = datetime(2026, 2, 28, tzinfo=timezone.utc).timestamp()
        assert kyc_valid_until(int(aug31), []) == int(expected)

    def test_leap_year_clamping(self):
        # Approved 2024-08-31 -> six calendar months = 2025-02-28 (2025 not leap).
        aug31_2024 = datetime(2024, 8, 31, tzinfo=timezone.utc).timestamp()
        expected = datetime(2025, 2, 28, tzinfo=timezone.utc).timestamp()
        assert kyc_valid_until(int(aug31_2024), []) == int(expected)


class TravelRuleDepthTests(unittest.TestCase):
    """HKD 8,000 switches basic vs enhanced field depth; it is never an exemption."""

    def test_threshold_constant_is_8000_hkd(self):
        assert HKD_TRAVEL_RULE_THRESHOLD == Decimal("8000")

    def test_low_value_transfer_is_basic_not_not_required(self):
        assert travel_rule_depth(Decimal("7999.99")) == "basic"

    def test_exactly_threshold_is_enhanced(self):
        assert travel_rule_depth(Decimal("8000")) == "enhanced"

    def test_above_threshold_is_enhanced(self):
        assert travel_rule_depth(Decimal("8000.01")) == "enhanced"
        assert travel_rule_depth(Decimal("80000")) == "enhanced"

    def test_even_one_unit_verification_transfer_is_basic(self):
        # The 1 USDT/USDC verification transfer is itself a basic Travel Rule record.
        assert travel_rule_depth(Decimal("8")) == "basic"


class PaymentChangeRevalidationTests(unittest.TestCase):
    """A changed fingerprint invalidates the prior pre-check and forces re-validation."""

    def test_changed_wallet_requires_new_pack(self):
        assert payment_change_requires_revalidation(
            PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-old"),
            PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-new"),
        )

    def test_identical_fingerprint_does_not_require_revalidation(self):
        before = PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-abc")
        after = PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-abc")
        assert not payment_change_requires_revalidation(before, after)

    def test_changed_asset_requires_revalidation(self):
        assert payment_change_requires_revalidation(
            PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-abc"),
            PaymentFingerprint("USDC", "tron", "10000", "wallet", "T-abc"),
        )

    def test_changed_network_requires_revalidation(self):
        assert payment_change_requires_revalidation(
            PaymentFingerprint("USDT", "ethereum", "10000", "wallet", "T-abc"),
            PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-abc"),
        )

    def test_changed_amount_requires_revalidation(self):
        assert payment_change_requires_revalidation(
            PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-abc"),
            PaymentFingerprint("USDT", "tron", "10001", "wallet", "T-abc"),
        )

    def test_changed_source_type_requires_revalidation(self):
        assert payment_change_requires_revalidation(
            PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-abc"),
            PaymentFingerprint("USDT", "tron", "10000", "vasp", "T-abc"),
        )

    def test_changed_counterparty_requires_revalidation(self):
        before = PaymentFingerprint("USDT", "tron", "10000", "vasp", "EX-1", "CP-A")
        after = PaymentFingerprint("USDT", "tron", "10000", "vasp", "EX-1", "CP-B")
        assert payment_change_requires_revalidation(before, after)

    def test_counterparty_optional(self):
        before = PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-abc")
        after = PaymentFingerprint("USDT", "tron", "10000", "wallet", "T-abc", "CP-A")
        assert payment_change_requires_revalidation(before, after)


if __name__ == "__main__":
    unittest.main()
