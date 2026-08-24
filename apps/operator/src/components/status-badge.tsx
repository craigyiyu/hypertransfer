import { kycStatusLabel } from "@/src/domain/state-machine";
import type { ComplianceCaseStatus, DepositStatus, KycStatus, RiskLevel } from "@/src/domain/types";

type BadgeTone = "success" | "warning" | "danger" | "neutral";

function depositTone(status: DepositStatus): BadgeTone {
  if (status === "blocked" || status === "exception" || status === "funds_dirty") {
    return "danger";
  }

  if (status === "edd_required" || status === "travel_rule_pending" || status === "monitoring") {
    return "warning";
  }

  if (status === "settled" || status === "address_issued" || status === "screening_passed") {
    return "success";
  }

  return "neutral";
}

function kycTone(status: KycStatus): BadgeTone {
  if (status === "blocked") return "danger";
  if (status === "enhanced_due_diligence" || status === "expired" || status === "missing") return "warning";
  if (status === "verified") return "success";
  return "neutral";
}

function riskTone(level: RiskLevel): BadgeTone {
  return {
    low: "success",
    medium: "warning",
    high: "danger",
    critical: "danger",
  }[level] as BadgeTone;
}

function caseTone(status: ComplianceCaseStatus): BadgeTone {
  return {
    open: "warning",
    approved: "success",
    rejected: "danger",
    closed: "neutral",
  }[status] as BadgeTone;
}

function toneClass(tone: BadgeTone): string {
  return tone === "neutral" ? "badge" : `badge ${tone}`;
}

export function DepositStatusBadge({ status, label }: { status: DepositStatus; label: string }) {
  return <span className={toneClass(depositTone(status))}>{label}</span>;
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={toneClass(riskTone(level))}>{level.toUpperCase()}</span>;
}

export function CaseStatusBadge({ status }: { status: ComplianceCaseStatus }) {
  return <span className={toneClass(caseTone(status))}>{status.toUpperCase()}</span>;
}

export function KycStatusBadge({ status }: { status: KycStatus }) {
  return <span className={toneClass(kycTone(status))}>{kycStatusLabel(status)}</span>;
}
