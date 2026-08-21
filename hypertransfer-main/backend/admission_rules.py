"""admission_rules.py — pure status transitions and Host-visible KYC reason policy.

This module is intentionally dependency-free (no database, no HTTP, no framework
imports) so it can be unit-tested in isolation and reused by the API layer.

State model (from the 2026-08-21 design):

    draft -> invitation_open -> vip_claimed -> kyc_in_progress -> kyc_passed
    kyc_in_progress -> kyc_failed | compliance_review
    kyc_passed -> payment_precheck -> leader_pending -> service_enabled   (complete_dossier)
    kyc_passed -> leader_pending -> service_enabled                        (kyc_first)
    leader_pending -> rejected
    invitation_open -> expired | revoked

`kyc_failed`, `compliance_review`, `rejected`, `expired` and `revoked` are
terminal for the active invitation; a controlled resubmission starts a new KYC
attempt or a replacement invitation (preserving the audit relationship).
"""

from typing import Tuple

ADMISSION_STATUSES = frozenset({
    "draft", "invitation_open", "vip_claimed", "kyc_in_progress",
    "kyc_passed", "payment_precheck", "leader_pending", "service_enabled",
    "kyc_failed", "compliance_review", "rejected", "expired", "revoked",
})

# --------------------------------------------------------------------------- #
# Status transitions
# --------------------------------------------------------------------------- #
# Route "complete_dossier": full dossier (KYC -> source/counterparty -> pre-check)
#   must be completed before the leader sees the case.
# Route "kyc_first": KYC-first service approval (alternative product route) —
#   source classification, KYT and the transaction Travel Rule pack only run when
#   the VIP starts a payment.
# --------------------------------------------------------------------------- #
_TRANSITIONS: dict[str, dict[str, frozenset[str]]] = {
    "complete_dossier": {
        "draft": frozenset({"invitation_open", "revoked"}),
        "invitation_open": frozenset({"vip_claimed", "expired", "revoked"}),
        "vip_claimed": frozenset({"kyc_in_progress"}),
        "kyc_in_progress": frozenset({"kyc_passed", "kyc_failed", "compliance_review"}),
        "kyc_passed": frozenset({"payment_precheck"}),
        "payment_precheck": frozenset({"leader_pending"}),
        "leader_pending": frozenset({"service_enabled", "rejected"}),
    },
    "kyc_first": {
        "draft": frozenset({"invitation_open", "revoked"}),
        "invitation_open": frozenset({"vip_claimed", "expired", "revoked"}),
        "vip_claimed": frozenset({"kyc_in_progress"}),
        "kyc_in_progress": frozenset({"kyc_passed", "kyc_failed", "compliance_review"}),
        "kyc_passed": frozenset({"leader_pending"}),
        "leader_pending": frozenset({"service_enabled", "rejected"}),
    },
}

# Terminals for the active invitation: nothing may advance them toward payment,
# Travel Rule preparation, address issuance, or the leader's approval queue.
_TERMINAL_STATUSES = frozenset(
    {"kyc_failed", "compliance_review", "rejected", "expired", "revoked"}
)


def can_transition_admission(current: str, target: str, route: str) -> bool:
    """Return whether `current -> target` is a legal admission-case transition for
    the given `route` ("complete_dossier" or "kyc_first").

    Unknown statuses, unknown routes, and transitions out of terminal statuses
    always return False (fail closed).
    """
    if current not in ADMISSION_STATUSES or target not in ADMISSION_STATUSES:
        return False
    if current in _TERMINAL_STATUSES:
        return False
    allowed = _TRANSITIONS.get(route, {}).get(current)
    if allowed is None:
        return False
    return target in allowed


# --------------------------------------------------------------------------- #
# Host-visible KYC reason policy
# --------------------------------------------------------------------------- #
# Hosts receive a controlled, actionable reason category only. They never receive
# document copies, document numbers, home address, biometric output, raw provider
# decision detail, sanctions/PEP match detail, suspicious-activity information,
# STR information, or an investigation rationale. Restricted outcomes use a
# neutral status to avoid tipping-off.
# --------------------------------------------------------------------------- #
_RESTRICTED_MESSAGE = (
    "Compliance review required — do not contact the customer for further explanation."
)

# code -> (safe message, host may contact the customer about it)
_HOST_KYC_REASONS: dict[str, Tuple[str, bool]] = {
    "document_expired": (
        "Document expired — ask the VIP to resubmit a valid document.",
        True,
    ),
    "document_quality": (
        "Document/image quality insufficient — ask the VIP to resubmit a clear document.",
        True,
    ),
    "identity_mismatch": (
        "Identity-data mismatch — the VIP must resubmit with matching details.",
        True,
    ),
    "resubmit": (
        "VIP must resubmit — please request a new KYC attempt.",
        True,
    ),
    # Restricted outcomes: neutral status, no contact, no explanation.
    "restricted": (_RESTRICTED_MESSAGE, False),
    "compliance_review": (_RESTRICTED_MESSAGE, False),
}


def host_kyc_reason(code: str) -> Tuple[str, bool]:
    """Map an internal KYC outcome code to the Host-safe message.

    Returns `(message, may_contact_customer)`. Any unrecognised or restricted
    code fails closed to the neutral restricted message with `may_contact=False`
    so internal detail can never reach the Host.
    """
    if code in _HOST_KYC_REASONS:
        return _HOST_KYC_REASONS[code]
    return _RESTRICTED_MESSAGE, False
