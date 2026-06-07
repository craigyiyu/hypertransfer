import type {
  ComplianceCase,
  DepositRequest,
  DepositStatus,
  KycStatus,
  TransactionScreening,
  TravelRuleSubmission,
  WalletScreening,
} from "./types";

export function statusLabel(status: DepositStatus): string {
  return {
    draft: "Draft",
    wallet_screening: "Wallet Screening",
    screening_passed: "Screening Passed",
    edd_required: "EDD Required",
    blocked: "Blocked",
    travel_rule_pending: "Travel Rule Pending",
    address_issued: "Address Issued",
    monitoring: "Monitoring",
    funds_dirty: "Funds Dirty",
    settled: "Settled",
    exception: "Exception",
  }[status];
}

export function kycStatusLabel(status: KycStatus): string {
  return {
    verified: "Verified",
    enhanced_due_diligence: "EDD Required",
    blocked: "Blocked",
    expired: "KYC Expired",
    missing: "KYC Missing",
  }[status];
}

export function applyScreening(
  screening: WalletScreening,
): Pick<DepositRequest, "status" | "screening"> {
  if (screening.decision === "fail") {
    return { status: "blocked", screening };
  }

  if (screening.decision === "edd") {
    return { status: "edd_required", screening };
  }

  return { status: "travel_rule_pending", screening };
}

export function requiresTravelRule(deposit: DepositRequest): boolean {
  return deposit.amount >= 8000 || deposit.asset === "BTC" || deposit.asset === "ETH";
}

export function canIssueAddress(deposit: DepositRequest): boolean {
  return deposit.status === "travel_rule_pending" && deposit.travelRule?.status === "submitted";
}

export function createTravelRuleDraft(deposit: DepositRequest): TravelRuleSubmission {
  return {
    id: `tr-${deposit.id}`,
    depositId: deposit.id,
    status: "pending",
    originatorName: "",
    beneficiaryName: "",
    beneficiaryVasp: "Wynn Virtual Asset Desk",
    required: requiresTravelRule(deposit),
  };
}

export function applyTransactionKyt(
  _deposit: DepositRequest,
  screening: TransactionScreening,
): Pick<DepositRequest, "status"> {
  return { status: screening.decision === "dirty" ? "funds_dirty" : "settled" };
}

export function createComplianceCase(deposit: DepositRequest): ComplianceCase | undefined {
  if (deposit.status !== "blocked" && deposit.status !== "edd_required" && deposit.status !== "funds_dirty") {
    return undefined;
  }

  const isBlocked = deposit.status === "blocked";
  const isDirty = deposit.status === "funds_dirty";

  const reason = isBlocked
    ? "Wallet screening failed"
    : isDirty
      ? "Incoming funds flagged as dirty by transaction KYT"
      : "Enhanced due diligence required";

  return {
    id: `case-${deposit.id}`,
    depositId: deposit.id,
    customerId: deposit.customerId,
    reason,
    status: "open",
    priority: isBlocked || isDirty ? "urgent" : "high",
    openedAt: deposit.updatedAt,
  };
}
