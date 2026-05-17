import { createContext, useContext, useState, type ReactNode } from "react";

interface DemoState {
  patronName: string;
  patronEmail: string;
  patronId: string;
  kycComplete: boolean;
  travelRuleComplete: boolean;
  selectedAsset: string;
  selectedNetwork: string;
  sourceWallet: string;
  screeningPassed: boolean;
  depositAddress: string;
  testPaymentSent: boolean;
  testPaymentConfirmed: boolean;
  mainDepositAmount: string;
  mainDepositConfirmed: boolean;
  hostName: string;
  hostCode: string;
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
  patronId: "VIP-" + Math.random().toString(36).substring(2, 6).toUpperCase(),
  kycComplete: false,
  travelRuleComplete: false,
  selectedAsset: "USDT",
  selectedNetwork: "",
  sourceWallet: "",
  screeningPassed: false,
  depositAddress: "",
  testPaymentSent: false,
  testPaymentConfirmed: false,
  mainDepositAmount: "",
  mainDepositConfirmed: false,
  hostName: "Michael Chen",
  hostCode: "HC-8842",
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
      depositAddress: "",
      testPaymentSent: false,
      testPaymentConfirmed: false,
      mainDepositAmount: "",
      mainDepositConfirmed: false,
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
