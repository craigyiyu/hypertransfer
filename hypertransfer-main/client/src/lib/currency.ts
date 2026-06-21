/**
 * Currency utilities for HyperTransfer.
 * Handles USDT ↔ HKD conversion using Hex Trust fiatRates/fiatValueDecimal fields.
 * In production, these values come from the Hex Trust API response.
 */

/**
 * Mock Hex Trust fiatRates response structure.
 * In production: each deposit/transfer API response includes:
 *   fiatRates: [{ currency: "HKD", rate: "7.80" }, ...]
 *   fiatValueDecimal: "7800.00" (for a 1000 USDT transfer)
 */
export const HEX_TRUST_FIAT_RATES = [
  { currency: "HKD", rate: "7.80" },
  { currency: "USD", rate: "1.00" },
];

// Derived exchange rates from Hex Trust fiatRates
const EXCHANGE_RATES: Record<string, number> = {
  "USDT/HKD": parseFloat(HEX_TRUST_FIAT_RATES.find(r => r.currency === "HKD")?.rate || "7.80"),
  "USDT/USD": parseFloat(HEX_TRUST_FIAT_RATES.find(r => r.currency === "USD")?.rate || "1.00"),
  "USDC/HKD": parseFloat(HEX_TRUST_FIAT_RATES.find(r => r.currency === "HKD")?.rate || "7.80"),
  "HKD/USDT": 1 / 7.80,
};

export function convertToHKD(amount: number | string, asset: string = "USDT"): number {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(numAmount) || numAmount === 0) return 0;
  const rateKey = `${asset}/HKD`;
  const rate = EXCHANGE_RATES[rateKey] || 7.80;
  return numAmount * rate;
}

export function formatHKD(amount: number): string {
  if (isNaN(amount) || amount === 0) return "HKD 0.00";
  return `HKD ${amount.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatAssetAmount(amount: number | string, decimals: number = 2): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount.replace(/,/g, "")) : amount;

  if (isNaN(numAmount)) return decimals > 0 ? "0.00" : "0";

  return numAmount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Returns the HKD equivalent string for a given crypto amount.
 * Uses Hex Trust fiatRates for conversion.
 */
export function getHKDEquivalent(amount: number | string, asset: string = "USDT"): string {
  const hkd = convertToHKD(amount, asset);
  return formatHKD(hkd);
}

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

export function formatBothCurrencies(amount: number | string, asset: string = "USDT"): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  const hkdAmount = convertToHKD(numAmount, asset);
  return `${asset} ${numAmount.toFixed(2)} ≈ ${formatHKD(hkdAmount)}`;
}

/**
 * Network fee estimates (in USDT)
 * These are approximate values; real values would come from the blockchain
 */
export const NETWORK_FEES: Record<string, number> = {
  "ethereum": 2.5,
  "tron": 0.5,
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
