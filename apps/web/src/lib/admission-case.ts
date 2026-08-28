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
  isArchived: boolean;
}

/** The five customer-progress stages shown to a Host for an active admission. */
export type HostAdmissionStage =
  | "Invited"
  | "Account Created"
  | "KYC Submitted"
  | "KYC Approved"
  | "Service Enabled";

/** A current follow-up signal, kept separate from the customer-progress stage. */
export type HostAttentionSignal =
  | "Invitation Pending"
  | "Invitation Expired"
  | "KYC Action Required"
  | "Pending Approval";

export interface HostAdmissionLifecyclePresentation {
  stage: HostAdmissionStage | null;
  attention: HostAttentionSignal | null;
  reason: string;
  isArchived: boolean;
}

/**
 * Project detailed admission statuses into the Host's five-stage lifecycle.
 * Attention signals describe what needs follow-up without adding lifecycle
 * stages or exposing provider-level KYC detail.
 */
export function hostAdmissionLifecyclePresentation(
  c: Pick<AdmissionCase, "status" | "kycHostMessage" | "invitation" | "invitedAt">,
  nowSeconds = Date.now() / 1000,
): HostAdmissionLifecyclePresentation {
  switch (c.status) {
    case "draft":
      return { stage: "Invited", attention: "Invitation Pending", reason: "Invitation has not been sent", isArchived: false };
    case "invitation_open": {
      const expired = invitationAttentionLabel(c, nowSeconds) === "Invitation Expired";
      return expired
        ? { stage: "Invited", attention: "Invitation Expired", reason: "Invitation expired", isArchived: false }
        : { stage: "Invited", attention: "Invitation Pending", reason: "Waiting for account creation", isArchived: false };
    }
    case "vip_claimed":
      return { stage: "Account Created", attention: "KYC Action Required", reason: "KYC has not been submitted", isArchived: false };
    case "kyc_in_progress":
      return { stage: "KYC Submitted", attention: null, reason: "KYC review in progress", isArchived: false };
    case "kyc_failed":
      return { stage: "KYC Submitted", attention: "KYC Action Required", reason: c.kycHostMessage || "KYC resubmission required", isArchived: false };
    case "compliance_review":
      return { stage: "KYC Submitted", attention: null, reason: "KYC review in progress", isArchived: false };
    case "kyc_passed":
    case "payment_precheck":
      return { stage: "KYC Approved", attention: null, reason: "KYC approved", isArchived: false };
    case "leader_pending":
      return { stage: "KYC Approved", attention: "Pending Approval", reason: "Awaiting final approval", isArchived: false };
    case "kyc_expired":
      return { stage: "KYC Approved", attention: "KYC Action Required", reason: c.kycHostMessage || "KYC document expired", isArchived: false };
    case "service_enabled":
      return { stage: "Service Enabled", attention: null, reason: "Service is enabled", isArchived: false };
    case "rejected":
      return { stage: null, attention: null, reason: "Service rejected", isArchived: true };
    case "expired":
      return { stage: null, attention: null, reason: "Invitation expired", isArchived: true };
    case "revoked":
      return { stage: null, attention: null, reason: "Revoked", isArchived: true };
  }
}

export interface HostAttentionSummaryGroup {
  signal: HostAttentionSignal;
  ids: string[];
}

/** The single status pill for a Host queue row; lifecycle stages belong in the expanded timeline. */
export function hostRowStatusPresentation(
  c: Pick<AdmissionCase, "status" | "kycHostMessage" | "invitation" | "invitedAt">,
  nowSeconds = Date.now() / 1000,
): { label: string; tone: "warning" | "danger" } | null {
  const lifecycle = hostAdmissionLifecyclePresentation(c, nowSeconds);
  if (lifecycle.isArchived) return { label: lifecycle.reason, tone: "danger" };
  if (!lifecycle.attention) return null;
  return {
    label: lifecycle.attention,
    tone: lifecycle.attention === "KYC Action Required" ? "danger" : "warning",
  };
}

