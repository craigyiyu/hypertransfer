export const TRAVEL_RULE_THRESHOLD_USD = 8000;
export const SUPPORTED_PHASE_ONE_ASSETS = ["USDT", "USDC"] as const;
export type SupportedPhaseOneAsset = (typeof SUPPORTED_PHASE_ONE_ASSETS)[number];

export const PHASE_ONE_NETWORKS: Record<
  string,
  { id: string; name: string; fee: string; time: string; confirmations: number; note: string }[]
> = {
  USDT: [
    {
      id: "ethereum",
      name: "ERC-20 stablecoin rail",
      fee: "~$5-15",
      time: "~5 min",
      confirmations: 5,
      note: "USDT token only; ETH asset is not supported",
    },
    {
      id: "tron",
      name: "TRC-20 stablecoin rail",
      fee: "~$1",
      time: "~3 min",
      confirmations: 4,
      note: "USDT token only",
    },
  ],
  USDC: [
    {
      id: "ethereum",
      name: "ERC-20 stablecoin rail",
      fee: "~$5-15",
      time: "~5 min",
      confirmations: 5,
      note: "USDC token only; ETH asset is not supported",
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

export function formatNetworkRail(network: string) {
  if (network === "tron") return "TRC-20";
  if (network === "ethereum") return "ERC-20";
  return network || "pending";
}

export function isSupportedPhaseOneAsset(asset: string): asset is SupportedPhaseOneAsset {
  return SUPPORTED_PHASE_ONE_ASSETS.includes(asset as SupportedPhaseOneAsset);
}

export function requiresTravelRule(_asset: string, amount: number) {
  return amount >= TRAVEL_RULE_THRESHOLD_USD;
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
