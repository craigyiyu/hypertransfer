import { createContext, useContext, useState, ReactNode } from "react";
import { KYCState } from "@/lib/kyc-status";
import type { TravelRuleRecord, TravelRuleStatus } from "@/lib/travel-rule";
import type {
  CustodyTransactionLog,
  HexSafeDepositStatus,
  VaultBalance,
} from "@/lib/hex-safe";
import type { OtcConversion } from "@/lib/treasury-ops";
import type { RefundRequest } from "@/lib/refund-process";
import { clearDemoDepositSettlement, writeDemoDepositSettlement } from "@/lib/demo-deposit-settlement";

interface DemoState {
  patronName: string;
  patronEmail: string;
  patronPhone: string;
  patronId: string;
  kycComplete: boolean;
  kyc: KYCState;
  travelRuleComplete: boolean;
  travelRuleStatus: TravelRuleStatus;
  travelRuleRecord: TravelRuleRecord | null;
  travelRuleInfo: {
    address: string;
    city: string;
    country: string;
    sourceOfFunds: string;
    originatorVasp: string;
    beneficiaryVasp: string;
    provider: string;
    providerReference: string;
  };
  selectedAsset: string;
  selectedNetwork: string;
  selectedMinConfirmations: number | null;   // Hex Safe 真实确认数(选网络时存); null=未知/未走真实
  sourceWallet: string;
  screeningPassed: boolean;
  depositRequestId: string;   // ③ 后端入金编排单 id(DR-...); 空=未走真实后端(纯 demo)
  depositAddress: string;
  hexSafeStatus: HexSafeDepositStatus | null;
  vaultBalance: VaultBalance | null;
  custodyLogs: CustodyTransactionLog[];
  testPaymentSent: boolean;
  testPaymentConfirmed: boolean;
  verificationTransferAmount: string;
  verificationTxHash: string;
  mainDepositAmount: string;
  mainDepositConfirmed: boolean;
  totalTransferredAmount: string;
  hostName: string;
  hostCode: string;
  otcConversion: OtcConversion | null;
  refundRequest: RefundRequest | null;
  depositSettlement: DepositSettlement;
  transactions: Transaction[];
}

export interface DepositSettlement {
  status: "pending_marker" | "marker_issued" | "settled";
  markerRef: string;
  markerIssuedAt: string;
  receiptRef: string;
}

export interface Transaction {
  id: string;
  type: "test" | "main";
  asset: string;
  network: string;
  amount: string;
  status: "pending" | "confirmed" | "failed" | "cleared";
  date: string;
  txHash: string;
  sessionId: string;
}

interface DemoContextType {
  state: DemoState;
  updateState: (updates: Partial<DemoState>) => void;
  addTransaction: (tx: Transaction) => void;
  seedRefundDemo: () => void;
  resetSession: () => void;
  resetAll: () => void;
}

