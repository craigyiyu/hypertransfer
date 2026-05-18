/**
 * MainDeposit — Unified deposit session combining verification step (1 USDT test)
 * and main deposit into a single screen. Shows HKD equivalent and network fees.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Copy, Check, Clock, CheckCircle2, ArrowRight, DollarSign, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { getNetworkFee, getHKDEquivalent, convertToHKD, formatHKD } from "@/lib/currency";

type SessionPhase = "verification" | "verification_monitoring" | "verification_confirmed" | "main_input" | "main_monitoring" | "main_confirming" | "main_confirmed";

export default function MainDeposit() {
  const [, navigate] = useLocation();
  const { state, updateState, addTransaction } = useDemo();
  const [phase, setPhase] = useState<SessionPhase>(
    state.testPaymentConfirmed ? "main_input" : "verification"
  );
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmations, setConfirmations] = useState(0);
  const sessionId = useState(() => "sess-" + Date.now())[0];

  const networkFee = getNetworkFee(state.selectedNetwork);
  const mainAmount = parseFloat(amount) || 0;
  const netReceive = Math.max(0, mainAmount - networkFee);

  const handleCopy = () => {
    navigator.clipboard.writeText(state.depositAddress);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle verification step confirmation
  const handleVerificationSent = () => {
    setPhase("verification_monitoring");
    // Simulate blockchain confirmation for 1 USDT test
    setTimeout(() => setConfirmations(1), 2000);
    setTimeout(() => setConfirmations(2), 3000);
    setTimeout(() => {
      setConfirmations(3);
      setPhase("verification_confirmed");
      updateState({ testPaymentConfirmed: true });
      addTransaction({
        id: "tx-test-" + Date.now(),
        type: "test",
        asset: state.selectedAsset,
        network: state.selectedNetwork,
        amount: "1.00",
        status: "confirmed",
        date: new Date().toISOString(),
        txHash: "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""),
        sessionId,
      });
    }, 4000);
  };

  // Handle main deposit confirmation
  const handleMainDepositSent = () => {
    updateState({ mainDepositAmount: amount });
    setPhase("main_monitoring");
    setConfirmations(0);

    setTimeout(() => setPhase("main_confirming"), 3000);
    setTimeout(() => setConfirmations(1), 4000);
    setTimeout(() => setConfirmations(2), 5000);
    setTimeout(() => {
      setConfirmations(3);
      setPhase("main_confirmed");
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
        sessionId,
      });
    }, 6000);
  };

  const proceedToMainDeposit = () => {
    setPhase("main_input");
    setConfirmations(0);
  };

  return (
    <Shell showBack backTo="/deposit-address" title="Deposit Session" subtitle="Complete your deposit in one session">
      <div className="space-y-5">
        {/* Session info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="px-2 py-1 rounded-md bg-gold/10 text-gold font-mono text-[10px]">
            {state.selectedAsset}
          </div>
          <span>&middot;</span>
          <span className="capitalize">{state.selectedNetwork}</span>
          {(phase === "main_input" || phase === "main_monitoring" || phase === "main_confirming" || phase === "main_confirmed") && (
            <>
              <span>&middot;</span>
              <div className="flex items-center gap-1 text-success">
                <CheckCircle2 className="w-3 h-3" />
                <span>Verified</span>
              </div>
            </>
          )}
        </div>

        {/* === STEP 1: Verification Transfer (1 USDT) === */}
        {phase === "verification" && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-wine rounded-xl px-4 py-3 space-y-2"
            >
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs text-foreground font-medium">Step 1: Verification Transfer</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Send exactly <span className="text-gold font-semibold">1 {state.selectedAsset}</span> to verify the deposit address is correct. This is a verification step — the 1 {state.selectedAsset} will be credited to your account.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Deposit address */}
            <div className="card-gold rounded-xl p-4 space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Send 1 {state.selectedAsset} to this address
              </p>
              <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-2">
                <code className="font-mono text-[10px] text-gold flex-1 break-all">
                  {state.depositAddress}
                </code>
                <button onClick={handleCopy} className="text-muted-foreground hover:text-gold transition-colors shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 pt-1">
                <span>{state.selectedNetwork} network only</span>
                <span>≈ {getHKDEquivalent("1", state.selectedAsset)}</span>
              </div>
            </div>

            <button
              onClick={handleVerificationSent}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              I've Sent 1 {state.selectedAsset}
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Verification monitoring */}
        {phase === "verification_monitoring" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-gold rounded-xl p-6 flex flex-col items-center text-center"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4"
            >
              <Clock className="w-8 h-8 text-warning" />
            </motion.div>
            <p className="text-sm font-semibold text-foreground">Verifying Transfer</p>
            <p className="text-xs text-muted-foreground mt-1">
              Confirming your 1 {state.selectedAsset} verification transfer...
            </p>
            {confirmations > 0 && (
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
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              {confirmations}/3 confirmations
            </p>
          </motion.div>
        )}

        {/* Verification confirmed — proceed to main deposit */}
        {phase === "verification_confirmed" && (
          <>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card-gold rounded-xl p-5 flex flex-col items-center text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mb-3"
              >
                <CheckCircle2 className="w-6 h-6 text-success" />
              </motion.div>
              <p className="text-sm font-semibold text-success">Address Verified</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your 1 {state.selectedAsset} verification transfer was confirmed. You can now proceed with your full deposit.
              </p>
            </motion.div>

            <button
              onClick={proceedToMainDeposit}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              Continue to Main Deposit
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* === STEP 2: Main Deposit === */}
        {phase === "main_input" && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-wine rounded-xl px-4 py-3 space-y-1"
            >
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="text-foreground font-medium">Step 2: Main Deposit</span> — Enter the amount you wish to deposit and confirm once sent.
                </p>
              </div>
            </motion.div>

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
              {mainAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  ≈ {getHKDEquivalent(amount, state.selectedAsset)}
                </p>
              )}
            </div>

            {/* Fee breakdown */}
            {mainAmount > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-gold rounded-xl p-4 space-y-3"
              >
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fee Summary</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Deposit Amount</span>
                    <span className="text-foreground font-medium">{state.selectedAsset} {mainAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Network Fee</span>
                    <span className="text-foreground font-medium">−{state.selectedAsset} {networkFee.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-border/30 pt-2 flex items-center justify-between text-xs">
                    <span className="text-foreground font-semibold">You'll Receive</span>
                    <div className="text-right">
                      <span className="text-gold font-semibold">{state.selectedAsset} {netReceive.toFixed(2)}</span>
                      <p className="text-[10px] text-muted-foreground">≈ {formatHKD(convertToHKD(netReceive, state.selectedAsset))}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

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
                Same verified address &middot; {state.selectedNetwork} network only
              </p>
            </div>

            <button
              onClick={handleMainDepositSent}
              disabled={!amount || mainAmount <= 0}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              I've Sent {amount ? `${amount} ${state.selectedAsset}` : "the Deposit"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Main deposit monitoring */}
        {(phase === "main_monitoring" || phase === "main_confirming") && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-gold rounded-xl p-6 flex flex-col items-center text-center"
          >
            {phase === "main_monitoring" ? (
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
              {phase === "main_monitoring" ? "Waiting for Transaction" : "Confirming Deposit"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {phase === "main_monitoring"
                ? `Scanning for your ${amount} ${state.selectedAsset} deposit...`
                : `${confirmations}/3 confirmations`}
            </p>
            {phase === "main_confirming" && (
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
            <p className="text-xs text-muted-foreground/60 mt-3">
              Amount: {amount} {state.selectedAsset} ≈ {getHKDEquivalent(amount, state.selectedAsset)}
            </p>
          </motion.div>
        )}

        {/* Main deposit confirmed */}
        {phase === "main_confirmed" && (
          <>
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
              <p className="text-sm text-muted-foreground mt-1">
                ≈ {getHKDEquivalent(amount, state.selectedAsset)}
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Your deposit has been received and is being processed. Funds will be credited after settlement.
              </p>
            </motion.div>

            <button
              onClick={() => navigate("/deposit-success")}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}
