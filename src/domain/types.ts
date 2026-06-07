export type KycStatus = "verified" | "enhanced_due_diligence" | "blocked" | "expired" | "missing";

export type DepositStatus =
  | "draft"
  | "wallet_screening"
  | "screening_passed"
  | "edd_required"
  | "blocked"
  | "travel_rule_pending"
  | "address_issued"
  | "monitoring"
  | "funds_dirty"
  | "settled"
  | "exception";

export type ScreeningDecision = "pass" | "edd" | "fail";

export type TravelRuleStatus = "not_required" | "pending" | "submitted" | "rejected";

export type ComplianceCaseStatus = "open" | "approved" | "rejected" | "closed";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type Customer = {
  id: string;
  name: string;
  tier: "premium" | "vip" | "mass";
  jurisdiction: string;
  kycStatus: KycStatus;
  externalId: string;
  riskFlags: string[];
};

export type WalletScreening = {
  id: string;
  depositId: string;
  walletAddress: string;
  network: string;
  score: number;
  level: RiskLevel;
  sanctionedHit: boolean;
  hopCount: number;
  taintedExposurePercent: number;
  decision: ScreeningDecision;
  summary: string;
};

export type TravelRuleSubmission = {
  id: string;
  depositId: string;
  status: TravelRuleStatus;
  originatorName: string;
  beneficiaryName: string;
  beneficiaryVasp: string;
  required: boolean;
  submittedAt?: string;
};

export type DepositAddress = {
  id: string;
  depositId: string;
  address: string;
  provider: string;
  expiresAt: string;
  voided: boolean;
};

export type DepositRequest = {
  id: string;
  customerId: string;
  hostName: string;
  asset: "USDT" | "USDC" | "BTC" | "ETH";
  network: "TRON" | "Ethereum" | "Bitcoin";
  amount: number;
  walletAddress: string;
  status: DepositStatus;
  createdAt: string;
  updatedAt: string;
  screening?: WalletScreening;
  travelRule?: TravelRuleSubmission;
  depositAddress?: DepositAddress;
};

export type ComplianceCase = {
  id: string;
  depositId: string;
  customerId: string;
  reason: string;
  status: ComplianceCaseStatus;
  priority: "normal" | "high" | "urgent";
  openedAt: string;
  closedAt?: string;
  reviewer?: string;
};

export type TransactionScreening = {
  id: string;
  depositId: string;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  asset: string;
  riskScore: number;
  sanctionedHit: boolean;
  taintedExposurePercent: number;
  decision: "clear" | "dirty";
  reason: string;
  screenedAt: string;
};

export type PayoutStatus = "pending_review" | "screening" | "approved" | "rejected" | "broadcasted" | "completed";

export type PayoutRequest = {
  id: string;
  customerId: string;
  initiatedBy: string;
  asset: "USDT" | "USDC" | "BTC" | "ETH";
  network: "TRON" | "Ethereum" | "Bitcoin";
  amount: number;
  destinationWallet: string;
  status: PayoutStatus;
  screeningDecision?: ScreeningDecision;
  approvedBy?: string;
  txHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type WtaVault = {
  id: string;
  name: string;
  asset: "USDT" | "USDC";
  network: "TRON" | "Ethereum";
  balance: number;
  pendingSettlement: number;
  lastSettledAt: string;
  /** 对应 Hex Safe API vaultId，正式接入时替换 mock 值 */
  hexSafeVaultId: string;
};

export type AuditLog = {
  id: string;
  actor: string;
  action: string;
  entityType: "Customer" | "DepositRequest" | "WalletScreening" | "TravelRuleSubmission" | "ComplianceCase" | "PayoutRequest" | "WtaVault";
  entityId: string;
  timestamp: string;
  metadata: string;
};
