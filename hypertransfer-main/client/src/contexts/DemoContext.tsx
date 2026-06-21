import { createContext, useContext, useState, ReactNode } from "react";
import { KYCState } from "@/lib/kyc-status";
import type { TravelRuleRecord, TravelRuleStatus } from "@/lib/travel-rule";
import type {
  CustodyTransactionLog,
  HexSafeDepositStatus,
  VaultBalance,
} from "@/lib/hex-safe";
import type { OtcConversion } from "@/lib/treasury-ops";

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
  sourceWallet: string;
  screeningPassed: boolean;
  depositAddress: string;
  hexSafeStatus: HexSafeDepositStatus | null;
  vaultBalance: VaultBalance | null;
  custodyLogs: CustodyTransactionLog[];
  testPaymentSent: boolean;
  testPaymentConfirmed: boolean;
  mainDepositAmount: string;
  mainDepositConfirmed: boolean;
  hostName: string;
  hostCode: string;
  otcConversion: OtcConversion | null;
  transactions: Transaction[];
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
  sourceWallet: "",
  screeningPassed: false,
  depositAddress: "",
  hexSafeStatus: null,
  vaultBalance: null,
  custodyLogs: [],
  testPaymentSent: false,
  testPaymentConfirmed: false,
  mainDepositAmount: "",
  mainDepositConfirmed: false,
  hostName: "Michael Chen",
  hostCode: "HC-8842",
  otcConversion: null,
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

  const resetSession = () => {
    setState((prev) => ({
      ...prev,
      selectedNetwork: "",
      sourceWallet: "",
      screeningPassed: false,
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
      mainDepositAmount: "",
      mainDepositConfirmed: false,
      otcConversion: null,
    }));
  };

  const resetAll = () => setState(defaultState);

  return (
    <DemoContext.Provider
      value={{ state, updateState, addTransaction, resetSession, resetAll }}
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
