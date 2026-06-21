import { calculateOtcFee, formatUsd } from "@/lib/compliance";

export type OtcStatus = "quote_requested" | "approved" | "executed" | "settled";

export interface OtcQuote {
  provider: "HT Markets";
  rate: number;
  feeRate: number;
  minimumFeeUsd: number;
  requestedAt: string;
  expiresAt: string;
}

export interface OtcApproval {
  status: "pending" | "approved";
  requiredRole: string;
  approvedAt?: string;
}

export interface OtcExecution {
  status: "pending" | "executed";
  channel: string;
  executedAt?: string;
}

export interface OtcSettlement {
  status: "pending" | "settled";
  receipt: string;
  settledAt?: string;
  statementRef: string;
}

export interface OtcConversion {
  id: string;
  pair: "USDT/USD" | "USDC/USD" | "USD/USDT" | "USD/USDC";
  grossUsd: number;
  feeUsd: number;
  netUsd: number;
  status: OtcStatus;
  quote: OtcQuote;
  approval: OtcApproval;
  execution: OtcExecution;
  settlement: OtcSettlement;
  receipt: string;
  auditTrail: string[];
}

export interface DepegWorkflow {
  threshold: number;
  currentPrice: number;
  triggered: boolean;
  approvalRequired: string;
  otcChannel: string;
  bankingWarning: string;
  status: "monitoring" | "triggered" | "approved" | "executed";
}

export interface ReconciliationItem {
  source: "API" | "Webhook" | "SFTP" | "Monthly statement";
  status: "matched" | "pending" | "exception";
  records: number;
  lastRun: string;
  note: string;
}

export interface MacauAccessControl {
  control: string;
  owner: "Wynn" | "HyperTransfer" | "Hex Trust";
  status: "active" | "required" | "not_supported_by_hex_trust";
  evidence: string;
}

export interface CustodyEvidenceItem {
  capability: string;
  provider: "Hex Trust";
  evidence: string;
  shownAs: "custody-provider-control";
}

export function createOtcConversion(amountUsd: number, asset: "USDT" | "USDC" = "USDT"): OtcConversion {
  const feeUsd = amountUsd > 0 ? calculateOtcFee(amountUsd) : 0;
  const id = `OTC-${Date.now().toString(36).toUpperCase()}`;
  const requestedAt = new Date().toISOString();

  return {
    id,
    pair: `${asset}/USD`,
    grossUsd: amountUsd,
    feeUsd,
    netUsd: Math.max(0, amountUsd - feeUsd),
    status: "quote_requested",
    quote: {
      provider: "HT Markets",
      rate: 1,
      feeRate: 0.005,
      minimumFeeUsd: 150,
      requestedAt,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    approval: {
      status: "pending",
      requiredRole: "Treasury Approver + Finance Checker",
    },
    execution: {
      status: "pending",
      channel: "HT Markets OTC desk",
    },
    settlement: {
      status: "pending",
      receipt: `${id}-RECEIPT`,
      statementRef: `${id}-WTA-STATEMENT`,
    },
    receipt: `${id}-RECEIPT`,
    auditTrail: [
      `Quote requested for ${formatUsd(amountUsd)}`,
      `Fee calculated at max(0.50%, USD 150): ${formatUsd(feeUsd)}`,
      "Awaiting treasury approval",
    ],
  };
}

export function approveAndSettleOtc(conversion: OtcConversion): OtcConversion {
  const approvedAt = new Date().toISOString();
  const executedAt = new Date(Date.now() + 1000).toISOString();
  const settledAt = new Date(Date.now() + 2000).toISOString();

  return {
    ...conversion,
    status: "settled",
    approval: {
      ...conversion.approval,
      status: "approved",
      approvedAt,
    },
    execution: {
      ...conversion.execution,
      status: "executed",
      executedAt,
    },
    settlement: {
      ...conversion.settlement,
      status: "settled",
      settledAt,
    },
    auditTrail: [
      ...conversion.auditTrail,
      "Treasury approval captured",
      "HT Markets OTC execution marked complete",
      "Settlement receipt generated",
    ],
  };
}

export function createDepegWorkflow(currentPrice = 0.997): DepegWorkflow {
  const threshold = 0.95;
  const triggered = currentPrice < threshold;

  return {
    threshold,
    currentPrice,
    triggered,
    approvalRequired: "Treasury Director + Compliance Officer",
    otcChannel: "HT Markets 24/7 OTC channel",
    bankingWarning: "Fiat off-ramp settlement remains subject to banking hours.",
    status: triggered ? "triggered" : "monitoring",
  };
}

export const reconciliationItems: ReconciliationItem[] = [
  {
    source: "API",
    status: "matched",
    records: 24,
    lastRun: new Date().toISOString(),
    note: "Hex Safe transaction API matched to WML ledger.",
  },
  {
    source: "Webhook",
    status: "matched",
    records: 8,
    lastRun: new Date().toISOString(),
    note: "Deposit finality webhook matched to DepositRequest.",
  },
  {
    source: "SFTP",
    status: "pending",
    records: 0,
    lastRun: "Scheduled daily",
    note: "Batch CSV import pending setup with Hex Trust Client Operations.",
  },
  {
    source: "Monthly statement",
    status: "pending",
    records: 0,
    lastRun: "Month end",
    note: "Official Hex Trust client statement imported for finance sign-off.",
  },
];

export const macauAccessControls: MacauAccessControl[] = [
  {
    control: "IP/location policy",
    owner: "HyperTransfer",
    status: "required",
    evidence: "Block Macau IP/device sessions before operator console access.",
  },
  {
    control: "Non-Macau operator provisioning",
    owner: "Wynn",
    status: "active",
    evidence: "Only non-Macau staff receive Hex Safe / HyperTransfer operator roles.",
  },
  {
    control: "Client-side Okta SSO enforcement in Hex Safe",
    owner: "Hex Trust",
    status: "not_supported_by_hex_trust",
    evidence: "Hex Trust response states client-side Okta SSO/location policy is not supported at platform level.",
  },
  {
    control: "Operator audit log",
    owner: "HyperTransfer",
    status: "active",
    evidence: "Every operator action is logged with role, device, jurisdiction, and approval trail.",
  },
];

export const custodyEvidenceItems: CustodyEvidenceItem[] = [
  {
    capability: "100% cold storage",
    provider: "Hex Trust",
    evidence: "Hex Trust states client assets on Hex Safe are held in air-gapped cold storage.",
    shownAs: "custody-provider-control",
  },
  {
    capability: "RBAC, vault roles, quorum approval",
    provider: "Hex Trust",
    evidence: "Hex Safe supports Admin, Admin Approver, Initiator, Approver, and Auditor roles.",
    shownAs: "custody-provider-control",
  },
  {
    capability: "Maker-checker and policy controls",
    provider: "Hex Trust",
    evidence: "Transaction initiation and approval can be separated by vault policy.",
    shownAs: "custody-provider-control",
  },
  {
    capability: "Insurance and incident response SLA",
    provider: "Hex Trust",
    evidence: "Hex Trust response references Aon-arranged USD 25m aggregate insurance and critical/high response SLAs.",
    shownAs: "custody-provider-control",
  },
];
