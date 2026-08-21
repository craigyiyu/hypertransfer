/**
 * leader-approval.ts — safe display helpers for the single-leader approval view.
 *
 * The leader sees a concise business dossier only: Host rationale, KYC
 * pass/valid-until, source classification outcome, intended asset/network/amount
 * and pre-check status. Raw identity documents, addresses, wallet identifiers,
 * provider responses and internal KYC reason codes are never part of the
 * leader view (the backend `LeaderCase` type simply does not carry them).
 */

import type { LeaderCase, LeaderIntendedPayment } from "@/lib/api";

/** KYC summary for the leader: passed status + valid-until label (no reason). */
export function leaderKycSummary(c: Pick<LeaderCase, "status" | "kycValidUntil">): {
  passed: boolean;
  validUntilLabel: string;
} {
  const passed = c.status === "leader_pending" || c.status === "service_enabled";
  if (!c.kycValidUntil) {
    return { passed, validUntilLabel: "—" };
  }
  return {
    passed,
    validUntilLabel: new Date(c.kycValidUntil * 1000).toLocaleDateString(),
  };
}

/** Intended-payment summary line for the leader (never the source identifier). */
export function leaderIntendedPaymentLabel(intent: LeaderIntendedPayment | null): string {
  if (!intent) return "Not yet provided";
  const amount = intent.intendedAmount ? `${intent.intendedAmount} ` : "";
  const source = intent.sourceType ? `${intent.sourceType} source` : "source not classified";
  const counterparty = intent.counterpartyName ? ` · ${intent.counterpartyName}` : "";
  return `${amount}${intent.asset} on ${intent.network} · ${source}${counterparty}`;
}

export type LeaderDecisionValue = "approved" | "rejected";

/** A rejection always requires a business reason. */
export function leaderReasonRequired(decision: LeaderDecisionValue): boolean {
  return decision === "rejected";
}

/** Approved/rejected action labels. */
export function leaderDecisionLabel(decision: LeaderDecisionValue): string {
  return decision === "approved" ? "Approve" : "Reject";
}
