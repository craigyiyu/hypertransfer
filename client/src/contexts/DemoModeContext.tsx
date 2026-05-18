/**
 * DemoModeContext — Manages demo mode state for auto-filling forms and fast-forwarding through steps.
 * When enabled, forms auto-populate with realistic test data and navigation accelerates.
 */
import { createContext, useContext, useState, ReactNode } from "react";

interface DemoModeContextType {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  getDemoValue: (fieldName: string) => string;
  autoFillForm: (formId: string) => void;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(
  undefined
);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);

  const demoData = {
    email: "demo.user@hypercrypto.com",
    password: "Demo@12345",
    firstName: "Demo",
    lastName: "User",
    phone: "+852 9876 5432",
    idNumber: "A123456789",
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f8bEb0",
    beneficiaryName: "Demo Account",
    beneficiaryAddress: "123 Demo Street, Hong Kong",
    sourceOfFunds: "Employment Income",
    occupationIndustry: "Finance",
    amount: "10000",
    twoFACode: "123456",
  };

  const toggleDemoMode = () => {
    setIsDemoMode(!isDemoMode);
  };

  const getDemoValue = (fieldName: string): string => {
    return (
      demoData[fieldName as keyof typeof demoData] || `Demo ${fieldName}`
    );
  };

  const autoFillForm = (formId: string) => {
    if (!isDemoMode) return;

    const form = document.getElementById(formId) as HTMLFormElement;
    if (!form) return;

    const inputs = form.querySelectorAll("input, textarea, select");
    inputs.forEach((input: Element) => {
      const htmlInput = input as HTMLInputElement;
      const fieldName = htmlInput.name || htmlInput.id;

      if (fieldName in demoData) {
        htmlInput.value = getDemoValue(fieldName);
        // Trigger change event for React form libraries
        htmlInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  };

  return (
    <DemoModeContext.Provider
      value={{
        isDemoMode,
        toggleDemoMode,
        getDemoValue,
        autoFillForm,
      }}
    >
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
