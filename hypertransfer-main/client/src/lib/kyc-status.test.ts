/**
 * kyc-status.test.ts — case-aware KYC eligibility unit tests (Task 5).
 */
import { describe, expect, it } from "vitest";

import {
  getCaseAwareKYCEligibility,
  isKycCaseBlocked,
  isKycExpired,
  type CaseAwareKycState,
} from "@/lib/kyc-status";

const now = Math.floor(Date.now() / 1000);

function eligibility(state: CaseAwareKycState) {
  return getCaseAwareKYCEligibility(state);
}

describe("case-aware KYC eligibility", () => {
  it("allows deposits only for a passed and unexpired KYC", () => {
    expect(eligibility({ caseStatus: "kyc_passed", kycValidUntil: now + 86400 }).canDeposit).toBe(true);
    expect(eligibility({ caseStatus: "kyc_in_progress" }).canDeposit).toBe(false);
    expect(eligibility({ caseStatus: "kyc_failed" }).canDeposit).toBe(false);
    expect(eligibility({ caseStatus: "compliance_review" }).canDeposit).toBe(false);
    expect(eligibility({ caseStatus: undefined }).canDeposit).toBe(false);
  });

  it("blocks payment when the KYC is expired even if the status is passed", () => {
    const el = eligibility({ caseStatus: "kyc_passed", kycValidUntil: now - 60 });
    expect(el.canDeposit).toBe(false);
    expect(el.blockerMessage).toContain("expired");
    expect(el.canRetryKYC).toBe(true);
  });

  it("kyc_valid_until in the future keeps eligibility", () => {
    expect(isKycExpired(now + 10)).toBe(false);
  });

  it("isKycExpired uses nowSec parameter deterministically", () => {
    expect(isKycExpired(100, 200)).toBe(true);
    expect(isKycExpired(200, 200)).toBe(false);
    expect(isKycExpired(undefined)).toBe(false);
  });

  it("blocked terminal case statuses never allow deposits", () => {
    for (const status of ["kyc_failed", "compliance_review", "rejected", "expired", "revoked"] as const) {
      expect(isKycCaseBlocked(status)).toBe(true);
      expect(eligibility({ caseStatus: status }).canDeposit).toBe(false);
    }
    expect(isKycCaseBlocked("kyc_passed")).toBe(false);
    expect(isKycCaseBlocked(undefined)).toBe(false);
  });

  it("customer-facing messages never leak raw provider detail", () => {
    const messages = [
      eligibility({ caseStatus: "kyc_failed" }).blockerMessage || "",
      eligibility({ caseStatus: "compliance_review" }).blockerMessage || "",
      eligibility({ caseStatus: "kyc_in_progress" }).blockerMessage || "",
    ].join(" ");
    for (const leaked of ["passport", "#1234", "provider", "applicant", "webhook", "sanction"]) {
      expect(messages.toLowerCase()).not.toContain(leaked);
    }
  });
});
