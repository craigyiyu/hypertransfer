/**
 * admission-journey.ts — VIP 端统一准入/结算旅程(2026-08 feedback, B1)。
 *
 * 把分散的状态展示收敛成一条可引导的 journey:
 *  - 准入阶段: Created → Invited → Claimed → KYC → KYC passed → Pre-check
 *    → Approver → Enabled
 *  - 服务启用后的结算阶段: Verification → Main → Cage → Reconciled(由 payments 推导)
 * 每个状态给出客户安全的"下一步"文案。
 */

import type { AdmissionCaseStatus } from "@/lib/admission-case";
import type { CasePaymentView } from "@/lib/api";

export interface JourneyStep {
  key: string;
  label: string;
}

export const ADMISSION_JOURNEY_STEPS: JourneyStep[] = [
  { key: "draft", label: "Created" },
  { key: "invitation_open", label: "Invited" },
  { key: "vip_claimed", label: "Claimed" },
  { key: "kyc_in_progress", label: "KYC" },
  { key: "kyc_passed", label: "KYC passed" },
  { key: "payment_precheck", label: "Pre-check" },
  { key: "leader_pending", label: "Approver" },
  { key: "service_enabled", label: "Enabled" },
];

const NEXT_ACTION: Record<string, string> = {
  draft: "Your Host is preparing your invitation.",
  invitation_open: "Check your email and claim your invitation with the code we sent to you.",
  vip_claimed: "Complete identity verification to continue.",
  kyc_in_progress: "Your verification is being reviewed — it usually completes in under a minute.",
  kyc_passed: "Your identity verification passed. Your admission is being prepared.",
  payment_precheck: "Your payment details are being pre-checked before approval.",
  leader_pending: "Your admission is with the approver. We will notify you of the decision.",
  service_enabled: "Your service is enabled. You can now start your first deposit.",
  kyc_failed: "Your identity verification was not approved — please resubmit your documents.",
  kyc_expired: "Your KYC document has expired — please resubmit your documents.",
  compliance_review: "Your admission is under compliance review. We will contact you if more information is needed.",
  rejected: "Your admission was not approved at this time. Please contact your Host.",
  expired: "Your invitation has expired. Please ask your Host to send a new one.",
  revoked: "Your invitation was revoked. Please contact your Host.",
};

export function admissionJourney(status: AdmissionCaseStatus): {
  steps: JourneyStep[];
  currentIndex: number;
  doneCount: number;
  nextAction: string;
} {
  const order = ADMISSION_JOURNEY_STEPS.map((s) => s.key);
  const idx = order.indexOf(status);
  const currentIndex = idx >= 0 ? idx : order.length - 1;
  return {
    steps: ADMISSION_JOURNEY_STEPS,
    currentIndex,
    doneCount: idx >= 0 ? idx : 0,
    nextAction: NEXT_ACTION[status] ?? NEXT_ACTION["rejected"] ?? "",
  };
}

export const SETTLEMENT_JOURNEY_STEPS: JourneyStep[] = [
  { key: "verification", label: "Verification" },
  { key: "main", label: "Main transfer" },
  { key: "cage", label: "Cage" },
  { key: "reconciled", label: "Reconciled" },
];

export function settlementJourney(payments: CasePaymentView[]): {
  steps: JourneyStep[];
  done: Record<string, boolean>;
  doneCount: number;
} {
  const verificationDone = payments.some(
    (p) => p.transferLeg === "verification" && Boolean(p.finalizedAt),
  );
  const mainDone = payments.some((p) => p.transferLeg === "main" && Boolean(p.finalizedAt));
  const cageDone = payments.some((p) => Boolean(p.cageConfirmationId));
  const reconciledDone = payments.some((p) => Boolean(p.reconciliationRef));
  const done = { verification: verificationDone, main: mainDone, cage: cageDone, reconciled: reconciledDone };
  return {
    steps: SETTLEMENT_JOURNEY_STEPS,
    done,
    doneCount: Object.values(done).filter(Boolean).length,
  };
}
