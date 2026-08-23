/**
 * translations.test.ts — en/zh key-set parity and value sanity for the i18n dictionary.
 *
 * B5 guarantee: every UI string is authored in BOTH en and zh (yue may be partial
 * and resolves through the I18nContext fallback chain yue -> zh -> en).
 */
import { describe, it, expect } from "vitest";
import translations from "@/lib/translations";

type Dict = Record<string, unknown>;

function leafKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Dict)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null) {
      out.push(...leafKeys(v, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

function walk<T>(obj: unknown, path: string[]): T | undefined {
  let cur: unknown = obj;
  for (const k of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Dict)[k];
  }
  return cur as T | undefined;
}

describe("translations dictionary (B5 en/zh parity)", () => {
  const enKeys = leafKeys(translations.en).sort();
  const zhKeys = leafKeys(translations.zh).sort();

  it("en and zh expose the exact same key set", () => {
    expect(zhKeys).toEqual(enKeys);
  });

  it("every en value is a non-empty string", () => {
    const bad = enKeys.filter((k) => {
      const v = walk<string>(translations.en, k.split("."));
      return typeof v !== "string" || v.trim().length === 0;
    });
    expect(bad).toEqual([]);
  });

  it("every zh value is a non-empty string", () => {
    const bad = zhKeys.filter((k) => {
      const v = walk<string>(translations.zh, k.split("."));
      return typeof v !== "string" || v.trim().length === 0;
    });
    expect(bad).toEqual([]);
  });

  it("zh translations never leak raw english keys as their own value", () => {
    const allowed = new Set([
      "HyperTransfer",
      "USDT",
      "USDC",
      "ERC-20",
      "TRC-20",
      "KYT",
      "KYC",
      "FATF",
      "Notabene",
      "Hex Trust",
      "Sumsub",
      "DisplayNames",
      "HT-DEMO-DEPOSIT",
      "Promise",
      "Marker",
      "Binance",
      "Coinbase",
      "Kraken",
      "Crypto.com",
      "Apple",
      "Authy",
      "Google",
      "Microsoft",
      "Cage",
      "Host",
      "English",
      "M-VIP-001 (optional)",
      "zh-Hant (optional)",
      "e.g. Macau Peninsula",
      "e.g. Macau Table Games",
      "e.g. VIP-1234",
      "e.g., Issue with deposit",
      "YYYY-MM-DD",
    ]);
    const leaked = zhKeys.filter((k) => {
      const v = walk<string>(translations.zh, k.split("."));
      const enV = walk<string>(translations.en, k.split("."));
      return typeof v === "string" && typeof enV === "string" && v === enV && !allowed.has(v);
    });
    expect(leaked).toEqual([]);
  });

  it("yue stays a valid partial dictionary (every key resolves through fallback)", () => {
    for (const k of leafKeys(translations.yue)) {
      const v = walk<string>(translations.yue, k.split("."));
      expect(typeof v).toBe("string");
    }
  });
});
