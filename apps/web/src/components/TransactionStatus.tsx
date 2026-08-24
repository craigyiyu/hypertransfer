/**
 * TransactionStatus — Displays transaction status timeline with confirmations.
 * Design: Dark canvas, gold accents, step-by-step progress.
 */
import { motion } from "framer-motion";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

interface StatusStep {
  label: string;
  status: "pending" | "confirmed" | "failed";
  timestamp?: string;
  confirmations?: number;
  totalConfirmations?: number;
}

interface TransactionStatusProps {
  steps: StatusStep[];
  estimatedTime?: string;
  currentStatus: "pending" | "confirmed" | "settled" | "failed";
}

export default function TransactionStatus({
  steps,
  estimatedTime,
  currentStatus,
}: TransactionStatusProps) {
  const { t } = useI18n();
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle2 className="w-5 h-5 text-success" />;
      case "pending":
        return <Clock className="w-5 h-5 text-warning animate-spin" />;
      case "failed":
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      default:
        return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {t("transactionStatus.title")}
          </p>
          <p className="text-sm font-semibold text-foreground mt-1 capitalize">
            {currentStatus === "pending" && t("transactionStatus.awaiting")}
            {currentStatus === "confirmed" && t("transactionStatus.confirmed")}
            {currentStatus === "settled" && t("transactionStatus.settled")}
            {currentStatus === "failed" && t("transactionStatus.failed")}
          </p>
        </div>
        {estimatedTime && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t("transactionStatus.estimatedTime")}</p>
            <p className="text-sm font-medium text-gold mt-1">{estimatedTime}</p>
          </div>
        )}
      </div>

      {/* Status timeline */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex gap-3"
          >
            {/* Icon */}
            <div className="flex-shrink-0 flex items-start pt-0.5">
              {getStatusIcon(step.status)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {step.label}
                </p>
                {step.timestamp && (
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {step.timestamp}
                  </p>
                )}
              </div>

              {/* Confirmations progress */}
              {step.status === "pending" && step.confirmations !== undefined && step.totalConfirmations && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-gold to-gold/60"
                        initial={{ width: 0 }}
                        animate={{ width: `${(step.confirmations / step.totalConfirmations) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {step.confirmations}/{step.totalConfirmations}
                    </span>
                  </div>
                </div>
              )}

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div className="mt-2 ml-2 h-3 border-l border-border/30" />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Help text */}
      {currentStatus === "pending" && (
        <div className="mt-4 p-3 rounded-lg bg-secondary/30 border border-border/30">
          <p className="text-xs text-muted-foreground">
            💡 Your transaction is being processed on the blockchain. Please keep this page open.
          </p>
        </div>
      )}

      {currentStatus === "failed" && (
        <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <p className="text-xs text-destructive">
            ⚠️ Your transaction failed. Please try again or contact support.
          </p>
        </div>
      )}
    </div>
  );
}
