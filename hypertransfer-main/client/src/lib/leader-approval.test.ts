/**
 * leader-approval.test.ts — unit tests for the leader approval view helpers.
 */
import { describe, expect, it } from "vitest";

import {
  leaderDecisionLabel,
  leaderIntendedPaymentLabel,
  leaderKycSummary,
  leaderReasonRequired,
  type LeaderCase,
  type LeaderIntendedPayment,
} from "@/lib/leader-approval";

function leaderCase(overrides: Partial<LeaderCase> = {}): LeaderCase {
  return {
    id: "case-1",
    hostName: "Host A",
    patronEmailMasked: "v***@example.test",
    servicePurpose: "VIP table credit",
    route: "complete_dossier",
    status: "leader_pending",
    kycValidUntil: 1_800_000_000,
    intendedPayment: null,
    ...overrides,
  };
}

describe("leader approval helpers", () => {
  it("summarises KYC pass and valid-until without any reason", () => {
    const summary = leaderKycSummary(leaderCase({ status: "leader_pending", kycValidUntil: 1_800_000_000 }));
    expect(summary.passed).toBe(true);
    expect(summary.validUntilLabel).toBeTruthy();
    const notPassed = leaderKycSummary(leaderCase({ status: "kyc_failed", kycValidUntil: null }));
    expect(notPassed.passed).toBe(false);
  });

  it("renders the intended-payment label without the source identifier", () => {
    const intent: LeaderIntendedPayment = {
      asset: "USDT",
      network: "tron",
      intendedAmount: "5000",
      sourceType: "wallet",
      counterpartyName: "",
      status: "precheck_passed",
    };
    const label = leaderIntendedPaymentLabel(intent);
    expect(label).toContain("5000 USDT on tron");
    expect(label).toContain("wallet source");
    // 绝不渲染钱包地址(类型里也没有 sourceIdentifier)。
    expect(label).not.toMatch(/T[A-Za-z0-9]{20,}/);
  });

  it("handles an absent intended payment", () => {
    expect(leaderIntendedPaymentLabel(null)).toBe("Not yet provided");
  });

  it("requires a business reason only for rejection", () => {
    expect(leaderReasonRequired("rejected")).toBe(true);
    expect(leaderReasonRequired("approved")).toBe(false);
    expect(leaderDecisionLabel("approved")).toBe("Approve");
    expect(leaderDecisionLabel("rejected")).toBe("Reject");
  });

  it("leader view never exposes host notes, emails or KYC reason codes", () => {
    const dumped = JSON.stringify(leaderCase());
    for (const leaked of ["hostNotes", "kycReasonCode", "vip@example.test", "passport", "wallet address"]) {
      expect(dumped).not.toContain(leaked);
    }
  });
});
