/**
 * ComplianceBadges — Display security certifications and compliance indicators.
 * Shows SSL, KYC, Travel Rule, and custodian status.
 */
import { Shield, CheckCircle2, Lock, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface ComplianceBadgesProps {
  variant?: "inline" | "footer" | "card";
  showDetails?: boolean;
}

export default function ComplianceBadges({
  variant = "inline",
  showDetails = false,
}: ComplianceBadgesProps) {
  const badges = [
    {
      icon: Shield,
      label: "256-bit SSL",
      description: "Military-grade encryption",
      status: "verified",
    },
    {
      icon: CheckCircle2,
      label: "KYC Verified",
      description: "Identity confirmed",
      status: "verified",
    },
    {
      icon: Lock,
      label: "Travel Rule",
      description: "FATF Compliant",
      status: "verified",
    },
    {
      icon: Shield,
      label: "Licensed Custodian",
      description: "Hex Trust Partner",
      status: "verified",
    },
  ];

  if (variant === "footer") {
    return (
      <div className="flex items-center justify-center gap-4 py-4 border-t border-border/30 text-[10px] text-muted-foreground/60">
        <div className="flex items-center gap-1">
          <Lock className="w-3 h-3" />
          256-bit SSL
        </div>
        <span>&middot;</span>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Licensed Custodian
        </div>
        <span>&middot;</span>
        <div className="flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Hong Kong
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-gold rounded-xl p-4 space-y-3"
      >
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-gold" />
          <p className="text-xs font-semibold text-foreground">Security & Compliance</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {badges.map((badge, i) => {
            const Icon = badge.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-foreground">{badge.label}</p>
                  <p className="text-[9px] text-muted-foreground/60">{badge.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    );
  }

  // Default inline variant
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge, i) => {
        const Icon = badge.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gold/10 hover:bg-gold/15 transition-colors group cursor-help"
            title={badge.description}
          >
            <Icon className="w-3 h-3 text-gold" />
            <span className="text-[10px] font-medium text-gold">{badge.label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
