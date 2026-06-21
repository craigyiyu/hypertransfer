import { getRequiredConfirmations, isPhaseOneNetwork, isSupportedPhaseOneAsset } from "@/lib/compliance";

export type RefundReason =
  | "customer_cancelled"
  | "overpayment"
  | "underpayment_declined"
  | "failed_kyc"
  | "failed_travel_rule"
  | "source_wallet_mismatch"
  | "duplicate_payment"
  | "deposit_expired"
  | "operational_error";

export type RefundStatus =
  | "requested"
  | "address_required"
  | "address_submitted"
  | "destination_kyt_pending"
  | "destination_kyt_passed"
  | "manual_review"
  | "approval_pending"
  | "approved"
  | "signing"
  | "broadcasted"
  | "completed"
  | "failed"
  | "rejected"
  | "cancelled"
  | "expired";

export interface RefundKytResult {
  provider: "Mock KYT adapter";
  decision: "pass" | "manual_review" | "reject";
  riskScore: number;
  reference: string;
  screenedAt: string;
  note: string;
}

export interface RefundApproval {
  status: "not_started" | "pending" | "approved" | "rejected";
  requiredRole: string;
  approvers: string[];
  approvedAt?: string;
}

export interface RefundPayout {
  provider: "Hex Safe custody adapter";
  status: "not_started" | "signing" | "broadcasted" | "completed" | "failed";
  transferId?: string;
  txHash?: string;
  confirmations: number;
  requiredConfirmations: number;
  completedAt?: string;
}

export interface RefundRequest {
  id: string;
  originalDepositSessionId: string;
  originalTxHash: string;
  asset: "USDT" | "USDC";
  network: string;
  amount: number;
  reason: RefundReason;
  status: RefundStatus;
  destinationAddress: string;
  customerAttestation: boolean;
  requestedAt: string;
  updatedAt: string;
  expiresAt: string;
  kytResult: RefundKytResult | null;
  approval: RefundApproval;
  payout: RefundPayout;
  auditTrail: string[];
}

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  customer_cancelled: "Customer cancelled deposit",
  overpayment: "Overpayment",
  underpayment_declined: "Underpayment declined",
  failed_kyc: "KYC not approved",
  failed_travel_rule: "Travel Rule not accepted",
  source_wallet_mismatch: "Source-wallet mismatch",
  duplicate_payment: "Duplicate payment",
  deposit_expired: "Expired deposit session",
  operational_error: "Operational error",
};

export const REFUND_PROCESS_STEPS = [
  {
    title: "Customer request",
    detail: "Customer or support opens a refund case against a completed deposit.",
  },
  {
    title: "Refund address collection",
    detail: "Customer confirms the refund destination through an authenticated one-time flow.",
  },
  {
    title: "Destination wallet KYT",
    detail: "HyperTransfer screens the refund wallet before any payout approval.",
  },
  {
    title: "Treasury approval",
    detail: "Casino treasury/compliance approves amount, reason, evidence, and policy match.",
  },
  {
    title: "Hex Safe payout",
    detail: "Custody adapter submits, signs, broadcasts, and tracks the refund transfer.",
  },
] as const;

export function createRefundRequest(input: {
  originalDepositSessionId: string;
  originalTxHash: string;
  asset: string;
  network: string;
  amount: number;
  reason: RefundReason;
}): RefundRequest {
  if (!isSupportedPhaseOneAsset(input.asset) || !isPhaseOneNetwork(input.asset, input.network)) {
    throw new Error("Refunds are limited to supported Phase 1 stablecoin assets and networks.");
  }

  const now = new Date();
  const id = `RF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Date.now()
    .toString(36)
    .toUpperCase()}`;

  return {
    id,
    originalDepositSessionId: input.originalDepositSessionId,
    originalTxHash: input.originalTxHash,
    asset: input.asset,
    network: input.network,
    amount: input.amount,
    reason: input.reason,
    status: "address_required",
    destinationAddress: "",
    customerAttestation: false,
    requestedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    kytResult: null,
    approval: {
      status: "not_started",
      requiredRole: "Treasury Approver + Compliance Checker",
      approvers: [],
    },
    payout: {
      provider: "Hex Safe custody adapter",
      status: "not_started",
      confirmations: 0,
      requiredConfirmations: getRequiredConfirmations(input.network),
    },
    auditTrail: [
      "Refund request created against original deposit record",
      "Refund destination must be customer-confirmed before payout approval",
      "Original asset and network are preserved unless treasury approves an exception",
    ],
  };
}

