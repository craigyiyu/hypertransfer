/**
 * admission-journey.test.ts — VIP 旅程单元测试(B1)。
 */
import { describe, expect, it } from "vitest";

import type { CasePaymentView } from "@/lib/api";
import {
  ADMISSION_JOURNEY_STEPS,
  admissionJourney,
  settlementJourney,
} from "@/lib/admission-journey";

describe("admission journey", () => {
  it("covers all eight admission milestones in order", () => {
    expect(ADMISSION_JOURNEY_STEPS.map((s) => s.key)).toEqual([
      "draft", "invitation_open", "vip_claimed", "kyc_in_progress",
      "kyc_passed", "payment_precheck", "leader_pending", "service_enabled",
    ]);
  });

  it("computes progress and customer-safe next actions per status", () => {
    expect(admissionJourney("draft").doneCount).toBe(0);
    expect(admissionJourney("vip_claimed").doneCount).toBe(2);
    expect(admissionJourney("leader_pending").doneCount).toBe(6);
    expect(admissionJourney("leader_pending").nextAction).toContain("approver");
    expect(admissionJourney("kyc_failed").nextAction).toContain("resubmit");
    expect(admissionJourney("compliance_review").nextAction).toContain("review");
    expect(admissionJourney("rejected").nextAction).toContain("Host");
  });

  it("never leaks internal reasons to the customer", () => {
    const actions = [
      admissionJourney("kyc_failed").nextAction,
      admissionJourney("compliance_review").nextAction,
      admissionJourney("rejected").nextAction,
    ].join(" ");
    for (const leaked of ["passport", "provider", "sanction", "webhook", "reason code"]) {
      expect(actions.toLowerCase()).not.toContain(leaked);
    }
  });
});

describe("settlement journey", () => {
  function pack(leg: "verification" | "main", over: Partial<CasePaymentView> = {}): CasePaymentView {
    return {
      packId: "p",
      transferLeg: leg,
      actualAmount: "1",
      actualHkdAmount: "8",
      travelRuleDepth: "basic",
      kytStatus: "pass",
      travelRuleStatus: "accepted",
      notabeneReference: "",
      custodyAddress: "",
      txHash: "",
      cageConfirmationId: "",
      reconciliationRef: "",
      reconciledAt: null,
      finalizedAt: null,
      ...over,
    };
  }

  it("all pending when no transfers", () => {
    const j = settlementJourney([]);
    expect(j.doneCount).toBe(0);
    expect(j.done).toEqual({ verification: false, main: false, cage: false, reconciled: false });
  });

  it("verification received advances the first step", () => {
    const j = settlementJourney([pack("verification", { finalizedAt: 1_800_000_000 })]);
    expect(j.done.verification).toBe(true);
    expect(j.done.main).toBe(false);
    expect(j.doneCount).toBe(1);
  });

  it("cage and reconciliation are derived from the main pack", () => {
    const j = settlementJourney([
      pack("verification", { finalizedAt: 1 }),
      pack("main", { finalizedAt: 1, cageConfirmationId: "CAGE-1", reconciliationRef: "FIN-1" }),
    ]);
    expect(j.done).toEqual({ verification: true, main: true, cage: true, reconciled: true });
    expect(j.doneCount).toBe(4);
  });
});
