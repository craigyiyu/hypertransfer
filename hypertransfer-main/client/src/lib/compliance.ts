export const TRAVEL_RULE_THRESHOLD_USD = 8000;

export const PHASE_ONE_NETWORKS: Record<
  string,
  { id: string; name: string; fee: string; time: string; confirmations: number; note: string }[]
> = {
  USDT: [
    {
      id: "ethereum",
      name: "Ethereum (ERC-20)",
      fee: "~$5-15",
      time: "~5 min",
      confirmations: 5,
      note: "Hex Trust Phase 1 recommended",
    },
    {
      id: "tron",
      name: "Tron (TRC-20)",
      fee: "~$1",
      time: "~3 min",
      confirmations: 4,
      note: "Hex Trust Phase 1 recommended",
    },
  ],
  USDC: [
    {
      id: "ethereum",
      name: "Ethereum (ERC-20)",
      fee: "~$5-15",
      time: "~5 min",
      confirmations: 5,
      note: "Hex Trust Phase 1 recommended",
    },
  ],
};

export const TRAVEL_RULE_PROVIDER_OPTIONS = [
  "Hex Trust / Sumsub if contractually enabled",
  "Notabene",
  "Sygna Bridge",
  "TRP",
  "Internal record only",
];

export function getPhaseOneNetworks(asset: string) {
  return PHASE_ONE_NETWORKS[asset] ?? [];
}

export function isPhaseOneNetwork(asset: string, network: string) {
  return getPhaseOneNetworks(asset).some((item) => item.id === network);
}

export function getRequiredConfirmations(network: string) {
  return network === "tron" ? 4 : 5;
}

export function requiresTravelRule(asset: string, amount: number) {
  return amount >= TRAVEL_RULE_THRESHOLD_USD || asset === "BTC" || asset === "ETH";
}

export function calculateOtcFee(amountUsd: number) {
  return Math.max(amountUsd * 0.005, 150);
}

export function formatUsd(amount: number) {
  return `USD ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
