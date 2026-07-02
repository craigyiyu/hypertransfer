export type DemoDepositSettlementStatus = "pending_marker" | "marker_issued" | "settled";

export interface DemoDepositSettlementRecord {
  referenceId: string;
  asset: string;
  network: string;
  amountDecimal: string;
  sourceWallet: string;
  depositAddress: string;
  txHash: string;
  travelRuleStatus: string;
  screeningStatus: string;
  verifyStatus: string;
  status: DemoDepositSettlementStatus;
  markerRef: string;
  markerIssuedAt: string;
  receiptRef: string;
  updatedAt: string;
}

const STORAGE_KEY = "hypertransfer.demo.depositSettlement.v1";
export const DEMO_DEPOSIT_SETTLEMENT_EVENT = "hypertransfer:demo-deposit-settlement";

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

const emitSettlementEvent = (record: DemoDepositSettlementRecord | null) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DEMO_DEPOSIT_SETTLEMENT_EVENT, { detail: record }));
};

export const readDemoDepositSettlement = (): DemoDepositSettlementRecord | null => {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoDepositSettlementRecord>;
    if (!parsed.referenceId || !parsed.asset || !parsed.amountDecimal) return null;
    return {
      referenceId: parsed.referenceId,
      asset: parsed.asset,
      network: parsed.network || "demo",
      amountDecimal: parsed.amountDecimal,
      sourceWallet: parsed.sourceWallet || "",
      depositAddress: parsed.depositAddress || "",
      txHash: parsed.txHash || "",
      travelRuleStatus: parsed.travelRuleStatus || "not_required",
      screeningStatus: parsed.screeningStatus || "demo pass",
      verifyStatus: parsed.verifyStatus || "confirmed",
      status: parsed.status || "pending_marker",
      markerRef: parsed.markerRef || "",
      markerIssuedAt: parsed.markerIssuedAt || "",
      receiptRef: parsed.receiptRef || "",
      updatedAt: parsed.updatedAt || "",
    };
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const writeDemoDepositSettlement = (record: DemoDepositSettlementRecord) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(record));
  emitSettlementEvent(record);
};

export const clearDemoDepositSettlement = () => {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
  emitSettlementEvent(null);
};
