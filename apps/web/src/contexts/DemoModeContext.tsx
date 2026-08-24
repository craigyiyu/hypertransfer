/**
 * DemoModeContext — Manages demo mode state for auto-filling forms and fast-forwarding through steps.
 * When enabled, forms auto-populate with realistic test data and navigation accelerates.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export const DEMO_AUTOFILL_EVENT = "hypertransfer:demo-autofill";

const DEMO_MODE_STORAGE_KEY = "hypertransfer-demo-mode";

const DEMO_DATA = {
  email: "demo.user@hypercrypto.com",
  patronEmail: "demo.patron@operator.example",
  password: "Demo@12345",
  firstName: "Demo",
  lastName: "Patron",
  memberId: "VIP-1234",
  phone: "+852 9876 5432",
  idNumber: "A123456789",
  walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f8bEb0",
  beneficiaryName: "Demo Account",
  beneficiaryAddress: "123 Demo Street, Hong Kong",
  residentialAddress: "One Central, Macau",
  city: "Macau",
  country: "Hong Kong",
  sourceOfFunds: "Employment Income",
  originatorVasp: "Customer self-hosted wallet",
  beneficiaryVasp: "HyperTransfer custody deposit account",
  occupationIndustry: "Finance",
  amount: "10000",
  twoFACode: "123456",
};

type DemoDataKey = keyof typeof DEMO_DATA;
type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface DemoModeContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  fillDemoData: () => void;
  getDemoValue: (fieldName: string) => string;
  autoFillForm: (formId?: string) => void;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(
  undefined
);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, String(isDemoMode));
  }, [isDemoMode]);

  const getDemoValue = useCallback((fieldName: string): string => {
    return DEMO_DATA[fieldName as DemoDataKey] || `Demo ${fieldName}`;
  }, []);

  const fieldKeyFor = (element: FillableElement): DemoDataKey | null => {
    const directKey = (element.name || element.id || element.getAttribute("data-demo-key") || "").trim();
    if (directKey in DEMO_DATA) return directKey as DemoDataKey;

    const labelText = element.closest("label")?.textContent || "";
    const hints = [
      directKey,
      element.getAttribute("aria-label") || "",
      element.getAttribute("autocomplete") || "",
      element.getAttribute("placeholder") || "",
      labelText,
    ].join(" ").toLowerCase();

    if (hints.includes("member")) return "memberId";
    if (hints.includes("first")) return "firstName";
    if (hints.includes("last")) return "lastName";
    if (hints.includes("password")) return "password";
    if (hints.includes("phone") || hints.includes("mobile")) return "phone";
    if (
      hints.includes("originating vasp") ||
      hints.includes("wallet provider") ||
      hints.includes("private wallet") ||
      hints.includes("binance") ||
      hints.includes("coinbase")
    ) return "originatorVasp";
    if (hints.includes("beneficiary route")) return "beneficiaryVasp";
    if (hints.includes("wallet")) return "walletAddress";
    if (hints.includes("street address") || hints.includes("residential") || hints.includes("address")) return "residentialAddress";
    if (hints.includes("city")) return "city";
    if (hints.includes("country")) return "country";
    if (hints.includes("amount")) return "amount";
    if (hints.includes("otp") || hints.includes("code") || hints.includes("2fa")) return "twoFACode";
    if (hints.includes("email")) return "email";
    return null;
  };

  const setElementValue = (element: FillableElement, value: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const autoFillForm = useCallback((formId?: string) => {
    if (typeof document === "undefined") return;
    const root = formId ? document.getElementById(formId) : document;
    if (!root) return;

    root.querySelectorAll("input, textarea, select").forEach((input) => {
      const element = input as FillableElement;
      if (element.disabled || ("readOnly" in element && element.readOnly)) return;
      const key = fieldKeyFor(element);
      if (!key) return;
      setElementValue(element, DEMO_DATA[key]);
    });
  }, []);

  const fillDemoData = useCallback(() => {
    setIsDemoMode(true);
    window.dispatchEvent(new CustomEvent(DEMO_AUTOFILL_EVENT, { detail: DEMO_DATA }));
    window.requestAnimationFrame(() => autoFillForm());
  }, [autoFillForm]);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((current) => !current);
  }, []);

  const value = useMemo(
    () => ({
      isDemoMode,
      toggleDemoMode,
      fillDemoData,
      getDemoValue,
      autoFillForm,
    }),
    [autoFillForm, fillDemoData, getDemoValue, isDemoMode, toggleDemoMode],
  );

  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (!context) {
    throw new Error("useDemoMode must be used within DemoModeProvider");
  }
  return context;
}
