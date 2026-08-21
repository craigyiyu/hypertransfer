/**
 * admission-case.test.ts — unit tests for the admission-case display helpers.
 */
import { describe, expect, it } from "vitest";

import {
  ADMISSION_STATUS_LABELS,
  admissionStatusTone,
  isTerminalAdmissionStatus,
  maskPatronEmail,
  type AdmissionCaseStatus,
} from "@/lib/admission-case";

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
});
