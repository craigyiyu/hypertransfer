/**
 * SecurityStatus — Shows the account status.
 * Displays 2FA status and KYC verification only.
 * Travel Rule is NOT shown here — it's conditional on transfer amount (>8,000 USD),
 * not a fixed account setup step.
 * Uses amber/clock for pending, green/check for approved.
 */
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import type { KYCStatus } from "@/lib/kyc-status";

interface SecurityStatusProps {
  twoFAEnabled?: boolean;
  kycStatus?: KYCStatus;
  /** @deprecated use kycStatus instead */
  kycVerified?: boolean;
  /** @deprecated Travel Rule is no longer shown in Account Status */
  travelRuleComplete?: boolean;
  compact?: boolean;
}

export default function SecurityStatus({
  twoFAEnabled = true,
  kycStatus,
  kycVerified = false,
  compact = false,
}: SecurityStatusProps) {
  // Determine KYC state from kycStatus prop (preferred) or legacy kycVerified
  const kycApproved = kycStatus ? kycStatus === "approved" : kycVerified;
  const kycPending = kycStatus === "pending";

  const items = [
    {
      label: "2FA Enabled",
      status: twoFAEnabled ? "verified" : "pending",
    },
    {
      label: "KYC Verification",
      status: kycApproved ? "verified" : kycPending ? "pending" : "not_started",
    },
  ];

  const completedCount = items.filter((i) => i.status === "verified").length;
  const completionPercent = Math.round((completedCount / items.length) * 100);

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">Account Status</p>
          <span className="text-xs font-semibold text-gold">{completionPercent}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-secondary/50 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${completionPercent}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-gold to-gold-bright"
          />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-gold rounded-xl p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Account Status</h3>
        <span className="text-xs font-medium text-gold">{completionPercent}% Complete</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-secondary/50 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${completionPercent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full bg-gradient-to-r from-gold to-gold-bright"
        />
      </div>

      {/* Status items */}
      <div className="space-y-2">
        {items.map((item, i) => {
          const isVerified = item.status === "verified";
          const isPending = item.status === "pending";

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors"
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  isVerified ? "bg-success/10" : isPending ? "bg-warning/10" : "bg-muted/10"
                }`}
              >
                {isVerified ? (
                  <CheckCircle2 className="w-3 h-3 text-success" />
                ) : isPending ? (
                  <Clock className="w-3 h-3 text-warning" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
              <span className={`text-xs font-medium ${isVerified ? "text-foreground" : "text-muted-foreground"}`}>
                {item.label}
              </span>
              <span className={`text-[10px] ml-auto ${
                isVerified ? "text-success" : isPending ? "text-warning" : "text-muted-foreground"
              }`}>
                {isVerified ? "✓ Done" : isPending ? "⏳ Pending" : "Required"}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Call to action if incomplete */}
      {completionPercent < 100 && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground/60">
            Complete all steps to unlock full deposit capabilities.
          </p>
        </div>
      )}
    </motion.div>
  );
}
