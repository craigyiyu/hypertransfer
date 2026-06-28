/**
 * MainDeposit — Unified deposit session combining verification step (1 USDT test)
 * and main deposit into a single screen. Shows HKD equivalent and network fees.
 * Travel Rule is expected to be cleared before address issuance; this screen keeps a
 * defensive check in case the amount changes later.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { Copy, Check, Clock, CheckCircle2, ArrowRight, DollarSign, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { getNetworkFee, getHKDEquivalent, convertToHKD, formatHKD } from "@/lib/currency";
import { formatNetworkRail, getRequiredConfirmations, requiresTravelRule, TRAVEL_RULE_THRESHOLD_USD } from "@/lib/compliance";
import {
  createCustodyLogs,
  createHexSafeStatus,
  createVaultBalance,
} from "@/lib/hex-safe";
import { depositApi } from "@/lib/api";

type SessionPhase = "verification" | "verification_monitoring" | "verification_confirmed" | "main_input" | "main_monitoring" | "main_confirming" | "main_confirmed";

export default function MainDeposit() {
  const [, navigate] = useLocation();
  const { state, updateState, addTransaction } = useDemo();
  const [phase, setPhase] = useState<SessionPhase>(
    state.testPaymentConfirmed ? "main_input" : "verification"
  );
  const [amount, setAmount] = useState(state.mainDepositAmount || "");
  const [copied, setCopied] = useState(false);
  const [confirmations, setConfirmations] = useState(0);
  const sessionId = useState(() => "sess-" + Date.now())[0];

  const networkFee = getNetworkFee(state.selectedNetwork);
  const requiredConfirmations = getRequiredConfirmations(state.selectedNetwork);
  const mainAmount = parseFloat(amount) || 0;
  const netReceive = Math.max(0, mainAmount - networkFee);
  const formatAssetAmount = (value: number, decimals = 2) =>
    value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  const formatInputAmount = (value: string) => {
    if (!value) return "";
    const [whole, decimal] = value.split(".");
    const formattedWhole = Number(whole || "0").toLocaleString("en-US");
    return decimal !== undefined ? `${formattedWhole}.${decimal}` : formattedWhole;
  };
  const handleAmountChange = (value: string) => {
    const normalized = value.replace(/,/g, "");
    if (/^\d*\.?\d{0,6}$/.test(normalized)) {
      setAmount(normalized);
    }
  };
  const displayAmount = mainAmount > 0 ? formatAssetAmount(mainAmount, 0) : "";

  // Stablecoin demo flow treats the entered deposit amount as USD-equivalent.
  const isTravelRuleRequired = requiresTravelRule(state.selectedAsset, mainAmount);

  const handleCopy = () => {
    navigator.clipboard.writeText(state.depositAddress);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle verification step confirmation
  const handleVerificationSent = () => {
    setPhase("verification_monitoring");
    for (let i = 1; i <= requiredConfirmations; i += 1) {
      setTimeout(() => setConfirmations(i), 1200 + i * 650);
    }
    const verifyTxHash =
      "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    setTimeout(() => {
      setConfirmations(requiredConfirmations);
      setPhase("verification_confirmed");
      updateState({ testPaymentConfirmed: true });
      // 真实: 有后端入金单 → 确认 1 USDT 到账, 后端把来源钱包写入 verified_wallets(退款①只能退这些)。
      if (state.depositRequestId) {
        depositApi.confirmTest(state.depositRequestId, verifyTxHash).catch(() => {});
      }
      addTransaction({
        id: "tx-test-" + Date.now(),
        type: "test",
        asset: state.selectedAsset,
        network: state.selectedNetwork,
        amount: "1.00",
        status: "confirmed",
        date: new Date().toISOString(),
        txHash: verifyTxHash,
        sessionId,
      });
    }, 1600 + requiredConfirmations * 650);
  };

  // Handle main deposit confirmation with Travel Rule check
  const handleMainDepositSent = () => {
    // Check if Travel Rule is required and not yet completed
    if (isTravelRuleRequired && !state.travelRuleComplete) {
      updateState({ mainDepositAmount: amount });
      navigate("/travel-rule");
      return;
    }

    updateState({ mainDepositAmount: amount });
    // 真实: 回填主入金金额 + Travel Rule 状态(≥USD1k 后端标记 TR required)。
    if (state.depositRequestId) {
      depositApi.main(state.depositRequestId, amount, state.travelRuleStatus).catch(() => {});
    }
    setPhase("main_monitoring");
    setConfirmations(0);

    setTimeout(() => setPhase("main_confirming"), 3000);
    for (let i = 1; i <= requiredConfirmations; i += 1) {
      setTimeout(() => setConfirmations(i), 3000 + i * 650);
    }
    setTimeout(() => {
      setConfirmations(requiredConfirmations);
      setPhase("main_confirmed");
      const hexSafeStatus = createHexSafeStatus({
        asset: state.selectedAsset,
        network: state.selectedNetwork,
        amount: parseFloat(amount) || 0,
        receivingAddress: state.depositAddress,
        sourceWallet: state.sourceWallet,
      });
      const vaultBalance = createVaultBalance(hexSafeStatus);
      const custodyLogs = createCustodyLogs(hexSafeStatus);
      updateState({
        mainDepositConfirmed: true,
        hexSafeStatus,
        vaultBalance,
        custodyLogs,
      });
      addTransaction({
        id: "tx-main-" + Date.now(),
        type: "main",
        asset: state.selectedAsset,
        network: state.selectedNetwork,
        amount: amount,
        status: "confirmed",
        date: new Date().toISOString(),
        txHash: hexSafeStatus.txHash,
        sessionId,
      });
    }, 3400 + requiredConfirmations * 650);
  };

  const proceedToMainDeposit = () => {
    setPhase("main_input");
    setConfirmations(0);
  };

  const shellTitle = phase === "verification" ? "Verification Deposit" : "Deposit Session";
  const shellSubtitle = phase === "verification"
    ? `Step 1 of 2: send only 1 ${state.selectedAsset}`
    : "Complete your deposit in one session";

  return (
    <Shell showBack backTo="/deposit-address" title={shellTitle} subtitle={shellSubtitle}>
      <div className="space-y-5">
        {/* Session info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="px-2 py-1 rounded-md bg-gold/10 text-gold font-mono text-[10px] font-medium">
            {state.selectedAsset}
          </div>
          <span>&middot;</span>
          <div className="px-2 py-1 rounded-md bg-gold/10 text-gold text-[10px] font-medium">
            <span>{formatNetworkRail(state.selectedNetwork)}</span> rail
          </div>
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
              className="card-wine rounded-xl px-4 py-4 border-warning/40 space-y-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="text-[10px] text-warning font-semibold uppercase tracking-wider">Step 1 of 2</p>
                  <p className="text-sm text-foreground font-semibold">Verification deposit only</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Send exactly <span className="text-gold font-semibold">1 {state.selectedAsset}</span> to the address below. Do not send your full deposit amount yet. After this transfer is confirmed, you will continue to Step 2 for the main deposit.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Deposit address */}
            <div className="card-gold rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Send only 1 {state.selectedAsset} to this address
                </p>
                <span className="px-2 py-1 rounded-md bg-warning/10 text-warning text-[10px] font-semibold whitespace-nowrap">
                  Step 1
                </span>
              </div>
              <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-2">
                <code className="font-mono text-[10px] text-gold flex-1 break-all">
                  {state.depositAddress}
                </code>
                <button onClick={handleCopy} className="text-muted-foreground hover:text-gold transition-colors shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 pt-1">
                <span>{formatNetworkRail(state.selectedNetwork)} rail only</span>
                <span>≈ {getHKDEquivalent("1", state.selectedAsset)}</span>
              </div>
            </div>

            <button
              onClick={handleVerificationSent}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              Confirm I've Sent 1&nbsp;{state.selectedAsset}
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
                {Array.from({ length: requiredConfirmations }, (_, i) => i).map((i) => (
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
              {confirmations}/{requiredConfirmations} confirmations
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
                  <span className="text-foreground font-medium">Step 2: Main Deposit</span> — Enter the amount you wish to deposit and proceed to the send instructions.
                </p>
              </div>
            </motion.div>

            {/* Travel Rule notice (if applicable) */}
            {isTravelRuleRequired && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-wine rounded-xl px-4 py-3 flex items-start gap-3"
              >
                {state.travelRuleComplete ? (
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-2">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {state.travelRuleComplete ? (
                    <>
                      <span className="text-success font-medium">Travel Rule Complete:</span> This {displayAmount} {state.selectedAsset} deposit will use your submitted compliance information.
                    </>
                  ) : (
                    <>
                      <span className="text-foreground font-medium">Travel Rule Required:</span> Deposits of USD {TRAVEL_RULE_THRESHOLD_USD.toLocaleString()} or above require additional compliance information. You will be asked to provide this before proceeding.
                    </>
                  )}
                </p>
                  {state.travelRuleComplete && (
                    <button
                      type="button"
                      onClick={() => {
                        updateState({ mainDepositAmount: amount });
                        navigate("/travel-rule");
                      }}
                      className="text-xs font-medium text-gold hover:text-gold-bright transition-colors"
                    >
                      Edit info
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Amount input */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" /> Deposit Amount
              </Label>
              <div className="relative">
                <Input
                  inputMode="decimal"
                  value={formatInputAmount(amount)}
                  onChange={(e) => handleAmountChange(e.target.value)}
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
                    <span className="text-foreground font-medium">{state.selectedAsset} {formatAssetAmount(mainAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Network Fee</span>
                    <span className="text-foreground font-medium">−{state.selectedAsset} {formatAssetAmount(networkFee)}</span>
                  </div>
                  <div className="border-t border-border/30 pt-2 flex items-center justify-between text-xs">
                    <span className="text-foreground font-semibold">You'll Receive</span>
                    <div className="text-right">
                      <span className="text-gold font-semibold">{state.selectedAsset} {formatAssetAmount(netReceive)}</span>
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
              {state.travelRuleComplete && isTravelRuleRequired
                ? `Continue with ${displayAmount} ${state.selectedAsset}`
                : `Proceed to Send ${displayAmount ? `${displayAmount} ${state.selectedAsset}` : "Deposit"}`}
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
                ? `Scanning for your ${displayAmount} ${state.selectedAsset} deposit...`
                : `${confirmations}/${requiredConfirmations} confirmations`}
            </p>
            {phase === "main_confirming" && (
              <div className="w-full mt-4 flex gap-2">
                {Array.from({ length: requiredConfirmations }, (_, i) => i).map((i) => (
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
              Amount: {displayAmount} {state.selectedAsset} ≈ {getHKDEquivalent(amount, state.selectedAsset)}
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
                {displayAmount} <span className="text-gold">{state.selectedAsset}</span>
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
