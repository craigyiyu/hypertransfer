/**
 * transaction-compliance.ts — typed UI helpers for per-transfer compliance packs.
 *
 * Every transfer leg (verification / main) gets its own immutable
 * Transaction Travel Rule Pack. HKD 8,000 switches basic vs enhanced field
 * depth; it never makes Travel Rule optional. A changed final amount or
 * payment source invalidates the matching pre-check and forces re-validation
 * before address issuance.
 */

export type TransferLeg = "verification" | "main";
export type TravelRuleDepth = "basic" | "enhanced";

export const HKD_TRAVEL_RULE_THRESHOLD = 8000;

export interface PaymentFingerprint {
  asset: "USDT" | "USDC";
  network: "ethereum" | "tron";
  actualAmount: string;
  sourceType: "wallet" | "vasp";
  sourceIdentifier: string;
  counterpartyId?: string;
}

/** HKD 8,000 switches field depth; a low-value transfer is still "basic". */
export function travelRuleDepthForHkd(actualHkdAmount: number): TravelRuleDepth {
  return actualHkdAmount >= HKD_TRAVEL_RULE_THRESHOLD ? "enhanced" : "basic";
}

export function travelRuleDepthLabel(depth: TravelRuleDepth): string {
  return depth === "enhanced" ? "Enhanced" : "Basic";
}

/** Any fingerprint change (amount crossing included) invalidates the pre-check. */
export function paymentChangeRequiresRevalidation(
  before: PaymentFingerprint,
  after: PaymentFingerprint,
): boolean {
  return (
    before.asset !== after.asset ||
    before.network !== after.network ||
    before.actualAmount !== after.actualAmount ||
    before.sourceType !== after.sourceType ||
    before.sourceIdentifier !== after.sourceIdentifier ||
    (before.counterpartyId ?? "") !== (after.counterpartyId ?? "")
  );
}

export const TRANSFER_LEG_LABELS: Record<TransferLeg, string> = {
  verification: "Verification transfer (1 USDT / 1 USDC)",
  main: "Main transfer",
};

export function transferLegLabel(leg: TransferLeg): string {
  return TRANSFER_LEG_LABELS[leg];
}

/** Human explanation of why the exact final amount decides the field set. */
export function depthExplanation(depth: TravelRuleDepth, actualHkdAmount: number): string {
  const label = travelRuleDepthLabel(depth);
  if (depth === "enhanced") {
    return `This transfer is HKD ${actualHkdAmount.toLocaleString()} (at or above HKD ${HKD_TRAVEL_RULE_THRESHOLD.toLocaleString()}), so ${label} Travel Rule fields apply.`;
  }
  return `This transfer is below HKD ${HKD_TRAVEL_RULE_THRESHOLD.toLocaleString()}, so ${label} Travel Rule fields apply. Travel Rule is still required for every transfer.`;
}
