/**
 * NewDeposit — Start a new deposit session. Select network for USDT transfer.
 * USDT is the only supported asset. Users select network based on their wallet location.
 * Polygon is recommended as default (lowest fees, fastest).
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { Check, AlertTriangle, Zap, DollarSign } from "lucide-react";

const NETWORKS = [
  { id: "polygon", name: "Polygon", fee: "~$0.01", time: "~2 min", recommended: true },
  { id: "tron", name: "Tron (TRC-20)", fee: "~$1", time: "~3 min", recommended: false },
  { id: "solana", name: "Solana", fee: "~$0.01", time: "~1 min", recommended: false },
  { id: "arbitrum", name: "Arbitrum One", fee: "~$0.10", time: "~1 min", recommended: false },
  { id: "bsc", name: "BNB Smart Chain (BEP-20)", fee: "~$0.50", time: "~1 min", recommended: false },
  { id: "avalanche", name: "Avalanche (C-Chain)", fee: "~$0.10", time: "~2 min", recommended: false },
  { id: "ethereum", name: "Ethereum (ERC-20)", fee: "~$5-15", time: "~5 min", recommended: false },
];

export default function NewDeposit() {
  const [, navigate] = useLocation();
  const { updateState, resetSession } = useDemo();
  const [selectedNetwork, setSelectedNetwork] = useState("polygon");

  // Auto-select Polygon on mount
  useEffect(() => {
    setSelectedNetwork("polygon");
  }, []);

  const handleContinue = () => {
    resetSession();
    updateState({ selectedAsset: "USDT", selectedNetwork });
    navigate("/wallet-screening");
  };

  return (
    <Shell showBack backTo="/dashboard" title="New Deposit" subtitle="Select network for USDT transfer">
      <div className="space-y-6">
        {/* Asset Info */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-gold rounded-xl p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#26A17B] to-[#1a7a5a] flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Deposit Asset</p>
            <p className="text-sm font-semibold text-foreground">Tether (USDT)</p>
          </div>
        </motion.div>

        {/* Network Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Select Network</p>
            <p className="text-xs text-gold font-medium">Choose where your wallet is located</p>
          </div>

          <div className="space-y-2">
            {NETWORKS.map((net, idx) => (
              <motion.button
                key={net.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedNetwork(net.id)}
                className={`w-full rounded-xl px-4 py-3 flex items-center justify-between border transition-all duration-200 ${
                  selectedNetwork === net.id
                    ? "border-gold/50 bg-gold/5"
                    : "border-border hover:border-border/30"
                }`}
              >
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">{net.name}</p>
                    {net.recommended && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/10 border border-gold/30">
                        <Zap className="w-3 h-3 text-gold" />
                        <span className="text-[10px] font-semibold text-gold">Recommended</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      Fee: {net.fee}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      {net.time}
                    </span>
                  </div>
                </div>
                {selectedNetwork === net.id && (
                  <Check className="w-4 h-4 text-gold shrink-0 ml-3" />
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Network warning */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card-wine rounded-xl px-4 py-3 flex items-start gap-3"
        >
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-warning font-medium">Important:</span> Ensure you send funds on the correct network. Sending on the wrong network may result in permanent loss of funds.
          </p>
        </motion.div>
      </div>

      <div className="mt-8">
        <button
          onClick={handleContinue}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold"
        >
          Continue to Wallet Screening
        </button>
      </div>
    </Shell>
  );
}
