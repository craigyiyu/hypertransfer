/**
 * MainDeposit — After test payment confirmed, patron sends the main deposit.
 * Shows the same deposit address and monitors for the larger transaction.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Copy, Check, Clock, CheckCircle2, ArrowRight, DollarSign } from "lucide-react";
import { toast } from "sonner";

type DepositState = "input" | "monitoring" | "confirming" | "confirmed";

export default function MainDeposit() {
  const [, navigate] = useLocation();
  const { state, updateState, addTransaction } = useDemo();
  const [amount, setAmount] = useState("");
  const [depositState, setDepositState] = useState<DepositState>("input");
  const [copied, setCopied] = useState(false);
  const [confirmations, setConfirmations] = useState(0);

  const handleCopy = () => {
    navigator.clipboard.writeText(state.depositAddress);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmSent = () => {
    updateState({ mainDepositAmount: amount });
    setDepositState("monitoring");

    // Simulate confirmation
    setTimeout(() => setDepositState("confirming"), 3000);
    setTimeout(() => setConfirmations(1), 4000);
    setTimeout(() => setConfirmations(2), 5000);
    setTimeout(() => {
      setConfirmations(3);
      setDepositState("confirmed");
      updateState({ mainDepositConfirmed: true });
      addTransaction({
        id: "tx-main-" + Date.now(),
        type: "main",
        asset: state.selectedAsset,
        network: state.selectedNetwork,
        amount: amount,
        status: "confirmed",
        date: new Date().toISOString(),
        txHash: "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""),
        sessionId: "sess-" + Date.now(),
      });
    }, 6000);
  };

  return (
    <Shell showBack backTo="/test-payment" title="Main Deposit" subtitle="Send your full deposit amount">
      <div className="space-y-6">
        {/* Session info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="px-2 py-1 rounded-md bg-gold/10 text-gold font-mono text-[10px]">
            {state.selectedAsset}
          </div>
          <span>&middot;</span>
          <span className="capitalize">{state.selectedNetwork}</span>
          <span>&middot;</span>
          <div className="flex items-center gap-1 text-success">
            <CheckCircle2 className="w-3 h-3" />
            <span>Test Verified</span>
          </div>
        </div>

        {depositState === "input" && (
          <>
            {/* Amount input */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" /> Deposit Amount
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-14 rounded-xl text-lg font-semibold pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gold font-medium">
                  {state.selectedAsset}
                </span>
              </div>
            </div>

            {/* Deposit address reminder */}
            <div className="card-gold rounded-xl p-4 space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Send to this address
              </p>
              <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-2">
                <code className="font-mono text-[10px] text-gold flex-1 break-all">
                  {state.depositAddress}
                </code>
                <button onClick={handleCopy} className="text-muted-foreground hover:text-gold transition-colors shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                Same address as your test payment &middot; {state.selectedNetwork.toUpperCase()} network only
              </p>
            </div>
          </>
        )}

        {/* Monitoring/Confirming state */}
        {(depositState === "monitoring" || depositState === "confirming") && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-gold rounded-xl p-6 flex flex-col items-center text-center"
          >
            {depositState === "monitoring" ? (
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4"
              >
                <Clock className="w-8 h-8 text-warning" />
              </motion.div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mb-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full"
                />
              </div>
            )}
            <p className="text-sm font-semibold text-foreground">
              {depositState === "monitoring" ? "Waiting for Transaction" : "Confirming Deposit"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {depositState === "monitoring"
                ? `Scanning for your ${amount} ${state.selectedAsset} deposit...`
                : `${confirmations}/3 confirmations`}
            </p>
            {depositState === "confirming" && (
              <div className="w-full mt-4 flex gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                      i < confirmations ? "progress-gold" : "bg-border"
                    }`}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Confirmed */}
        {depositState === "confirmed" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card-gold rounded-xl p-6 flex flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mb-4"
            >
              <CheckCircle2 className="w-8 h-8 text-success" />
            </motion.div>
            <p className="text-lg font-bold text-success">Deposit Confirmed</p>
            <p className="text-2xl font-bold text-foreground mt-2">
              {amount} <span className="text-gold">{state.selectedAsset}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Your deposit has been received and is being processed. You will receive a notification once the funds are cleared to your casino account.
            </p>
          </motion.div>
        )}
      </div>

      <div className="mt-8">
        {depositState === "input" && (
          <button
            onClick={handleConfirmSent}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            I've Sent {amount ? `${amount} ${state.selectedAsset}` : "the Deposit"}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {depositState === "confirmed" && (
          <button
            onClick={() => navigate("/deposit-success")}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </Shell>
  );
}
