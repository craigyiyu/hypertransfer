/**
 * ThemeToggle — 右上角深/浅色主题切换(2026-08 feedback)。
 * 依赖 ThemeContext(switchable); 未启用切换时返回 null。
 */
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme, switchable } = useTheme();
  if (!switchable || !toggleTheme) return null;
  const dark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-all duration-200 hover:border-gold/40 hover:text-gold"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
