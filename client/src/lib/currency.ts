/**
 * Currency utilities for HyperTransfer.
 * Handles USDT ↔ HKD conversion and formatting.
 */

// Mock exchange rates (in production, these would come from an API)
const EXCHANGE_RATES: Record<string, number> = {
  "USDT/HKD": 7.8, // 1 USDT = 7.8 HKD (approximate)
  "USDT/USD": 1.0,
  "HKD/USDT": 1 / 7.8,
};

export function convertCurrency(
  amount: number,
  from: "USDT" | "HKD" | "USD",
  to: "USDT" | "HKD" | "USD"
): number {
  if (from === to) return amount;

  const rateKey = `${from}/${to}`;
  const rate = EXCHANGE_RATES[rateKey];

  if (!rate) {
    console.warn(`Exchange rate not found for ${rateKey}`);
    return amount;
  }

  return amount * rate;
}

export function formatCurrency(
  amount: number | string,
  currency: "USDT" | "HKD" | "USD" = "USDT",
  decimals: number = 2
): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) return "0.00";

  const formatted = numAmount.toFixed(decimals);

  switch (currency) {
    case "HKD":
      return `HKD ${formatted}`;
    case "USD":
      return `$${formatted}`;
    case "USDT":
    default:
      return `USDT ${formatted}`;
  }
}

export function getExchangeRate(
  from: "USDT" | "HKD" | "USD",
  to: "USDT" | "HKD" | "USD"
): number {
  if (from === to) return 1;
  const rateKey = `${from}/${to}`;
  return EXCHANGE_RATES[rateKey] || 1;
}

export function formatFiatAmount(amount: number | string): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  const hkdAmount = convertCurrency(numAmount, "USDT", "HKD");
  return formatCurrency(hkdAmount, "HKD");
}

export function formatBothCurrencies(amount: number | string): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  const hkdAmount = convertCurrency(numAmount, "USDT", "HKD");
  return `${formatCurrency(numAmount, "USDT")} ≈ ${formatCurrency(hkdAmount, "HKD")}`;
}

/**
 * Network fee estimates (in USDT)
 * These are approximate values; real values would come from the blockchain
 */
export const NETWORK_FEES: Record<string, number> = {
  "Ethereum": 2.5,
  "Bitcoin": 15.0,
  "Tron": 0.5,
  "Polygon": 0.1,
  "BNB Chain": 0.3,
  "Avalanche": 0.2,
  "Arbitrum": 0.1,
  "Optimism": 0.1,
};

export function getNetworkFee(network: string): number {
  return NETWORK_FEES[network] || 1.0;
}

export function calculateTotalFee(
  network: string,
  custodianFee: number = 0
): number {
  const networkFee = getNetworkFee(network);
  return networkFee + custodianFee;
}

export function calculateFinalAmount(
  amount: number | string,
  totalFee: number
): number {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return Math.max(0, numAmount - totalFee);
}
