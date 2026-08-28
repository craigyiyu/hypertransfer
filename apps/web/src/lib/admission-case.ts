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
  | "kyc_expired"
  | "compliance_review"
  | "rejected"
  | "expired"
  | "revoked";

export interface AdmissionCaseInvitation {
  emailExpiresAt?: string | null;
  qrExpiresAt?: string | null;
}

export interface AdmissionCase {
  id: string;
  hostName: string;
  patronEmailMasked: string;
  status: AdmissionCaseStatus;
  kycHostMessage?: string;
  kycValidUntil?: string;
  invitedAt?: number | null;
  invitation?: AdmissionCaseInvitation | null;
}

export type AdmissionStatusTone = "success" | "warning" | "danger" | "neutral";

export const ADMISSION_STATUS_LABELS: Record<AdmissionCaseStatus, string> = {
  draft: "Draft",
  invitation_open: "Invitation open",
  vip_claimed: "VIP claimed",
  kyc_in_progress: "KYC in progress",
  kyc_passed: "KYC passed",
  payment_precheck: "Payment pre-check",
  leader_pending: "Pending Approval",
  service_enabled: "Service enabled",
  kyc_failed: "KYC failed",
  kyc_expired: "KYC Expired",
  compliance_review: "Compliance review",
  rejected: "Rejected",
  expired: "Expired",
  revoked: "Revoked",
};

