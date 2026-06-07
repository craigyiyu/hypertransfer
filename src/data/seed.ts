import {
  mockAddressProvider,
  mockScreeningProvider,
  mockTravelRuleProvider,
} from "@/src/domain/providers";
import {
  applyScreening,
  createComplianceCase,
  createTravelRuleDraft,
} from "@/src/domain/state-machine";
import type {
  AuditLog,
  ComplianceCase,
  Customer,
  DepositRequest,
  PayoutRequest,
  TravelRuleSubmission,
  WtaVault,
} from "@/src/domain/types";

export const customers: Customer[] = [
  {
    id: "cust-1001",
    name: "Avery Chen",
    tier: "vip",
    jurisdiction: "HK",
    kycStatus: "verified",
    externalId: "WYN-HK-88421",
    riskFlags: [],
  },
  {
    id: "cust-1002",
    name: "Morgan Lee",
    tier: "premium",
    jurisdiction: "SG",
    kycStatus: "enhanced_due_diligence",
    externalId: "WYN-SG-77108",
    riskFlags: ["PEP proximity"],
  },
  {
    id: "cust-1003",
    name: "Taylor Wong",
    tier: "vip",
    jurisdiction: "MO",
    kycStatus: "blocked",
    externalId: "WYN-MO-55270",
    riskFlags: ["Sanctions screening hit"],
  },
  {
    id: "cust-1004",
    name: "Jordan Fang",
    tier: "mass",
    jurisdiction: "HK",
    kycStatus: "expired",
    externalId: "WYN-HK-61032",
    riskFlags: ["KYC expired 2025-11"],
  },
  {
    id: "cust-1005",
    name: "Riley Kwok",
    tier: "premium",
    jurisdiction: "MO",
    kycStatus: "missing",
    externalId: "WYN-MO-39917",
    riskFlags: [],
  },
];

const now = new Date("2026-05-11T06:30:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function buildDeposit(input: Omit<DepositRequest, "updatedAt">): DepositRequest {
  return {
    ...input,
    updatedAt: input.createdAt,
  };
}

const lowRiskDraft = buildDeposit({
  id: "dep-2001",
  customerId: "cust-1001",
  hostName: "Iris Lau",
  asset: "USDT",
  network: "TRON",
  amount: 5000,
  walletAddress: "TLowRiskDemoWalletPass001",
  status: "wallet_screening",
  createdAt: minutesAgo(50),
});

const lowRiskScreening = mockScreeningProvider.screenWallet(lowRiskDraft);
const lowRiskTravelRule = mockTravelRuleProvider.submitTravelRule(lowRiskDraft, {
  ...createTravelRuleDraft(lowRiskDraft),
  originatorName: "Avery Chen",
  beneficiaryName: "Wynn Macau Treasury",
});

const eddDraft = buildDeposit({
  id: "dep-2002",
  customerId: "cust-1002",
  hostName: "Noah Ho",
  asset: "USDC",
  network: "Ethereum",
  amount: 12000,
  walletAddress: "0xNeedsEddReviewWallet002",
  status: "wallet_screening",
  createdAt: minutesAgo(35),
});

const eddScreening = mockScreeningProvider.screenWallet(eddDraft);

const blockedDraft = buildDeposit({
  id: "dep-2003",
  customerId: "cust-1003",
  hostName: "Mia Chan",
  asset: "BTC",
  network: "Bitcoin",
  amount: 1.8,
  walletAddress: "bc1qSanctionFailWallet003",
  status: "wallet_screening",
  createdAt: minutesAgo(20),
});

const blockedScreening = mockScreeningProvider.screenWallet(blockedDraft);

const monitoringDraft = buildDeposit({
  id: "dep-2004",
  customerId: "cust-1001",
  hostName: "Iris Lau",
  asset: "ETH",
  network: "Ethereum",
  amount: 3.4,
  walletAddress: "0xLowRiskMonitoringWallet004",
  status: "monitoring",
  createdAt: minutesAgo(180),
});

const monitoringTravelRule: TravelRuleSubmission = {
  ...createTravelRuleDraft(monitoringDraft),
  originatorName: "Avery Chen",
  beneficiaryName: "Wynn Macau Treasury",
  status: "submitted",
  submittedAt: minutesAgo(170),
};

