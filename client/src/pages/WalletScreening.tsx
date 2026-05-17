/**
 * WalletScreening — Patron submits their source wallet address for KYT (Know Your Transaction) screening.
 * The system verifies the wallet is clean before issuing a deposit address.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Shield, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type ScreeningState = "idle" | "scanning" | "passed" | "failed";

export default function WalletScreening() {
  const [, navigate] = useLocation();
  const { state, updateState } = useDemo();
  const [walletAddress, setWalletAddress] = useState("");
  const [screening, setScreening] = useState<ScreeningState>("idle");

  const handleScreen = () => {
    if (!walletAddress) return;
    updateState({ sourceWallet: walletAddress });
    setScreening("scanning");

    // Simulate screening process
    setTimeout(() => {
      // Demo: addresses starting with "bad" fail screening
      if (walletAddress.toLowerCase().startsWith("bad")) {
        setScreening("failed");
      } else {
        setScreening("passed");
        updateState({ screeningPassed: true });
      }
    }, 3000);
  };

  const handleContinue = () => {
    navigate("/deposit-address");
  };

  const handleRetry = () => {
    setWalletAddress("");
    setScreening("idle");
  };

  return (
    <Shell showBack backTo="/new-deposit" title="Wallet Screening" subtitle={`Source wallet verification for ${state.selectedAsset}`}>
      <div className="space-y-6">
        {/* Session info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="px-2 py-1 rounded-md bg-gold/10 text-gold font-mono text-[10px]">
            {state.selectedAsset}
          </div>
          <span>&middot;</span>
          <span className="capitalize">{state.selectedNetwork} Network</span>
        </div>

        {/* Wallet input */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Search className="w-3 h-3" /> Your Source Wallet Address
          </Label>
          <Input
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="Enter the wallet address you will send from"
            disabled={screening !== "idle"}
            className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground/60">
            This is the wallet you will use to send {state.selectedAsset}. We need to verify it is not associated with illicit activity.
          </p>
        </div>

        {/* Screening status */}
        <AnimatePresence mode="wait">
          {screening === "scanning" && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="card-gold rounded-xl p-5 flex flex-col items-center text-center"
            >
              <Loader2 className="w-8 h-8 text-gold animate-spin mb-3" />
              <p className="text-sm font-medium text-foreground">Screening Wallet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Checking against sanctions lists, darknet, and risk databases...
              </p>
              <div className="w-full mt-4 space-y-2">
                {["Sanctions Check", "Risk Score Analysis", "Transaction History"].map((step, i) => (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.8 }}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.8 + 0.5 }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    </motion.div>
                    {step}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {screening === "passed" && (
            <motion.div
              key="passed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-gold rounded-xl p-5 flex flex-col items-center text-center border-success/30"
            >
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
                <Shield className="w-6 h-6 text-success" />
              </div>
              <p className="text-sm font-semibold text-success">Wallet Approved</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your wallet has passed all compliance checks. You may proceed to receive a deposit address.
              </p>
              <div className="mt-3 px-3 py-1.5 rounded-lg bg-input">
                <code className="font-mono text-[10px] text-muted-foreground break-all">
                  {walletAddress}
                </code>
              </div>
            </motion.div>
          )}

          {screening === "failed" && (
            <motion.div
              key="failed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-gold rounded-xl p-5 flex flex-col items-center text-center border-destructive/30"
            >
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <XCircle className="w-6 h-6 text-destructive" />
              </div>
              <p className="text-sm font-semibold text-destructive">Screening Failed</p>
              <p className="text-xs text-muted-foreground mt-1">
                This wallet address did not pass our compliance screening. Please use a different wallet or contact your host for assistance.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8">
        {screening === "idle" && (
          <button
            onClick={handleScreen}
            disabled={!walletAddress}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Submit for Screening
          </button>
        )}
        {screening === "passed" && (
          <button
            onClick={handleContinue}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold"
          >
            Get Deposit Address
          </button>
        )}
        {screening === "failed" && (
          <button
            onClick={handleRetry}
            className="w-full rounded-xl py-4 text-sm font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all duration-200"
          >
            Try a Different Wallet
          </button>
        )}
      </div>
    </Shell>
  );
}