const TERMINAL_ADMISSION_STATUSES: ReadonlySet<AdmissionCaseStatus> = new Set<AdmissionCaseStatus>([
  "kyc_failed",
  "kyc_expired",
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
    case "kyc_expired":
    case "compliance_review":
    case "rejected":
    case "expired":
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

export interface AdmissionTimelineStepState {
  completed: boolean;
  current: boolean;
}

/** Concise Host-facing grouping; detailed values remain in the audit lifecycle. */
export type HostAdmissionPrimaryStatus =
  | "Invitation Pending"
  | "KYC Action Required"
  | "KYC Review"
  | "Pending Approval"
  | "Service Enabled"
  | "Archived";

export interface HostAdmissionPresentation {
  primaryStatus: HostAdmissionPrimaryStatus;
  reason: string;
  actor: "Host" | "VIP" | "Operations" | "Compliance" | "Approver" | "None";
  action: string;
  isArchived: boolean;
}

/**
 * Translate detailed, auditable lifecycle states into a small Host queue.
 * `kycHostMessage` is already a safe category from the API, never raw
 * provider evidence.
 */
export function hostAdmissionPresentation(
  c: Pick<AdmissionCase, "status" | "kycHostMessage" | "invitation" | "invitedAt">,
  nowSeconds = Date.now() / 1000,
): HostAdmissionPresentation {
  switch (c.status) {
    case "draft":
      return { primaryStatus: "Invitation Pending", reason: "Invitation has not been sent", actor: "Host", action: "Send invitation", isArchived: false };
    case "invitation_open": {
      const expired = invitationAttentionLabel(c, nowSeconds) === "Invitation Expired";
      return expired
        ? { primaryStatus: "Invitation Pending", reason: "Invitation expired", actor: "Host", action: "Resend invitation", isArchived: false }
        : { primaryStatus: "Invitation Pending", reason: "Waiting for VIP to click", actor: "VIP", action: "Click invitation", isArchived: false };
    }
    case "vip_claimed":
      return { primaryStatus: "KYC Action Required", reason: "KYC has not been started", actor: "VIP", action: "Complete KYC", isArchived: false };
    case "kyc_in_progress":
      return { primaryStatus: "KYC Action Required", reason: "KYC in progress", actor: "VIP", action: "Complete KYC", isArchived: false };
    case "kyc_failed":
      return { primaryStatus: "KYC Action Required", reason: c.kycHostMessage || "KYC resubmission required", actor: "VIP", action: "Resubmit KYC", isArchived: false };
    case "kyc_expired":
      return { primaryStatus: "KYC Action Required", reason: c.kycHostMessage || "Document expired", actor: "VIP", action: "Resubmit KYC", isArchived: false };
    case "kyc_passed":
      return { primaryStatus: "KYC Review", reason: "KYC approved; pre-check in progress", actor: "Operations", action: "Complete pre-check", isArchived: false };
    case "payment_precheck":
      return { primaryStatus: "KYC Review", reason: "Pre-check in progress", actor: "Operations", action: "Complete pre-check", isArchived: false };
    case "compliance_review":
      return { primaryStatus: "KYC Review", reason: "Under compliance review", actor: "Compliance", action: "Review case", isArchived: false };
    case "leader_pending":
      return { primaryStatus: "Pending Approval", reason: "Awaiting approver decision", actor: "Approver", action: "Approve or reject", isArchived: false };
    case "service_enabled":
      return { primaryStatus: "Service Enabled", reason: "Service is enabled", actor: "None", action: "No action required", isArchived: false };
    case "rejected":
      return { primaryStatus: "Archived", reason: "Service rejected", actor: "None", action: "Create a new application if appropriate", isArchived: true };
    case "expired":
      return { primaryStatus: "Archived", reason: "Invitation expired", actor: "None", action: "Create a new invitation if appropriate", isArchived: true };
    case "revoked":
      return { primaryStatus: "Archived", reason: "Revoked", actor: "Host", action: "Re-enable application if revoked by mistake", isArchived: true };
  }
}

/** Return visual progress for the five Host-visible admission milestones. */
export function admissionTimeline(status: AdmissionCaseStatus): AdmissionTimelineStepState[] {
  const completedCount: Record<AdmissionCaseStatus, number> = {
    draft: 0,
    invitation_open: 1,
    vip_claimed: 2,
    kyc_in_progress: 2,
    kyc_passed: 4,
    payment_precheck: 4,
    leader_pending: 4,
    service_enabled: 5,
    kyc_failed: 3,
    kyc_expired: 4,
    compliance_review: 3,
    rejected: 4,
    expired: 1,
    revoked: 0,
  };
  const noCurrent = new Set<AdmissionCaseStatus>([
    "kyc_passed", "payment_precheck", "leader_pending", "service_enabled", "kyc_failed", "kyc_expired",
    "compliance_review", "rejected", "expired", "revoked",
  ]);
  const done = completedCount[status];
  return Array.from({ length: 5 }, (_, index) => ({
    completed: index < done,
    current: !noCurrent.has(status) && index === done,
  }));
}

/** Format editable USD input with separators while preserving up to two decimals. */
export function formatUsdInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const intPart = cleaned.slice(0, dotIdx).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intPart}.${cleaned.slice(dotIdx + 1).slice(0, 2)}`;
}

/** Derive the Host-visible invitation follow-up label from the email expiry. */
export function invitationAttentionLabel(
  c: {
    status: string;
    invitedAt?: number | null;
    invitation?: { emailExpiresAt?: string | null } | null;
  },
  nowSeconds = Date.now() / 1000,
): string {
  const emailExpiry = c.invitation?.emailExpiresAt ? Date.parse(c.invitation.emailExpiresAt) / 1000 : NaN;
  if (c.status === "invitation_open" && Number.isFinite(emailExpiry) && emailExpiry <= nowSeconds) {
    return "Invitation Expired";
  }
  const days = c.invitedAt ? Math.max(0, Math.floor((nowSeconds - c.invitedAt) / 86400)) : 0;
  return days > 0 ? `Invite not clicked · ${days} day${days > 1 ? "s" : ""} ago` : "Invite not clicked";
}

/** Safe action policy for an invitation: expired bearer links are never reused. */
export function invitationActionPolicy(
  c: Pick<AdmissionCase, "status" | "invitation" | "invitedAt">,
  nowSeconds = Date.now() / 1000,
): { canResend: boolean; canRemind: boolean; canQr: boolean; canRevoke: boolean } {
  const invitationOpen = c.status === "draft" || c.status === "invitation_open";
  const expired = c.status === "invitation_open"
    && invitationAttentionLabel(c, nowSeconds) === "Invitation Expired";
  return {
    canResend: invitationOpen,
    canRemind: invitationOpen && !expired,
    canQr: invitationOpen && !expired,
    canRevoke: !["rejected", "expired", "revoked"].includes(c.status),
  };
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
