/**
 * FeeBreakdown — Displays transaction fees and settlement costs.
 * Design: Dark canvas, gold accents, transparent cost breakdown.
 */
import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { useState } from "react";

interface FeeBreakdownProps {
  amount: string;
  network: string;
  networkFee: string;
  custodianFee?: string;
  totalFee: string;
  settlementTime?: string;
  showDetails?: boolean;
}

export default function FeeBreakdown({
  amount,
  network,
  networkFee,
  custodianFee = "0",
  totalFee,
  settlementTime,
  showDetails = true,
}: FeeBreakdownProps) {
  const [showHelp, setShowHelp] = useState(false);

  const finalAmount = (parseFloat(amount) - parseFloat(totalFee)).toFixed(2);

  const networkSettlementTimes: Record<string, string> = {
    "Ethereum": "~2-5 minutes",
    "Bitcoin": "~10-30 minutes",
    "Tron": "~30 seconds",
    "Polygon": "~1-2 minutes",
    "BNB Chain": "~1-2 minutes",
    "Avalanche": "~2-3 minutes",
  };

  const estimatedTime = settlementTime || networkSettlementTimes[network] || "~2-5 minutes";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Main breakdown card */}
      <div className="card-gold rounded-xl p-4 space-y-3">
        {/* Amount row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Deposit Amount</p>
          <p className="text-sm font-semibold text-foreground">
            USDT {parseFloat(amount).toFixed(2)}
          </p>
        </div>

        {/* Network fee row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Network Fee</p>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-muted-foreground hover:text-gold transition-colors"
              title="Network fee explanation"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-sm font-medium text-foreground">
            USDT {parseFloat(networkFee).toFixed(2)}
          </p>
        </div>

        {/* Custodian fee row (if applicable) */}
        {parseFloat(custodianFee) > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Custodian Fee</p>
            <p className="text-sm font-medium text-foreground">
              USDT {parseFloat(custodianFee).toFixed(2)}
            </p>
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-border/30" />

        {/* Total fee row */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Total Fees</p>
          <p className="text-sm font-semibold text-gold">
            USDT {parseFloat(totalFee).toFixed(2)}
          </p>
        </div>

        {/* Final amount row */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <p className="text-sm font-semibold text-foreground">You'll Receive</p>
          <p className="text-sm font-bold text-success">
            USDT {finalAmount}
          </p>
        </div>
      </div>

      {/* Settlement time info */}
      {showDetails && (
        <div className="card-wine rounded-xl p-3 flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-gold mt-1.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Settlement Time:</span> {estimatedTime} on {network}
            </p>
          </div>
        </div>
      )}

      {/* Help text */}
      {showHelp && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="p-3 rounded-lg bg-secondary/30 border border-border/30"
        >
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Network Fee:</span> Charged by the blockchain network to process your transaction. This varies based on network congestion.
          </p>
          {parseFloat(custodianFee) > 0 && (
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              <span className="font-medium text-foreground">Custodian Fee:</span> A small fee charged by our custodian partner for secure asset custody.
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
