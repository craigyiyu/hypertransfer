/**
 * LanguageSwitcher — Dropdown menu for selecting language.
 * Integrated into Settings page and optionally into header.
 */
import { useI18n } from "@/contexts/I18nContext";
import { Globe } from "lucide-react";
import { useState } from "react";

export default function LanguageSwitcher() {
  const { language, setLanguage, availableLanguages } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 text-foreground hover:bg-secondary/50 transition-colors"
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm font-medium">
          {availableLanguages.find((l) => l.code === language)?.name}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border/50 rounded-lg shadow-lg z-50 overflow-hidden">
          {availableLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLanguage(lang.code);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-sm text-left transition-colors ${
                language === lang.code
                  ? "bg-gold/10 text-gold font-semibold"
                  : "text-foreground hover:bg-secondary/50"
              }`}
            >
              {lang.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
