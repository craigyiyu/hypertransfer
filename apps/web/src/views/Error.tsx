/**
 * Error — Generic error page for handling various error scenarios.
 * Shows error message, reason, and recovery actions.
 */
import { useLocation } from "@/lib/wouter";
import Shell from "@/components/Shell";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/contexts/I18nContext";

interface ErrorPageProps {
  errorCode?: string;
  errorMessage?: string;
  errorReason?: string;
  recoveryAction?: "home" | "retry" | "support";
}

export default function Error() {
  const [, navigate] = useLocation();
  const { t } = useI18n();

  const errorCode = "500";
  const errorMessage = t("errors.somethingWentWrong");
  const errorReason = t("errors.unexpected");

  const handleRetry = () => {
    window.location.reload();
  };

  const handleHome = () => {
    navigate("/dashboard");
  };

  return (
    <Shell title="Error" subtitle={t("errors.weEncountered")}>
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center"
        >
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </motion.div>

        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground font-mono">Error {errorCode}</p>
          <h1 className="text-2xl font-bold text-foreground">{errorMessage}</h1>
          <p className="text-sm text-muted-foreground max-w-sm">{errorReason}</p>
        </div>

        <div className="flex flex-col gap-3 w-full pt-4">
          <button
            onClick={handleRetry}
            className="w-full btn-gold rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            {t("errors.tryAgain")}
          </button>
          <button
            onClick={handleHome}
            className="w-full rounded-xl py-3 text-sm font-semibold text-muted-foreground hover:text-gold transition-colors border border-border/50 hover:border-gold/20"
          >
            <Home className="w-4 h-4 inline mr-2" />
            {t("errors.returnToDashboard")}
          </button>
        </div>
      </div>
    </Shell>
  );
}
