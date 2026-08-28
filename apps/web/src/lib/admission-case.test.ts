/**
 * admission-case.test.ts — unit tests for the admission-case display helpers.
 */
import { describe, expect, it } from "vitest";

import {
  ADMISSION_STATUS_LABELS,
  admissionStatusTone,
  admissionTimeline,
  hostAdmissionPresentation,
  invitationActionPolicy,
  isTerminalAdmissionStatus,
  maskPatronEmail,
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

  it("projects detailed audit states into concise Host-facing statuses", () => {
    expect(hostAdmissionPresentation({ status: "kyc_expired", kycHostMessage: "Document expired" }))
      .toMatchObject({
        primaryStatus: "KYC Action Required",
        reason: "Document expired",
        actor: "VIP",
      });
    expect(hostAdmissionPresentation({ status: "compliance_review" }))
      .toMatchObject({
        primaryStatus: "KYC Review",
        reason: "Under compliance review",
        actor: "Compliance",
      });
    expect(hostAdmissionPresentation({ status: "leader_pending" }))
      .toMatchObject({ primaryStatus: "Pending Approval", actor: "Approver" });
    expect(hostAdmissionPresentation({ status: "rejected" }))
      .toMatchObject({ primaryStatus: "Archived", reason: "Service rejected" });
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