/** Group active Host cases by the exact follow-up signal rendered on their rows. */
export function hostAttentionSummary<T extends {
  id: string;
  status: AdmissionCaseStatus;
  kycHostMessage?: string;
  invitation?: AdmissionCaseInvitation | null;
  invitedAt?: number | null;
}>(cases: readonly T[], nowSeconds = Date.now() / 1000): HostAttentionSummaryGroup[] {
  const order: HostAttentionSignal[] = [
    "KYC Action Required",
    "Invitation Expired",
    "Invitation Pending",
    "Pending Approval",
  ];
  return order.map((signal) => ({
    signal,
    ids: cases
      .filter((c) => hostAdmissionLifecyclePresentation(c, nowSeconds).attention === signal)
      .map((c) => c.id),
  })).filter((group) => group.ids.length > 0);
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
      return { primaryStatus: "Invitation Pending", reason: "Invitation has not been sent", isArchived: false };
    case "invitation_open": {
      const expired = invitationAttentionLabel(c, nowSeconds) === "Invitation Expired";
      return expired
        ? { primaryStatus: "Invitation Pending", reason: "Invitation expired", isArchived: false }
        : { primaryStatus: "Invitation Pending", reason: "Waiting for VIP to click", isArchived: false };
    }
    case "vip_claimed":
      return { primaryStatus: "KYC Action Required", reason: "KYC has not been started", isArchived: false };
    case "kyc_in_progress":
      return { primaryStatus: "KYC Action Required", reason: "KYC in progress", isArchived: false };
    case "kyc_failed":
      return { primaryStatus: "KYC Action Required", reason: c.kycHostMessage || "KYC resubmission required", isArchived: false };
    case "kyc_expired":
      return { primaryStatus: "KYC Action Required", reason: c.kycHostMessage || "Document expired", isArchived: false };
    case "kyc_passed":
      return { primaryStatus: "KYC Review", reason: "KYC approved; pre-check in progress", isArchived: false };
    case "payment_precheck":
      return { primaryStatus: "KYC Review", reason: "Pre-check in progress", isArchived: false };
    case "compliance_review":
      return { primaryStatus: "KYC Review", reason: "Under compliance review", isArchived: false };
    case "leader_pending":
      return { primaryStatus: "Pending Approval", reason: "Awaiting approver decision", isArchived: false };
    case "service_enabled":
      return { primaryStatus: "Service Enabled", reason: "Service is enabled", isArchived: false };
    case "rejected":
      return { primaryStatus: "Archived", reason: "Service rejected", isArchived: true };
    case "expired":
      return { primaryStatus: "Archived", reason: "Invitation expired", isArchived: true };
    case "revoked":
      return { primaryStatus: "Archived", reason: "Revoked", isArchived: true };
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

/** Toggle a group of attention cases without changing unrelated expanded rows. */
export function toggleExpandedCaseIds(current: ReadonlySet<string>, caseIds: readonly string[]): Set<string> {
  const next = new Set(current);
  if (caseIds.every((id) => next.has(id))) {
    caseIds.forEach((id) => next.delete(id));
  } else {
    caseIds.forEach((id) => next.add(id));
  }
  return next;
}

export interface AdmissionHistoryEvent {
  label: string;
  timestamp: number;
  tone: "success" | "danger";
}

/** Keep the Host history audit-friendly without rendering future empty milestones. */
export function admissionCaseHistory(c: {
  createdAt?: number | null;
  invitedAt?: number | null;
  claimedAt?: number | null;
  kycSubmittedAt?: number | null;
  kycApprovedAt?: number | null;
  kycRejectedAt?: number | null;
  kycExpiredAt?: number | null;
  approvalAt?: number | null;
  rejectedAt?: number | null;
}): AdmissionHistoryEvent[] {
  const events: AdmissionHistoryEvent[] = [];
  const add = (label: string, timestamp: number | null | undefined, tone: AdmissionHistoryEvent["tone"] = "success") => {
    if (timestamp) events.push({ label, timestamp, tone });
  };

  add("Invited", c.invitedAt ?? c.createdAt);
  add("Account Created", c.claimedAt);
  add("KYC Submitted", c.kycSubmittedAt);
  add("KYC Approved", c.kycApprovedAt);
  add("KYC rejected", c.kycRejectedAt, "danger");
  add("KYC expired", c.kycExpiredAt, "danger");
  add("Service Enabled", c.approvalAt);
  add("Service rejected", c.rejectedAt, "danger");
  return events;
}

/** Sort active Host follow-ups by their latest recorded case activity. */
export function sortByRecentAdmissionActivity<T extends {
  updatedAt?: number | null;
  invitedAt?: number | null;
  createdAt?: number | null;
}>(cases: readonly T[]): T[] {
  const activityAt = (c: T) => c.updatedAt ?? c.invitedAt ?? c.createdAt ?? 0;
  return [...cases].sort((a, b) => activityAt(b) - activityAt(a));
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
