/**
 * admission-case.test.ts — unit tests for the admission-case display helpers.
 */
import { describe, expect, it } from "vitest";

import {
  ADMISSION_STATUS_LABELS,
  admissionStatusTone,
  admissionTimeline,
  admissionCaseHistory,
  hostAdmissionPresentation,
  hostAdmissionLifecyclePresentation,
  hostRowStatusPresentation,
  hostAttentionSummary,
  invitationActionPolicy,
  isTerminalAdmissionStatus,
  maskPatronEmail,
  sortByRecentAdmissionActivity,
  toggleExpandedCaseIds,
  type AdmissionCaseStatus,
} from "@/lib/admission-case";
import * as admissionCase from "@/lib/admission-case";

describe("admission-case display helpers", () => {
  it("labels every admission status", () => {
    const statuses: AdmissionCaseStatus[] = [
      "draft",
      "invitation_open",
      "vip_claimed",
      "kyc_in_progress",
      "kyc_passed",
      "payment_precheck",
      "leader_pending",
      "service_enabled",
      "kyc_failed",
      "kyc_expired",
      "compliance_review",
      "rejected",
      "expired",
      "revoked",
    ];
    for (const status of statuses) {
      expect(ADMISSION_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("masks the invitation email without revealing the full address", () => {
    expect(maskPatronEmail("vip@example.test")).toBe("v***@example.test");
    expect(maskPatronEmail("VIP@Example.test")).toBe("v***@example.test");
    expect(maskPatronEmail("not-an-email")).toBe("***");
  });

  it("treats failure and terminal states as danger", () => {
    for (const status of ["kyc_failed", "compliance_review", "rejected", "expired", "revoked"] as const) {
      expect(admissionStatusTone(status)).toBe("danger");
    }
  });

  it("treats service_enabled and kyc_passed as success", () => {
    expect(admissionStatusTone("service_enabled")).toBe("success");
    expect(admissionStatusTone("kyc_passed")).toBe("success");
  });

  it("marks only terminal statuses as terminal", () => {
    expect(isTerminalAdmissionStatus("revoked")).toBe(true);
    expect(isTerminalAdmissionStatus("kyc_failed")).toBe(true);
    expect(isTerminalAdmissionStatus("service_enabled")).toBe(false);
    expect(isTerminalAdmissionStatus("invitation_open")).toBe(false);
  });

  it("uses the agreed Pending Approval and KYC Expired labels", () => {
    const labels = ADMISSION_STATUS_LABELS as Record<string, string>;
    expect(labels.leader_pending).toBe("Pending Approval");
    expect(labels.kyc_expired).toBe("KYC Expired");
  });

  it("keeps Service enabled neutral while approval is pending", () => {
    expect(admissionTimeline("leader_pending")).toEqual([
      { completed: true, current: false },
      { completed: true, current: false },
      { completed: true, current: false },
      { completed: true, current: false },
      { completed: false, current: false },
    ]);
  });

  it("projects detailed audit states into concise Host-facing statuses without internal routing", () => {
    expect(hostAdmissionPresentation({ status: "kyc_expired", kycHostMessage: "Document expired" }))
      .toMatchObject({
        primaryStatus: "KYC Action Required",
        reason: "Document expired",
      });
    expect(hostAdmissionPresentation({ status: "compliance_review" }))
      .toMatchObject({
        primaryStatus: "KYC Review",
        reason: "Under compliance review",
      });
    expect(hostAdmissionPresentation({ status: "leader_pending" }))
      .toMatchObject({ primaryStatus: "Pending Approval" });
    expect(hostAdmissionPresentation({ status: "rejected" }))
      .toMatchObject({ primaryStatus: "Archived", reason: "Service rejected" });

    const pendingApproval = hostAdmissionPresentation({ status: "leader_pending" });
    expect(pendingApproval).not.toHaveProperty("actor");
    expect(pendingApproval).not.toHaveProperty("action");
  });

  it("separates the five Host lifecycle stages from attention signals", () => {
    expect(hostAdmissionLifecyclePresentation({ status: "vip_claimed" })).toMatchObject({
      stage: "Account Created",
      attention: "KYC Action Required",
      isArchived: false,
    });
    expect(hostAdmissionLifecyclePresentation({ status: "kyc_in_progress" })).toMatchObject({
      stage: "KYC Submitted",
      attention: null,
    });
    expect(hostAdmissionLifecyclePresentation({ status: "leader_pending" })).toMatchObject({
      stage: "KYC Approved",
      attention: "Pending Approval",
    });
    expect(hostAdmissionLifecyclePresentation({ status: "kyc_expired" })).toMatchObject({
      stage: "KYC Approved",
      attention: "KYC Action Required",
    });
    expect(hostAdmissionLifecyclePresentation({ status: "revoked" })).toMatchObject({
      stage: null,
      attention: null,
      isArchived: true,
    });
  });

  it("groups the Summary by the same attention signal used by case rows", () => {
    expect(hostAttentionSummary([
      { id: "pending", status: "leader_pending" },
      { id: "new-account", status: "vip_claimed" },
      { id: "expired-kyc", status: "kyc_expired" },
    ])).toEqual([
      { signal: "KYC Action Required", ids: ["new-account", "expired-kyc"] },
      { signal: "Pending Approval", ids: ["pending"] },
    ]);
  });

  it("shows only the current attention signal in an active Host row", () => {
    expect(hostRowStatusPresentation({ status: "vip_claimed" })).toEqual({
      label: "KYC Action Required",
      tone: "danger",
    });
    expect(hostRowStatusPresentation({ status: "leader_pending" })).toEqual({
      label: "Pending Approval",
      tone: "warning",
    });
    expect(hostRowStatusPresentation({ status: "service_enabled" })).toBeNull();
  });

  it("marks reached milestones as complete rather than current", () => {
    expect(admissionTimeline("invitation_open")).toEqual([
      { completed: true, current: false },
      { completed: false, current: true },
      { completed: false, current: false },
      { completed: false, current: false },
      { completed: false, current: false },
    ]);
    expect(admissionTimeline("vip_claimed")).toEqual([
      { completed: true, current: false },
      { completed: true, current: false },
      { completed: false, current: true },
      { completed: false, current: false },
      { completed: false, current: false },
    ]);
    expect(admissionTimeline("kyc_failed")).toEqual([
      { completed: true, current: false },
      { completed: true, current: false },
      { completed: true, current: false },
      { completed: false, current: false },
      { completed: false, current: false },
    ]);
  });

  it("toggles a follow-up group closed when every matching case is already open", () => {
    expect([...toggleExpandedCaseIds(new Set(["pending-1", "pending-2", "kyc-1"]), ["pending-1", "pending-2"])]).toEqual(["kyc-1"]);
    expect([...toggleExpandedCaseIds(new Set(["pending-1"]), ["pending-1", "pending-2"])]).toEqual([
      "pending-1",
      "pending-2",
    ]);
  });

  it("shows only admission history events that have occurred", () => {
    expect(admissionCaseHistory({
      invitedAt: 1_000,
      claimedAt: 2_000,
      kycSubmittedAt: 3_000,
      kycApprovedAt: 4_000,
      kycExpiredAt: 5_000,
    })).toEqual([
      { label: "Invited", timestamp: 1_000, tone: "success" },
      { label: "Account Created", timestamp: 2_000, tone: "success" },
      { label: "KYC Submitted", timestamp: 3_000, tone: "success" },
      { label: "KYC Approved", timestamp: 4_000, tone: "success" },
      { label: "KYC expired", timestamp: 5_000, tone: "danger" },
    ]);
  });

  it("uses the canonical Host lifecycle labels for a completed admission", () => {
    expect(admissionCaseHistory({
      invitedAt: 1_000,
      claimedAt: 2_000,
      kycSubmittedAt: 3_000,
      kycApprovedAt: 4_000,
      approvalAt: 5_000,
    })).toEqual([
      { label: "Invited", timestamp: 1_000, tone: "success" },
      { label: "Account Created", timestamp: 2_000, tone: "success" },
      { label: "KYC Submitted", timestamp: 3_000, tone: "success" },
      { label: "KYC Approved", timestamp: 4_000, tone: "success" },
      { label: "Service Enabled", timestamp: 5_000, tone: "success" },
    ]);
  });

  it("sorts Host attention cases by most recent activity", () => {
    expect(sortByRecentAdmissionActivity([
      { id: "older", createdAt: 100, updatedAt: 150 },
      { id: "latest", createdAt: 200, updatedAt: 500 },
      { id: "fallback", invitedAt: 300 },
    ]).map((c) => c.id)).toEqual(["latest", "fallback", "older"]);
  });

  it("formats entry USD and detects a lapsed unclaimed invitation", () => {
    const helpers = admissionCase as typeof admissionCase & {
      formatUsdInput?: (raw: string) => string;
      invitationAttentionLabel?: (
        c: { status: string; invitedAt?: number | null; invitation?: { emailExpiresAt?: string | null } | null },
        nowSeconds: number,
      ) => string;
    };
    expect(helpers.formatUsdInput).toBeTypeOf("function");
    expect(helpers.formatUsdInput?.("12345.67")).toBe("12,345.67");
    expect(
      helpers.invitationAttentionLabel?.(
        { status: "invitation_open", invitation: { emailExpiresAt: new Date(1_000 * 1000).toISOString() } },
        2_000,
      ),
    ).toBe("Invitation Expired");
  });

  it("keeps expired invitation controls to resend or revoke", () => {
    const expired = {
      status: "invitation_open" as const,
      invitation: { emailExpiresAt: new Date(1_000 * 1000).toISOString() },
    };
    expect(invitationActionPolicy(expired, 2_000)).toEqual({
      canResend: true,
      canRemind: false,
      canQr: false,
      canRevoke: true,
    });
  });
});
