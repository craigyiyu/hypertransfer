import { TRAVEL_RULE_THRESHOLD_USD, requiresTravelRule } from "@/lib/compliance";

export type TravelRuleStatus =
  | "not_required"
  | "travel_rule_required"
  | "travel_rule_submitted"
  | "travel_rule_accepted"
  | "travel_rule_rejected"
  | "manual_review";

export interface TravelRuleParty {
  name: string;
  address: string;
  city: string;
  country: string;
  walletAddress: string;
  vasp: string;
  jurisdiction: string;
}

export interface TravelRuleRecord {
  id: string;
  depositRequestId: string;
  originator: TravelRuleParty;
  beneficiary: TravelRuleParty;
  asset: string;
  network: string;
  amount: number;
  thresholdUsd: number;
  required: boolean;
  provider: string;
  providerReference: string;
  status: TravelRuleStatus;
  submittedAt?: string;
  acceptedAt?: string;
  rejectionReason?: string;
  auditTrail: string[];
}

export interface TravelRuleProviderAdapter {
  submit(record: TravelRuleRecord): Promise<TravelRuleRecord>;
}

export function createTravelRuleRecord(input: {
  patronName: string;
  sourceWallet: string;
  address: string;
  city: string;
  country: string;
  sourceOfFunds: string;
  originatorVasp: string;
  beneficiaryVasp: string;
  provider: string;
  asset: string;
  network: string;
  amount: number;
}): TravelRuleRecord {
  const required = requiresTravelRule(input.asset, input.amount);
  const id = `TR-${Date.now().toString(36).toUpperCase()}`;
  const status: TravelRuleStatus = required ? "travel_rule_required" : "not_required";

  return {
    id,
    depositRequestId: `DR-${Date.now().toString(36).toUpperCase()}`,
    originator: {
      name: input.patronName || "Demo Patron",
      address: input.address,
      city: input.city,
      country: input.country,
      walletAddress: input.sourceWallet,
      vasp: input.originatorVasp,
      jurisdiction: input.country,
    },
    beneficiary: {
      name: "WML Logistics Services Limited",
      address: "Cayman-domiciled WML Logistics account",
      city: "George Town",
      country: "KY",
      walletAddress: "System-configured Hex Safe receiving address",
      vasp: input.beneficiaryVasp,
      jurisdiction: "KY/HK custody route",
    },
    asset: input.asset,
    network: input.network,
    amount: input.amount,
    thresholdUsd: TRAVEL_RULE_THRESHOLD_USD,
    required,
    provider: input.provider,
    providerReference: "",
    status,
    auditTrail: [
      `Travel Rule evaluated: ${required ? "required" : "not required"}`,
      `Source of funds captured: ${input.sourceOfFunds}`,
      `Provider strategy selected: ${input.provider}`,
    ],
  };
}

export const mockTravelRuleProvider: TravelRuleProviderAdapter = {
  async submit(record) {
    const submittedAt = new Date().toISOString();
    const providerReference = `${record.provider
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 8)
      .toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    if (/reject|blocked|sanction/i.test(record.originator.vasp)) {
      return {
        ...record,
        providerReference,
        submittedAt,
        status: "travel_rule_rejected",
        rejectionReason: "Demo provider rejected this originating VASP.",
        auditTrail: [
          ...record.auditTrail,
          "Provider submission created",
          "Provider returned rejected status",
        ],
      };
    }

    if (/review|unknown|private/i.test(record.originator.vasp)) {
      return {
        ...record,
        providerReference,
        submittedAt,
        status: "manual_review",
        rejectionReason: "Demo provider requires manual review for this originator.",
        auditTrail: [
          ...record.auditTrail,
          "Provider submission created",
          "Provider routed record to manual review",
        ],
      };
    }

    return {
      ...record,
      providerReference,
      submittedAt,
      acceptedAt: new Date(Date.now() + 900).toISOString(),
      status: "travel_rule_accepted",
      auditTrail: [
        ...record.auditTrail,
        "Provider submission created",
        "Provider returned accepted status",
      ],
    };
  },
};

export function canPassTravelRuleGate(status: TravelRuleStatus, required: boolean) {
  return !required || status === "travel_rule_accepted" || status === "not_required";
}
