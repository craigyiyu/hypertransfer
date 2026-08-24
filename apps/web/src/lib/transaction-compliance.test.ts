/**
 * transaction-compliance.test.ts — unit tests for the per-transfer compliance
 * pack helpers (Task 7).
 */
import { describe, expect, it } from "vitest";

import {
  HKD_TRAVEL_RULE_THRESHOLD,
  depthExplanation,
  paymentChangeRequiresRevalidation,
  transferLegLabel,
  travelRuleDepthForHkd,
  travelRuleDepthLabel,
  type PaymentFingerprint,
} from "@/lib/transaction-compliance";

function fp(overrides: Partial<PaymentFingerprint> = {}): PaymentFingerprint {
  return {
    asset: "USDT",
    network: "tron",
    actualAmount: "10000",
    sourceType: "wallet",
    sourceIdentifier: "T-wallet-1",
    ...overrides,
  };
}

describe("travel rule depth", () => {
  it("below HKD 8,000 is basic, never not_required", () => {
    expect(travelRuleDepthForHkd(7999.99)).toBe("basic");
    expect(travelRuleDepthForHkd(8)).toBe("basic"); // 1-unit verification transfer
  });

  it("at or above HKD 8,000 is enhanced", () => {
    expect(travelRuleDepthForHkd(HKD_TRAVEL_RULE_THRESHOLD)).toBe("enhanced");
    expect(travelRuleDepthForHkd(80000)).toBe("enhanced");
  });

  it("labels and explains the depth", () => {
    expect(travelRuleDepthLabel("basic")).toBe("Basic");
    expect(travelRuleDepthLabel("enhanced")).toBe("Enhanced");
    expect(depthExplanation("basic", 7999).toLowerCase()).toContain("basic");
    expect(depthExplanation("enhanced", 8001)).toContain("Enhanced");
    expect(depthExplanation("enhanced", 8001)).not.toContain("not required");
  });
});

describe("payment fingerprint re-validation", () => {
  it("identical fingerprints do not require re-validation", () => {
    const a = fp();
    const b = fp();
    expect(paymentChangeRequiresRevalidation(a, b)).toBe(false);
  });

  it("changed amount requires re-validation", () => {
    expect(
      paymentChangeRequiresRevalidation(fp({ actualAmount: "7999" }), fp({ actualAmount: "8001" })),
    ).toBe(true);
  });

  it("changed source wallet requires re-validation", () => {
    expect(
      paymentChangeRequiresRevalidation(fp(), fp({ sourceIdentifier: "T-wallet-2" })),
    ).toBe(true);
  });

  it("changed asset / network / source type require re-validation", () => {
    expect(paymentChangeRequiresRevalidation(fp(), fp({ asset: "USDC" }))).toBe(true);
    expect(paymentChangeRequiresRevalidation(fp(), fp({ network: "ethereum" }))).toBe(true);
    expect(paymentChangeRequiresRevalidation(fp(), fp({ sourceType: "vasp" }))).toBe(true);
  });

  it("transfer leg labels distinguish verification and main", () => {
    expect(transferLegLabel("verification")).toContain("Verification");
    expect(transferLegLabel("main")).toContain("Main");
  });
});
