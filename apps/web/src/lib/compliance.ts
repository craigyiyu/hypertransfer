// Travel Rule 法定门槛 = HKD 8,000 ≈ USD 1,000（香港 AMLO Travel Rule 口径）。
// 入金资产为 USDT，按 USDT≈USD 1:1 用 USD 判定。此前误写为 8000（被当成 USD）已修正。
export const TRAVEL_RULE_THRESHOLD_USD = 1000;
export const SUPPORTED_PHASE_ONE_ASSETS = ["USDT", "USDC"] as const;
export type SupportedPhaseOneAsset = (typeof SUPPORTED_PHASE_ONE_ASSETS)[number];

// 当前 Patron 入金口径: 只接受 USDT 的 TRC-20 rail。保留 PHASE_ONE_NETWORKS
// 的历史 rails，供退款、对账与既有记录读取，不再向新入金流程开放。
export const ACTIVE_PHASE_ONE_ASSETS = ["USDT"] as const;
export type ActivePhaseOneAsset = (typeof ACTIVE_PHASE_ONE_ASSETS)[number];

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
  "Hex Trust / provider route if contractually enabled",
  "Notabene",
  "Sygna Bridge",
  "TRP",
  "Internal record only",
];

export function getPhaseOneNetworks(asset: string) {
  return PHASE_ONE_NETWORKS[asset] ?? [];
}

export function getActivePhaseOneNetworks(asset: string) {
  if (asset !== "USDT") return [];
  return getPhaseOneNetworks(asset).filter((network) => network.id === "tron");
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
  if (network === "demo") return "Demo";   // DEV demo-pass 占位, 明确标 Demo, 不伪装成真链
  return network || "pending";
}

/** 区块浏览器交易链接(供完成页追踪)。demo/未知链返回 "" —— 无真实浏览器。 */
export function blockExplorerTxUrl(network: string, txHash: string): string {
  if (!txHash) return "";
  if (network === "tron") return `https://tronscan.org/#/transaction/${txHash}`;
  if (network === "ethereum") return `https://etherscan.io/tx/${txHash}`;
  return "";
}

export function isSupportedPhaseOneAsset(asset: string): asset is SupportedPhaseOneAsset {
  return SUPPORTED_PHASE_ONE_ASSETS.includes(asset as SupportedPhaseOneAsset);
}

export function isActivePhaseOneAsset(asset: string): asset is ActivePhaseOneAsset {
  return (ACTIVE_PHASE_ONE_ASSETS as readonly string[]).includes(asset);
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
