/**
 * admission-case.ts — typed labels, status mapping and safe display helpers for
 * the Host-led VIP admission case (2026-08-21).
 *
 * The Host and VIP see only safe projections:
 *  - the Host sees its own case data plus a controlled KYC reason category
 *    (`kycHostMessage`) — never raw KYC evidence or provider detail;
 *  - the VIP sees only its own case status (masked presentation, no Host notes).
 */

export type AdmissionCaseStatus =
  | "draft"
  | "invitation_open"
  | "vip_claimed"
  | "kyc_in_progress"
  | "kyc_passed"
  | "payment_precheck"
  | "leader_pending"
  | "service_enabled"
  | "kyc_failed"
  | "compliance_review"
  | "rejected"
  | "expired"
  | "revoked";

export interface AdmissionCaseInvitation {
  emailExpiresAt: string;
  qrExpiresAt: string;
}

export interface AdmissionCase {
  id: string;
  hostName: string;
  patronEmailMasked: string;
  status: AdmissionCaseStatus;
  kycHostMessage?: string;
  kycValidUntil?: string;
  invitation?: AdmissionCaseInvitation;
}

export type AdmissionStatusTone = "success" | "warning" | "danger" | "neutral";

export const ADMISSION_STATUS_LABELS: Record<AdmissionCaseStatus, string> = {
  draft: "Draft",
  invitation_open: "Invitation open",
  vip_claimed: "VIP claimed",
  kyc_in_progress: "KYC in progress",
  kyc_passed: "KYC passed",
  payment_precheck: "Payment pre-check",
  leader_pending: "Leader approval pending",
  service_enabled: "Service enabled",
  kyc_failed: "KYC failed",
  compliance_review: "Compliance review",
  rejected: "Rejected",
  expired: "Expired",
  revoked: "Revoked",
};

const TERMINAL_ADMISSION_STATUSES: ReadonlySet<AdmissionCaseStatus> = new Set<AdmissionCaseStatus>([
  "kyc_failed",
  "compliance_review",
  "rejected",
  "expired",
  "revoked",
]);

export function isTerminalAdmissionStatus(status: AdmissionCaseStatus): boolean {
  return TERMINAL_ADMISSION_STATUSES.has(status);
}

export function admissionStatusTone(status: AdmissionCaseStatus): AdmissionStatusTone {
  switch (status) {
    case "service_enabled":
    case "kyc_passed":
      return "success";
    case "invitation_open":
    case "vip_claimed":
    case "kyc_in_progress":
    case "payment_precheck":
    case "leader_pending":
      return "warning";
    case "kyc_failed":
    case "compliance_review":
    case "rejected":
    case "expired":
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

/** Mask an invitation email for non-owner display, e.g. vip@example.test -> v***@example.test. */
export function maskPatronEmail(email: string): string {
  const clean = (email || "").trim().toLowerCase();
  const at = clean.indexOf("@");
  if (at <= 0) return "***";
  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Format a Unix-seconds KYC validity timestamp as an ISO date string (empty when unset). */
export function formatKycValidUntil(unixSeconds?: number): string {
  if (!unixSeconds) return "";
  return new Date(unixSeconds * 1000).toISOString();
}
