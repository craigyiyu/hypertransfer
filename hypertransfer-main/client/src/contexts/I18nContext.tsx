/**
 * I18nContext — Manages language selection and translation strings.
 * Supports English, Cantonese (Traditional Chinese), and Mandarin (Simplified Chinese).
 */
import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import translations from "@/lib/translations";

type Language = "en" | "yue" | "zh";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  availableLanguages: { code: Language; name: string }[];
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    // English-first: honour an explicit saved preference, otherwise always default to English
    // (do not auto-switch to Chinese for zh browsers — the switcher remains available).
    const saved = localStorage.getItem("hypertransfer-language");
    if (saved === "en" || saved === "yue" || saved === "zh") {
      return saved;
    }
    return "en";
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("hypertransfer-language", lang);
  };

  const t = (key: string): string => {
    const keys = key.split(".");
    // Fallback chain: language -> zh (for yue, since new keys are authored zh-first) -> en
    const chain: Language[] =
      language === "yue" ? ["yue", "zh", "en"] : language === "zh" ? ["zh", "en"] : ["en"];

    for (const lang of chain) {
      let value: any = translations[lang];
      for (const k of keys) {
        value = value?.[k];
      }
      if (typeof value === "string") {
        return value;
      }
    }

    return key;
  };

  const availableLanguages = [
    { code: "en" as Language, name: "English" },
    { code: "yue" as Language, name: "Cantonese" },
    { code: "zh" as Language, name: "Chinese (Mandarin)" },
  ];

  return (
    <I18nContext.Provider
      value={{
        language,
        setLanguage,
        t,
        availableLanguages,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