export const deposits: DepositRequest[] = [
  {
    ...lowRiskDraft,
    ...applyScreening(lowRiskScreening),
    status: "address_issued",
    travelRule: lowRiskTravelRule,
    depositAddress: mockAddressProvider.issueAddress(lowRiskDraft),
    updatedAt: minutesAgo(42),
  },
  {
    ...eddDraft,
    ...applyScreening(eddScreening),
    updatedAt: minutesAgo(31),
  },
  {
    ...blockedDraft,
    ...applyScreening(blockedScreening),
    updatedAt: minutesAgo(18),
  },
  {
    ...monitoringDraft,
    screening: mockScreeningProvider.screenWallet(monitoringDraft),
    travelRule: monitoringTravelRule,
    depositAddress: mockAddressProvider.issueAddress(monitoringDraft),
    updatedAt: minutesAgo(155),
  },
];

export const complianceCases: ComplianceCase[] = deposits
  .map(createComplianceCase)
  .filter((item): item is ComplianceCase => Boolean(item));

export const auditLogs: AuditLog[] = [
  {
    id: "audit-1",
    actor: "system:kyt",
    action: "wallet_screening.completed",
    entityType: "WalletScreening",
    entityId: "screen-dep-2001",
    timestamp: minutesAgo(45),
    metadata: "Decision pass, risk score 18",
  },
  {
    id: "audit-2",
    actor: "host:Iris Lau",
    action: "travel_rule.submitted",
    entityType: "TravelRuleSubmission",
    entityId: "tr-dep-2001",
    timestamp: minutesAgo(43),
    metadata: "Originator and beneficiary information captured",
  },
  {
    id: "audit-3",
    actor: "system:address",
    action: "deposit_address.issued",
    entityType: "DepositRequest",
    entityId: "dep-2001",
    timestamp: minutesAgo(42),
    metadata: "One-time address valid for 6 hours",
  },
  {
    id: "audit-4",
    actor: "system:kyt",
    action: "compliance_case.opened",
    entityType: "ComplianceCase",
    entityId: "case-dep-2002",
    timestamp: minutesAgo(31),
    metadata: "EDD required due to mixer proximity",
  },
  {
    id: "audit-5",
    actor: "system:kyt",
    action: "deposit.blocked",
    entityType: "DepositRequest",
    entityId: "dep-2003",
    timestamp: minutesAgo(18),
    metadata: "Sanctions hit detected before address issuance",
  },
];

export const wtaVaults: WtaVault[] = [
  {
    id: "wta-usdt-tron",
    name: "WTA — USDT (TRON / TRC20)",
    asset: "USDT",
    network: "TRON",
    balance: 482500,
    pendingSettlement: 8800,
    lastSettledAt: minutesAgo(42),
    hexSafeVaultId: "vault-mock-usdt-trc20",
  },
  {
    id: "wta-usdc-eth",
    name: "WTA — USDC (Ethereum / ERC20)",
    asset: "USDC",
    network: "Ethereum",
    balance: 213000,
    pendingSettlement: 12000,
    lastSettledAt: minutesAgo(155),
    hexSafeVaultId: "vault-mock-usdc-erc20",
  },
];

export const payoutRequests: PayoutRequest[] = [
  {
    id: "payout-3001",
    customerId: "cust-1001",
    initiatedBy: "Iris Lau",
    asset: "USDT",
    network: "TRON",
    amount: 5000,
    destinationWallet: "TLowRiskPayoutWallet3001",
    status: "approved",
    screeningDecision: "pass",
    approvedBy: "Compliance Officer Demo",
    createdAt: minutesAgo(90),
    updatedAt: minutesAgo(75),
  },
  {
    id: "payout-3002",
    customerId: "cust-1002",
    initiatedBy: "Noah Ho",
    asset: "USDC",
    network: "Ethereum",
    amount: 8000,
    destinationWallet: "0xNeedsEddPayoutWallet3002",
    status: "pending_review",
    screeningDecision: "edd",
    createdAt: minutesAgo(30),
    updatedAt: minutesAgo(28),
  },
  {
    id: "payout-3003",
    customerId: "cust-1001",
    initiatedBy: "Iris Lau",
    asset: "USDT",
    network: "TRON",
    amount: 2200,
    destinationWallet: "TCompletedPayoutWallet3003",
    status: "completed",
    screeningDecision: "pass",
    approvedBy: "Compliance Officer Demo",
    txHash: "0xtxhash3003mock",
    createdAt: minutesAgo(300),
    updatedAt: minutesAgo(270),
  },
];

export function getCustomer(customerId: string): Customer | undefined {
  return customers.find((customer) => customer.id === customerId);
}

export function getDeposit(depositId: string): DepositRequest | undefined {
  return deposits.find((deposit) => deposit.id === depositId);
}

export function getPayout(payoutId: string): PayoutRequest | undefined {
  return payoutRequests.find((p) => p.id === payoutId);
}