export function validateRefundDestination(address: string, network: string) {
  if (!address.trim()) {
    return { valid: false, error: "Refund wallet address is required." };
  }

  if (network === "tron") {
    const valid = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim());
    return valid
      ? { valid: true }
      : { valid: false, error: "Enter a valid TRC-20 address beginning with T." };
  }

  if (network === "ethereum") {
    const valid = /^0x[a-fA-F0-9]{40}$/.test(address.trim());
    return valid
      ? { valid: true }
      : { valid: false, error: "Enter a valid ERC-20 address beginning with 0x." };
  }

  return { valid: false, error: "Unsupported refund network." };
}

export function screenRefundDestination(address: string): RefundKytResult {
  const normalized = address.toLowerCase();
  const screenedAt = new Date().toISOString();

  // MOCK: deterministic rules let the demo exercise pass, manual review, and reject states.
  if (normalized.includes("bad") || normalized.endsWith("0000")) {
    return {
      provider: "Mock KYT adapter",
      decision: "reject",
      riskScore: 91,
      reference: `KYT-RF-${Date.now().toString(36).toUpperCase()}`,
      screenedAt,
      note: "Destination wallet matched a high-risk demo pattern.",
    };
  }

  if (normalized.includes("review") || normalized.endsWith("ffff")) {
    return {
      provider: "Mock KYT adapter",
      decision: "manual_review",
      riskScore: 63,
      reference: `KYT-RF-${Date.now().toString(36).toUpperCase()}`,
      screenedAt,
      note: "Destination wallet requires manual compliance review before payout.",
    };
  }

  return {
    provider: "Mock KYT adapter",
    decision: "pass",
    riskScore: 12,
    reference: `KYT-RF-${Date.now().toString(36).toUpperCase()}`,
    screenedAt,
    note: "Destination wallet passed sanctions, exposure, and typology checks.",
  };
}

export function submitRefundDestination(
  request: RefundRequest,
  destinationAddress: string,
): RefundRequest {
  const validation = validateRefundDestination(destinationAddress, request.network);
  const updatedAt = new Date().toISOString();

  if (!validation.valid) {
    return {
      ...request,
      status: "manual_review",
      updatedAt,
      auditTrail: [...request.auditTrail, validation.error || "Refund address validation failed"],
    };
  }

  const kytResult = screenRefundDestination(destinationAddress.trim());
  const status: RefundStatus =
    kytResult.decision === "pass"
      ? "destination_kyt_passed"
      : kytResult.decision === "manual_review"
      ? "manual_review"
      : "rejected";

  return {
    ...request,
    status,
    destinationAddress: destinationAddress.trim(),
    customerAttestation: true,
    kytResult,
    updatedAt,
    auditTrail: [
      ...request.auditTrail,
      "Customer submitted a refund destination through the authenticated flow",
      `${kytResult.provider} returned ${kytResult.decision} (${kytResult.reference})`,
    ],
  };
}

export function submitRefundForApproval(request: RefundRequest): RefundRequest {
  const updatedAt = new Date().toISOString();
  return {
    ...request,
    status: "approval_pending",
    updatedAt,
    approval: {
      ...request.approval,
      status: "pending",
    },
    auditTrail: [...request.auditTrail, "Refund submitted for treasury and compliance approval"],
  };
}

export function approveRefundRequest(
  request: RefundRequest,
  approver = "Treasury Approver",
): RefundRequest {
  const updatedAt = new Date().toISOString();
  return {
    ...request,
    status: "approved",
    updatedAt,
    approval: {
      ...request.approval,
      status: "approved",
      approvers: [...request.approval.approvers, approver],
      approvedAt: updatedAt,
    },
    auditTrail: [...request.auditTrail, `${approver} approved refund payout`],
  };
}

export function broadcastRefundPayout(request: RefundRequest): RefundRequest {
  const updatedAt = new Date().toISOString();
  const hashChars = "0123456789abcdef";
  const txHash = `0x${Array.from({ length: 64 }, () => hashChars[Math.floor(Math.random() * hashChars.length)]).join("")}`;
  const transferId = `HS-RF-${Date.now().toString(36).toUpperCase()}`;

  return {
    ...request,
    status: "completed",
    updatedAt,
    payout: {
      ...request.payout,
      status: "completed",
      transferId,
      txHash,
      confirmations: request.payout.requiredConfirmations,
      completedAt: updatedAt,
    },
    auditTrail: [
      ...request.auditTrail,
      `Hex Safe custody adapter created transfer ${transferId}`,
      `Refund broadcast and completed with txHash ${txHash}`,
    ],
  };
}

export function formatRefundStatus(status: RefundStatus) {
  return status.replaceAll("_", " ");
}
