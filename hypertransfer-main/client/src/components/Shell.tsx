/**
 * Shell — The universal page wrapper for HyperTransfer.
 * Design: "Black Card" — dark canvas, single floating card, gold progress bar at top.
 * Every page renders inside this shell.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowLeft, LogOut, Settings, User } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useDemo } from "@/contexts/DemoContext";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import BrandMark from "@/components/BrandMark";
import { isStaffUser } from "@/lib/api";
import type { ReactNode } from "react";

const STEPS = [
  "/",
  "/invite",
  "/setup-2fa",
  "/login",
  "/verify-2fa",
  "/kyc",
  "/travel-rule",
  "/dashboard",
  "/new-deposit",
  "/wallet-screening",
  "/deposit-address",
  "/test-payment",
  "/main-deposit",
  "/deposit-success",
  "/refund",
];

interface ShellProps {
  children: ReactNode;
  showBack?: boolean;
  backTo?: string;
  showProgress?: boolean;
  title?: string;
  subtitle?: string;
  compactContent?: boolean;
}

export default function Shell({
  children,
  showBack = false,
  backTo,
  showProgress = true,
  title,
  subtitle,
  compactContent = false,
}: ShellProps) {
  const [location, navigate] = useLocation();
  const { state, resetAll } = useDemo();
  const { user, isAuthenticated, logout } = useAuth();
  const { t } = useI18n();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const displayName = user?.name || state.patronName;

  const stepIndex = STEPS.indexOf(location);
  const progress = stepIndex >= 0 ? ((stepIndex + 1) / STEPS.length) * 100 : 0;
  const homeTarget = isAuthenticated ? (user && isStaffUser(user) ? "/casino-ops" : "/dashboard") : "/";

  return (
    <div
      className="page-enter min-h-[100svh] bg-background noise-overlay flex flex-col items-center relative overflow-hidden"
      style={{
        paddingTop: "max(0px, env(safe-area-inset-top))",
        paddingBottom: "max(0px, env(safe-area-inset-bottom))",
      }}
    >
      {/* Gold progress bar at top */}
      {showProgress && stepIndex > 0 && (
        <div className="fixed top-0 left-0 right-0 h-[2px] bg-border z-50">
          <motion.div
            className="h-full progress-gold"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          />
        </div>
      )}

      {/* Main content area */}
      <main className={`w-full max-w-[420px] mx-auto px-4 py-6 flex flex-col relative z-10 ${compactContent ? "" : "min-h-[100svh]"}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {showBack && (
              <button
                onClick={() => (backTo ? navigate(backTo) : window.history.back())}
                aria-label={backTo === "/dashboard" ? t("shell.backToDashboard") : t("shell.back")}
                title={backTo === "/dashboard" ? t("shell.backToDashboard") : t("shell.back")}
                className="w-11 h-11 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-gold hover:border-gold/30 transition-all duration-200"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <a
              href={homeTarget}
              onClick={(event) => {
                event.preventDefault();
                setShowUserMenu(false);
                navigate(homeTarget);
              }}
              className="flex items-center gap-2 rounded-lg text-left transition-opacity hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-gold/40"
              aria-label={t("shell.goToHome")}
              title={t("shell.goToHome")}
            >
              <BrandMark size={28} />
              <span className="font-display text-sm font-semibold tracking-wide text-gold">
                HyperTransfer
              </span>
            </a>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
            {isAuthenticated && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-11 h-11 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-gold hover:border-gold/30 transition-all duration-200"
                  title={t("shell.userMenu")}
                >
                  <User className="w-4 h-4" />
                </button>
                {showUserMenu && (
                  <div className="absolute top-10 right-0 w-48 bg-card border border-border/50 rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/30">
                      <p className="text-xs text-muted-foreground">{t("shell.signedInAs")}</p>
                      <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate("/settings");
                      }}
                      className="w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-2"
                    >
                      <User className="w-4 h-4" />
                      {t("settings.profile")}
                    </button>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate("/settings");
                      }}
                      className="w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      {t("common.settings")}
                    </button>
                    <button
                      onClick={async () => {
                        setShowUserMenu(false);
                        await logout();
                        resetAll();
                        navigate("/");
                      }}
                      className="w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 border-t border-border/30"
                    >
                      <LogOut className="w-4 h-4" />
                      {t("common.logout")}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span>{t("shell.encrypted")}</span>
            </div>
          </div>
        </div>

        {/* Title area */}
        {title && (
          <div className="mb-6">
            <h1 className="font-display text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
        )}

        {/* Page content with animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className={compactContent ? "flex flex-col" : "flex-1 flex flex-col"}
          >
            {children}
          </motion.div>
        </AnimatePresence>

        {/* Minimal footer */}
        <div className={`${compactContent ? "" : "mt-auto"} pt-6 pb-2 text-center`}>
          <p className="text-[10px] text-muted-foreground/50">
            {t("shell.securedBy")}
          </p>
        </div>
      </main>
    </div>
  );
}