const defaultState: DemoState = {
  patronName: "",
  patronEmail: "",
  patronPhone: "",
  patronId: "VIP-" + Math.random().toString(36).substring(2, 6).toUpperCase(),
  kycComplete: false,
  kyc: {
    status: "not_started",
    retryCount: 0,
  },
  travelRuleComplete: false,
  travelRuleStatus: "not_required",
  travelRuleRecord: null,
  travelRuleInfo: {
    address: "",
    city: "",
    country: "",
    sourceOfFunds: "",
    originatorVasp: "",
    beneficiaryVasp: "WML Logistics via Hex Trust / Hex Safe",
    provider: "Internal record only",
    providerReference: "",
  },
  selectedAsset: "USDT",
  selectedNetwork: "",
  selectedMinConfirmations: null,
  sourceWallet: "",
  screeningPassed: false,
  depositRequestId: "",
  depositAddress: "",
  hexSafeStatus: null,
  vaultBalance: null,
  custodyLogs: [],
  testPaymentSent: false,
  testPaymentConfirmed: false,
  verificationTransferAmount: "",
  verificationTxHash: "",
  mainDepositAmount: "",
  mainDepositConfirmed: false,
  totalTransferredAmount: "",
  hostName: "Michael Chen",
  hostCode: "HC-8842",
  otcConversion: null,
  refundRequest: null,
  depositSettlement: {
    status: "pending_marker",
    markerRef: "",
    markerIssuedAt: "",
    receiptRef: "",
  },
  transactions: [],
};

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(defaultState);

  const updateState = (updates: Partial<DemoState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const addTransaction = (tx: Transaction) => {
    setState((prev) => ({
      ...prev,
      transactions: [tx, ...prev.transactions],
    }));
  };

  const seedRefundDemo = () => {
    const now = new Date();
    const demoMainTx: Transaction = {
      id: "tx-demo-main-withdrawal-001",
      type: "main",
      asset: "USDT",
      network: "tron",
      amount: "12500",
      status: "cleared",
      date: now.toISOString(),
      txHash: "0x9f4a1c7b8d63e5f0a2b6c9d4e8f0123456789abcdef0123456789abcdef0123",
      sessionId: "DEP-DEMO-WITHDRAWAL-20260621",
    };
    const referenceId = `HT-${demoMainTx.txHash.slice(2, 12).toUpperCase()}`;

    writeDemoDepositSettlement({
      referenceId,
      asset: demoMainTx.asset,
      network: demoMainTx.network,
      amountDecimal: demoMainTx.amount,
      sourceWallet: "TX9GxY8p8q6fZJ4dL9b2vQq7jK6mN5pA1B",
      depositAddress: "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC",
      txHash: demoMainTx.txHash,
      travelRuleStatus: "travel_rule_accepted",
      screeningStatus: "pass",
      verifyStatus: "confirmed",
      status: "pending_marker",
      markerRef: "",
      markerIssuedAt: "",
      receiptRef: "",
      updatedAt: now.toISOString(),
    });

    setState((prev) => ({
      ...prev,
      patronName: prev.patronName || "Demo Customer",
      patronEmail: prev.patronEmail || "demo.user@hypercrypto.com",
      patronPhone: prev.patronPhone || "+852 9876 5432",
      kycComplete: true,
      kyc: {
        status: "approved",
        submittedAt: now.toISOString(),
        retryCount: 0,
      },
      selectedAsset: "USDT",
      selectedNetwork: "tron",
      sourceWallet: "TX9GxY8p8q6fZJ4dL9b2vQq7jK6mN5pA1B",
      screeningPassed: true,
      travelRuleComplete: true,
      travelRuleStatus: "travel_rule_accepted",
      travelRuleInfo: {
        ...prev.travelRuleInfo,
        address: "One Central, Macau",
        city: "Macau",
        country: "MO",
        sourceOfFunds: "Casino account balance withdrawal",
        originatorVasp: "Customer self-hosted wallet",
        provider: "Demo provider reference",
        providerReference: "TR-DEMO-20260621-001",
      },
      depositAddress: "TJRyWwFs9wTFGZg3JbrVriFbNfCug5tDeC",
      verificationTransferAmount: "0",
      verificationTxHash: "",
      mainDepositAmount: demoMainTx.amount,
      mainDepositConfirmed: true,
      totalTransferredAmount: demoMainTx.amount,
      testPaymentSent: true,
      testPaymentConfirmed: true,
      refundRequest: null,
      depositSettlement: {
        status: "pending_marker",
        markerRef: "",
        markerIssuedAt: "",
        receiptRef: "",
      },
      transactions: [
        demoMainTx,
        ...prev.transactions.filter((tx) => tx.id !== demoMainTx.id),
      ],
    }));
  };

  const resetSession = () => {
    clearDemoDepositSettlement();
    setState((prev) => ({
      ...prev,
      selectedNetwork: "",
      selectedMinConfirmations: null,
      sourceWallet: "",
      screeningPassed: false,
      depositRequestId: "",
      travelRuleComplete: false,
      travelRuleStatus: "not_required",
      travelRuleRecord: null,
      travelRuleInfo: {
        ...prev.travelRuleInfo,
        providerReference: "",
      },
      depositAddress: "",
      hexSafeStatus: null,
      vaultBalance: null,
      custodyLogs: [],
      testPaymentSent: false,
      testPaymentConfirmed: false,
      verificationTransferAmount: "",
      verificationTxHash: "",
      mainDepositAmount: "",
      mainDepositConfirmed: false,
      totalTransferredAmount: "",
      otcConversion: null,
      refundRequest: null,
      depositSettlement: {
        status: "pending_marker",
        markerRef: "",
        markerIssuedAt: "",
        receiptRef: "",
      },
    }));
  };

  const resetAll = () => {
    clearDemoDepositSettlement();
    setState(defaultState);
  };

  return (
    <DemoContext.Provider
      value={{ state, updateState, addTransaction, seedRefundDemo, resetSession, resetAll }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used within DemoProvider");
  return ctx;
}
