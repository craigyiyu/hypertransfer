/**
 * SecurityStatus — Shows the patron's account security status.
 * Displays 2FA status, KYC verification, and Travel Rule completion.
 */
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Clock, Shield } from "lucide-react";

interface SecurityStatusProps {
  twoFAEnabled?: boolean;
  kycVerified?: boolean;
  travelRuleComplete?: boolean;
  compact?: boolean;
}

export default function SecurityStatus({
  twoFAEnabled = true,
  kycVerified = false,
  travelRuleComplete = false,
  compact = false,
}: SecurityStatusProps) {
  const items = [
    {
      label: "2FA Enabled",
      status: twoFAEnabled ? "verified" : "pending",
      icon: Shield,
    },
    {
      label: "KYC Verified",
      status: kycVerified ? "verified" : "pending",
      icon: CheckCircle2,
    },
    {
      label: "Travel Rule",
      status: travelRuleComplete ? "verified" : "pending",
      icon: Clock,
    },
  ];

  const completedCount = items.filter((i) => i.status === "verified").length;
  const completionPercent = Math.round((completedCount / items.length) * 100);

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-foreground">Account Security</p>
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
        <h3 className="text-sm font-semibold text-foreground">Account Security</h3>
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
          const Icon = item.icon;
          const isVerified = item.status === "verified";

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
                  isVerified ? "bg-success/10" : "bg-warning/10"
                }`}
              >
                {isVerified ? (
                  <CheckCircle2 className="w-3 h-3 text-success" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-warning" />
                )}
              </div>
              <span className={`text-xs font-medium ${isVerified ? "text-foreground" : "text-muted-foreground"}`}>
                {item.label}
              </span>
              <span className={`text-[10px] ml-auto ${isVerified ? "text-success" : "text-warning"}`}>
                {isVerified ? "✓ Done" : "Pending"}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Call to action if incomplete */}
      {completionPercent < 100 && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-xs text-muted-foreground/60">
            Complete all security steps to unlock full deposit capabilities.
          </p>
        </div>
      )}
    </motion.div>
  );
}
