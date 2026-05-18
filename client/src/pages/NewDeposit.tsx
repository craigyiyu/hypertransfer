/**
 * NewDeposit — Start a new deposit session. Select asset and network.
 * Each deposit is treated as a session containing test + main deposit.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { Check, AlertTriangle } from "lucide-react";

const ASSETS = [
  { id: "USDT", name: "Tether", symbol: "USDT", color: "#26A17B" },
  { id: "USDC", name: "USD Coin", symbol: "USDC", color: "#2775CA" },
  { id: "BTC", name: "Bitcoin", symbol: "BTC", color: "#F7931A" },
  { id: "ETH", name: "Ethereum", symbol: "ETH", color: "#627EEA" },
];

const NETWORKS: Record<string, { id: string; name: string; fee: string; time: string }[]> = {
  USDT: [
    { id: "tron", name: "Tron (TRC-20)", fee: "~$1", time: "~3 min" },
    { id: "ethereum", name: "Ethereum (ERC-20)", fee: "~$5-15", time: "~5 min" },
    { id: "bsc", name: "BNB Smart Chain (BEP-20)", fee: "~$0.50", time: "~1 min" },
    { id: "polygon", name: "Polygon", fee: "~$0.01", time: "~2 min" },
    { id: "avalanche", name: "Avalanche (C-Chain)", fee: "~$0.10", time: "~2 min" },
    { id: "solana", name: "Solana", fee: "~$0.01", time: "~1 min" },
    { id: "arbitrum", name: "Arbitrum One", fee: "~$0.10", time: "~1 min" },
  ],
  USDC: [
    { id: "ethereum", name: "Ethereum (ERC-20)", fee: "~$5-15", time: "~5 min" },
    { id: "solana", name: "Solana", fee: "~$0.01", time: "~1 min" },
    { id: "polygon", name: "Polygon", fee: "~$0.01", time: "~2 min" },
    { id: "arbitrum", name: "Arbitrum One", fee: "~$0.10", time: "~1 min" },
    { id: "avalanche", name: "Avalanche (C-Chain)", fee: "~$0.10", time: "~2 min" },
  ],
  BTC: [
    { id: "bitcoin", name: "Bitcoin Network", fee: "~$2-10", time: "~30 min" },
    { id: "lightning", name: "Lightning Network", fee: "~$0.01", time: "~1 min" },
  ],
  ETH: [
    { id: "ethereum", name: "Ethereum Mainnet", fee: "~$5-15", time: "~5 min" },
    { id: "arbitrum", name: "Arbitrum One", fee: "~$0.10", time: "~1 min" },
  ],
};

export default function NewDeposit() {
  const [, navigate] = useLocation();
  const { updateState, resetSession } = useDemo();
  const [selectedAsset, setSelectedAsset] = useState("USDT");
  const [selectedNetwork, setSelectedNetwork] = useState("");

  const networks = NETWORKS[selectedAsset] || [];

  const handleContinue = () => {
    resetSession();
    updateState({ selectedAsset, selectedNetwork });
    navigate("/wallet-screening");
  };

  return (
    <Shell showBack backTo="/dashboard" title="New Deposit" subtitle="Select asset and network for this transfer">
      <div className="space-y-6">
        {/* Asset Selection */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Select Asset</p>
          <div className="grid grid-cols-2 gap-2">
            {ASSETS.map((asset) => (
              <button
                key={asset.id}
                onClick={() => {
                  setSelectedAsset(asset.id);
                  setSelectedNetwork("");
                }}
                className={`rounded-xl p-3 flex items-center gap-3 border transition-all duration-200 ${
                  selectedAsset === asset.id
                    ? "border-gold/50 bg-gold/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: asset.color }}
                >
                  {asset.symbol.charAt(0)}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{asset.symbol}</p>
                  <p className="text-[10px] text-muted-foreground">{asset.name}</p>
                </div>
                {selectedAsset === asset.id && (
                  <Check className="w-4 h-4 text-gold ml-auto" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Network Selection */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Select Network</p>
          <div className="space-y-2">
            {networks.map((net) => (
              <button
                key={net.id}
                onClick={() => setSelectedNetwork(net.id)}
                className={`w-full rounded-xl px-4 py-3 flex items-center justify-between border transition-all duration-200 ${
                  selectedNetwork === net.id
                    ? "border-gold/50 bg-gold/5"
                    : "border-border hover:border-border/80"
                }`}
              >
                <div className="text-left">
                  <p className="text-sm text-foreground">{net.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Fee: {net.fee} &middot; Time: {net.time}
                  </p>
                </div>
                {selectedNetwork === net.id && (
                  <Check className="w-4 h-4 text-gold" />
                )}
              </button>
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
          disabled={!selectedNetwork}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Continue to Wallet Screening
        </button>
      </div>
    </Shell>
  );
}
