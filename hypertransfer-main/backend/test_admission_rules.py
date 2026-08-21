"""Unit tests for backend/admission_rules.py — pure Host/VIP admission case rules.

Covered here:
  - recommended (complete dossier) admission route
  - alternative (KYC-first) admission route
  - KYC failure can never reach payment preparation or leader approval
  - Host-visible KYC reason policy (safe categories, restricted outcomes fail closed)

These tests only exercise the pure module; they must not touch the database or HTTP.
"""

import unittest

from admission_rules import ADMISSION_STATUSES, can_transition_admission, host_kyc_reason


class AdmissionTransitionTests(unittest.TestCase):
    """Status transition rules for the admission case state machine."""

    # ---- recommended route: complete dossier before leader approval ----

    def test_recommended_route_requires_kyc_and_precheck_before_leader(self):
        assert can_transition_admission("kyc_in_progress", "kyc_passed", "complete_dossier")
        assert can_transition_admission("kyc_passed", "payment_precheck", "complete_dossier")
        assert not can_transition_admission("kyc_passed", "leader_pending", "complete_dossier")

    def test_recommended_route_precheck_then_leader(self):
        assert can_transition_admission("payment_precheck", "leader_pending", "complete_dossier")
        assert can_transition_admission("leader_pending", "service_enabled", "complete_dossier")
        assert can_transition_admission("leader_pending", "rejected", "complete_dossier")

    # ---- alternative route: KYC-first service approval ----

    def test_alternative_route_skips_precheck_before_leader(self):
        assert can_transition_admission("kyc_in_progress", "kyc_passed", "kyc_first")
        assert can_transition_admission("kyc_passed", "leader_pending", "kyc_first")
        assert can_transition_admission("leader_pending", "service_enabled", "kyc_first")

    def test_alternative_route_still_blocks_precheck_gate_bypass(self):
        # Even the alternative route never lets a failed KYC reach the leader.
        assert not can_transition_admission("kyc_failed", "leader_pending", "kyc_first")
        assert not can_transition_admission("kyc_failed", "payment_precheck", "kyc_first")

    # ---- KYC failure cannot reach payment or leader ----

    def test_kcy_failure_cannot_reach_payment_or_leader(self):
        assert not can_transition_admission("kyc_failed", "payment_precheck", "complete_dossier")
        assert not can_transition_admission("kyc_failed", "leader_pending", "complete_dossier")

    def test_kyc_failure_is_terminal_for_active_invitation(self):
        # kyc_failed / compliance_review / rejected / expired / revoked are terminal
        # for the active invitation: no onward transition to payment or approval.
        for terminal in ("kyc_failed", "compliance_review", "rejected", "expired", "revoked"):
            for target in ("payment_precheck", "leader_pending", "service_enabled", "vip_claimed"):
                assert not can_transition_admission(terminal, target, "complete_dossier"), (
                    f"{terminal} -> {target} must be blocked"
                )

    # ---- base admission lifecycle ----

    def test_case_lifecycle_transitions(self):
        assert can_transition_admission("draft", "invitation_open", "complete_dossier")
        assert can_transition_admission("invitation_open", "vip_claimed", "complete_dossier")
        assert can_transition_admission("invitation_open", "expired", "complete_dossier")
        assert can_transition_admission("invitation_open", "revoked", "complete_dossier")
        assert can_transition_admission("draft", "revoked", "complete_dossier")
        assert can_transition_admission("vip_claimed", "kyc_in_progress", "complete_dossier")
        assert can_transition_admission("kyc_in_progress", "kyc_failed", "complete_dossier")
        assert can_transition_admission("kyc_in_progress", "compliance_review", "complete_dossier")

    def test_unknown_transitions_are_rejected(self):
        assert not can_transition_admission("draft", "vip_claimed", "complete_dossier")
        assert not can_transition_admission("kyc_passed", "kyc_failed", "complete_dossier")
        assert not can_transition_admission("service_enabled", "leader_pending", "complete_dossier")

    def test_unknown_route_is_rejected(self):
        assert not can_transition_admission("kyc_passed", "leader_pending", "unknown_route")

    def test_unknown_status_is_rejected(self):
        assert not can_transition_admission("not_a_status", "kyc_passed", "complete_dossier")
        assert not can_transition_admission("kyc_passed", "not_a_status", "complete_dossier")

    def test_status_set_matches_design_state_model(self):
        assert ADMISSION_STATUSES == frozenset({
            "draft", "invitation_open", "vip_claimed", "kyc_in_progress",
            "kyc_passed", "payment_precheck", "leader_pending", "service_enabled",
            "kyc_failed", "compliance_review", "rejected", "expired", "revoked",
        })


class HostKycReasonTests(unittest.TestCase):
    """Host-visible KYC reason policy: safe categories only, restricted fails closed."""

    def test_restricted_outcome_returns_neutral_message_and_no_contact(self):
        message, may_contact = host_kyc_reason("restricted")
        assert message == (
            "Compliance review required — do not contact the customer for further explanation."
        )
        assert may_contact is False

    def test_compliance_review_code_is_restricted(self):
        message, may_contact = host_kyc_reason("compliance_review")
        assert message == (
            "Compliance review required — do not contact the customer for further explanation."
        )
        assert may_contact is False

    def test_unknown_code_fails_closed_to_neutral_restricted(self):
        # Unknown/internal codes must never leak detail to the Host.
        message, may_contact = host_kyc_reason("some_internal_provider_code")
        assert "compliance" in message.lower()
        assert may_contact is False

    def test_document_expired_is_action_safe(self):
        message, may_contact = host_kyc_reason("document_expired")
        assert "Document expired" in message
        assert may_contact is True

    def test_document_quality_is_action_safe(self):
        message, may_contact = host_kyc_reason("document_quality")
        assert "quality" in message.lower()
        assert may_contact is True

    def test_identity_mismatch_is_action_safe(self):
        message, may_contact = host_kyc_reason("identity_mismatch")
        assert "mismatch" in message.lower()
        assert may_contact is True

    def test_resubmit_is_action_safe(self):
        message, may_contact = host_kyc_reason("resubmit")
        assert "resubmit" in message.lower()
        assert may_contact is True

    def test_reason_never_contains_raw_detail(self):
        for code in ("document_expired", "document_quality", "identity_mismatch",
                     "resubmit", "restricted", "compliance_review"):
            message, _ = host_kyc_reason(code)
            for leaked in ("passport", "provider", "sanction", "STR", "investigation",
                           "applicantId", "webhook", "internal"):
                assert leaked.lower() not in message.lower(), f"{code} leaked {leaked}"


if __name__ == "__main__":
    unittest.main()
