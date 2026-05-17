/**
 * DepositAddress — System issues a deposit wallet address from the custodian.
 * Patron must first send a small test payment before the main deposit.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { Copy, Check, AlertTriangle, QrCode, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const SUCCESS_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/success-illustration-eEvN4zYtHrbHQ2jjhx3ZrM.webp";

// Generate a mock deposit address based on network
function generateAddress(network: string): string {
  const chars = "0123456789abcdef";
  const rand = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  switch (network) {
    case "tron": return "T" + rand(33);
    case "bitcoin": return "bc1q" + rand(38);
    case "solana": return rand(44);
    default: return "0x" + rand(40);
  }
}

export default function DepositAddress() {
  const [, navigate] = useLocation();
  const { state, updateState } = useDemo();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching deposit address from custodian
    const timer = setTimeout(() => {
      const addr = generateAddress(state.selectedNetwork);
      updateState({ depositAddress: addr });
      setLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(state.depositAddress);
    setCopied(true);
    toast.success("Address copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Shell showBack backTo="/wallet-screening" title="Deposit Address" subtitle="Send your test payment to this address">
      <div className="space-y-6">
        {/* Session info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="px-2 py-1 rounded-md bg-gold/10 text-gold font-mono text-[10px]">
            {state.selectedAsset}
          </div>
          <span>&middot;</span>
          <span className="capitalize">{state.selectedNetwork} Network</span>
        </div>

        {/* Address card */}
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card-gold rounded-xl p-6 flex flex-col items-center"
          >
            <img src={SUCCESS_IMG} alt="Loading" className="w-16 h-16 mb-3 opacity-50 animate-pulse" />
            <p className="text-sm text-muted-foreground">Requesting address from custodian...</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card-gold rounded-xl p-5 space-y-4"
          >
            {/* QR Code area */}
            <div className="flex justify-center">
              <div className="w-36 h-36 bg-white rounded-xl p-2 flex items-center justify-center">
                <QrCode className="w-24 h-24 text-gray-800" />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">
                Deposit Address
              </p>
              <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-2.5">
                <code className="font-mono text-xs text-gold flex-1 break-all leading-relaxed">
                  {state.depositAddress}
                </code>
                <button
                  onClick={handleCopy}
                  className="text-muted-foreground hover:text-gold transition-colors shrink-0"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Network badge */}
            <div className="flex justify-center">
              <div className="px-3 py-1 rounded-full bg-gold/10 text-gold text-[10px] font-medium">
                {state.selectedNetwork.toUpperCase()} Network Only
              </div>
            </div>
          </motion.div>
        )}

        {/* Test payment instruction */}
        <div className="card-wine rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs text-foreground font-medium">Test Payment Required</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Before making your full deposit, you must send a small test amount (e.g., 1-5 {state.selectedAsset}) to verify the address and network are correct. Once confirmed, you will be prompted to send the full amount.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <button
          onClick={() => navigate("/test-payment")}
          disabled={loading}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          I've Sent the Test Payment
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </Shell>
  );
}
