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
import { getHKDEquivalent, convertToHKD, formatHKD, getExchangeRate, computeDepositFees, estimatedReceived } from "@/lib/currency";
import { formatNetworkRail, getRequiredConfirmations, requiresTravelRule, TRAVEL_RULE_THRESHOLD_USD } from "@/lib/compliance";
import {
  createCustodyLogs,
  createHexSafeStatus,
  createVaultBalance,
} from "@/lib/hex-safe";
import { depositApi, paymentApi, transactionPackApi } from "@/lib/api";
import { writeDemoDepositSettlement } from "@/lib/demo-deposit-settlement";

type SessionPhase = "verification" | "verification_monitoring" | "verification_confirmed" | "main_input" | "main_monitoring" | "main_confirming";

const VERIFICATION_TRANSFER_AMOUNT = 1;

const toAssetAmountText = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\.?0+$/, "");
};

export default function MainDeposit() {
  const [, navigate] = useLocation();
  const { state, updateState, addTransaction } = useDemo();
  const [phase, setPhase] = useState<SessionPhase>(
    state.testPaymentConfirmed ? "main_input" : "verification"
  );
  const [amount] = useState(state.mainDepositAmount || "");
  const [detectedVerificationAmount, setDetectedVerificationAmount] = useState(
    () => parseFloat(state.verificationTransferAmount) || VERIFICATION_TRANSFER_AMOUNT
  );
  const [detectedVerificationTxHash, setDetectedVerificationTxHash] = useState(state.verificationTxHash || "");
  const [copied, setCopied] = useState(false);
  const [confirmations, setConfirmations] = useState(0);
  const sessionId = useState(() => "sess-" + Date.now())[0];

  // 确认数用 Hex Safe 真实 minBlockConfirmation(选网络时存); 无则回退(仅 demo bypass 路径)。
  const requiredConfirmations = state.selectedMinConfirmations ?? getRequiredConfirmations(state.selectedNetwork);
  const mainAmount = parseFloat(amount) || 0;
  const formatAssetAmount = (value: number, decimals = 2) =>
    value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  const compactAssetAmount = (value: number) =>
    formatAssetAmount(value, Number.isInteger(value) ? 0 : 2);
  const formatInputAmount = (value: string) => {
    if (!value) return "";
    const [whole, decimal] = value.split(".");
    const formattedWhole = Number(whole || "0").toLocaleString("en-US");
    return decimal !== undefined ? `${formattedWhole}.${decimal}` : formattedWhole;
  };
  const remainingTransferAmount = Math.max(mainAmount - detectedVerificationAmount, 0);
  const projectedTransferredAmount = mainAmount > 0
    ? detectedVerificationAmount + remainingTransferAmount
    : 0;
  const overTransferredAmount = Math.max(detectedVerificationAmount - mainAmount, 0);
  const hasRemainingTransfer = remainingTransferAmount > 0;
  // 预估到账 = 实际/预计到账合计 − 网络 Gas 费(用户承担, 2026-07 口径)。
  const netReceive = projectedTransferredAmount > 0 ? estimatedReceived(projectedTransferredAmount) : 0;
  const displayAmount = mainAmount > 0 ? compactAssetAmount(mainAmount) : "";
  const displayVerificationAmount = compactAssetAmount(detectedVerificationAmount);
  const displayRemainingAmount = mainAmount > 0 ? compactAssetAmount(remainingTransferAmount) : "";
  const displayProjectedTransferredAmount = projectedTransferredAmount > 0 ? compactAssetAmount(projectedTransferredAmount) : "";
  const displayOverTransferredAmount = overTransferredAmount > 0 ? compactAssetAmount(overTransferredAmount) : "";

  // Stablecoin demo flow treats the entered deposit amount as USD-equivalent.
  const isTravelRuleRequired = requiresTravelRule(state.selectedAsset, mainAmount);

  const handleCopy = () => {
    navigator.clipboard.writeText(state.depositAddress);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const recordDepositCompletion = (input: {
    totalTransferredAmount: number;
    mainTransferAmount: number;
    addMainTransaction: boolean;
    txHash?: string;
  }) => {
    const totalTransferredAmountText = toAssetAmountText(input.totalTransferredAmount);
    const mainTransferAmountText = toAssetAmountText(input.mainTransferAmount);
    const hexSafeStatus = createHexSafeStatus({
      asset: state.selectedAsset,
      network: state.selectedNetwork,
      amount: input.totalTransferredAmount,
      receivingAddress: state.depositAddress,
      sourceWallet: state.sourceWallet,
      txHash: input.txHash,
    });
    const vaultBalance = createVaultBalance(hexSafeStatus);
    const custodyLogs = createCustodyLogs(hexSafeStatus);
    const now = new Date().toISOString();
    if (!state.depositRequestId) {
      writeDemoDepositSettlement({
        referenceId: `HT-${hexSafeStatus.txHash.slice(2, 12).toUpperCase()}`,
        asset: state.selectedAsset,
        network: state.selectedNetwork || "demo",
        amountDecimal: totalTransferredAmountText,
        sourceWallet: state.sourceWallet,
        depositAddress: state.depositAddress,
        txHash: hexSafeStatus.txHash,
        travelRuleStatus: state.travelRuleStatus,
        screeningStatus: state.screeningPassed ? "pass" : "demo pass",
        verifyStatus: "confirmed",
        status: "pending_marker",
        markerRef: "",
        markerIssuedAt: "",
        receiptRef: "",
        updatedAt: now,
      });
    }
    updateState({
      mainDepositAmount: amount,
      mainDepositConfirmed: true,
      totalTransferredAmount: totalTransferredAmountText,
      hexSafeStatus,
      vaultBalance,
      custodyLogs,
      depositSettlement: {
        status: "pending_marker",
        markerRef: "",
        markerIssuedAt: "",
        receiptRef: "",
      },
    });
    if (input.addMainTransaction && input.mainTransferAmount > 0) {
      addTransaction({
        id: "tx-main-" + Date.now(),
        type: "main",
        asset: state.selectedAsset,
        network: state.selectedNetwork,
        amount: mainTransferAmountText,
        status: "confirmed",
        date: new Date().toISOString(),
        txHash: hexSafeStatus.txHash,
        sessionId,
      });
    }
  };

  // Handle verification step confirmation. Demo can pass any actual on-chain amount.
  const handleVerificationSent = (actualAmount = VERIFICATION_TRANSFER_AMOUNT) => {
    const detectedAmount = Number.isFinite(actualAmount) && actualAmount > 0
      ? actualAmount
      : VERIFICATION_TRANSFER_AMOUNT;
    const detectedAmountText = toAssetAmountText(detectedAmount);
    setDetectedVerificationAmount(detectedAmount);
    setPhase("verification_monitoring");
    updateState({
      testPaymentSent: true,
      verificationTransferAmount: detectedAmountText,
    });
    for (let i = 1; i <= requiredConfirmations; i += 1) {
      setTimeout(() => setConfirmations(i), 1200 + i * 650);
    }
    const verifyTxHash =
      "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    setTimeout(() => {
      setConfirmations(requiredConfirmations);
      setPhase("verification_confirmed");
      setDetectedVerificationTxHash(verifyTxHash);
      updateState({
        testPaymentConfirmed: true,
        verificationTransferAmount: detectedAmountText,
        verificationTxHash: verifyTxHash,
      });
      // 真实: 有后端入金单 → 确认 1 USDT 到账, 后端把来源钱包写入 verified_wallets(退款①只能退这些)。
      if (state.depositRequestId) {
        depositApi.confirmTest(state.depositRequestId, verifyTxHash).catch(() => {});
      }
      // ⑦ Host-led admission: 验证款(1 USDT)的独立 basic pack 记录转账。
      if (state.paymentIntentId && state.compliancePackId) {
        transactionPackApi
          .recordTransfer(state.compliancePackId, { txHash: verifyTxHash, status: "confirmed" })
          .catch(() => {});
      }
      addTransaction({
        id: "tx-test-" + Date.now(),
        type: "test",
        asset: state.selectedAsset,
        network: state.selectedNetwork,
        amount: detectedAmountText,
        status: "confirmed",
        date: new Date().toISOString(),
        txHash: verifyTxHash,
        sessionId,
      });
    }, 1600 + requiredConfirmations * 650);
  };

  // ⑦ Host-led admission: 主款按实际金额创建独立 main pack(KYT+TR 通过后发址并记录转账)。
  const recordMainPack = async (mainAmount: string) => {
    if (!state.paymentIntentId) return;
    try {
      const mainHkd = Math.round((parseFloat(mainAmount) || 0) * 7.8);
      const packRes = await paymentApi.createPack(state.paymentIntentId, {
        transferLeg: "main",
        actualAmount: mainAmount,
        actualHkdAmount: String(mainHkd),
      });
      const mainPackId = packRes.data.pack.id;
      await transactionPackApi.screen(mainPackId);
      await transactionPackApi.issueAddress(mainPackId);
      const txHash =
        "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
      await transactionPackApi.recordTransfer(mainPackId, { txHash, status: "confirmed" });
      updateState({ compliancePackId: mainPackId });
    } catch {
      /* 后端不可用/gate 未过 → 回退 legacy flow */
    }
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
    // 真实: 回填计划总入金金额 + Travel Rule 状态(≥USD1k 后端标记 TR required)。
    if (state.depositRequestId) {
      depositApi.main(state.depositRequestId, amount, state.travelRuleStatus).catch(() => {});
    }
    // ⑦ Host-led admission: 主款(按实际金额)创建独立 main pack, screen + 发址 + 记录转账。
    void recordMainPack(amount);
    setPhase("main_monitoring");
    setConfirmations(0);

    setTimeout(() => setPhase("main_confirming"), 3000);
    for (let i = 1; i <= requiredConfirmations; i += 1) {
      setTimeout(() => setConfirmations(i), 3000 + i * 650);
    }
    setTimeout(() => {
      setConfirmations(requiredConfirmations);
      recordDepositCompletion({
        totalTransferredAmount: detectedVerificationAmount + remainingTransferAmount,
        mainTransferAmount: remainingTransferAmount,
        addMainTransaction: true,
      });
      navigate("/deposit-success");
    }, 3400 + requiredConfirmations * 650);
  };

  const handleNoSecondTransferNeeded = () => {
    if (isTravelRuleRequired && !state.travelRuleComplete) {
      updateState({ mainDepositAmount: amount });
      navigate("/travel-rule");
      return;
    }
    if (state.depositRequestId) {
      depositApi.main(state.depositRequestId, amount, state.travelRuleStatus).catch(() => {});
    }
    void recordMainPack(amount);
    toast.success("No second transfer required", {
      description: `${displayVerificationAmount} ${state.selectedAsset} has already been detected.`,
    });
    recordDepositCompletion({
      totalTransferredAmount: detectedVerificationAmount,
      mainTransferAmount: 0,
      addMainTransaction: false,
      txHash: detectedVerificationTxHash || state.verificationTxHash,
    });
    navigate("/deposit-success");
  };

  const proceedToMainDeposit = () => {
    setPhase("main_input");
    setConfirmations(0);
  };

  // 容错: 客户忽略 1 USDT 提示、直接发全额 —— Hex Trust 到账检测仍识别并接受, 不失败。
  // 视作已验证 + 直接按已填金额(state.mainDepositAmount)进主入金监听/确认。
  const handleFullAmountDetected = () => {
    toast.message("Full deposit detected", {
      description: "You sent the full amount without the 1 USDT test — we've detected and accepted it.",
    });
    handleVerificationSent(mainAmount || VERIFICATION_TRANSFER_AMOUNT);
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
          {(phase === "main_input" || phase === "main_monitoring" || phase === "main_confirming") && (
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
                    Recommended: send exactly <span className="text-gold font-semibold">1 {state.selectedAsset}</span> to the address below. If a different amount arrives, HyperTransfer will use the actual received amount to calculate the remaining transfer.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Deposit address */}
            <div className="card-gold rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Send recommended 1 {state.selectedAsset} to this address
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
              onClick={() => handleVerificationSent()}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              Confirm I've Sent 1&nbsp;{state.selectedAsset}
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => handleVerificationSent(100)}
              className="w-full rounded-xl border border-gold/30 bg-gold/5 py-3 text-xs font-semibold text-gold transition-colors hover:bg-gold/10"
            >
              Demo: simulate user sent 100&nbsp;{state.selectedAsset}
            </button>

            {/* 容错: 忽略提示直接发全额也能被识别接受, 不失败 */}
            <button
              onClick={handleFullAmountDetected}
              className="w-full py-1 text-center text-[11px] text-muted-foreground/70 hover:text-gold transition-colors"
            >
              Sent the full amount already? We&apos;ll still detect &amp; accept it →
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
              Confirming the actual received amount: {displayVerificationAmount} {state.selectedAsset}...
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
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Step 1 done — actual received amount is <span className="text-gold font-semibold">{displayVerificationAmount} {state.selectedAsset}</span>.
                {displayAmount && hasRemainingTransfer
                  ? <> Now send the <span className="text-gold font-semibold">remaining {displayRemainingAmount} {state.selectedAsset}</span> in Step 2.</>
                  : <> This transfer covers the planned amount. No second transfer is required.</>}
              </p>
              {overTransferredAmount > 0 && (
                <p className="mt-2 text-[10px] text-warning">
                  Over planned amount by {displayOverTransferredAmount} {state.selectedAsset}; operations can review the excess during settlement.
                </p>
              )}
            </motion.div>

            <button
              onClick={hasRemainingTransfer ? proceedToMainDeposit : handleNoSecondTransferNeeded}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              {hasRemainingTransfer
                ? `Continue — send ${displayRemainingAmount} ${state.selectedAsset}`
                : "Continue — no second transfer needed"}
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
                  <span className="text-foreground font-medium">Step 2: Remaining Transfer</span> — The actual Step 1 transfer counts toward the total deposit. Send only the remaining amount shown below.
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
                <DollarSign className="w-3 h-3" /> Remaining Deposit Amount
              </Label>
              <div className="relative">
                <Input
                  inputMode="decimal"
                  value={formatInputAmount(toAssetAmountText(remainingTransferAmount))}
                  readOnly
                  placeholder="0.00"
                  className="h-14 rounded-xl border-border bg-input pr-16 text-lg font-semibold"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gold font-medium">
                  {state.selectedAsset}
                </span>
              </div>
              {mainAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatHKD(convertToHKD(remainingTransferAmount, state.selectedAsset))}
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
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Deposit Summary</p>
                <div className="space-y-2">
                  {/* 汇率(Hex Trust API, demo 值) —— 以 HKD 展示(非 MOP) */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Exchange rate · Hex Trust</span>
                    <span className="text-foreground">1 {state.selectedAsset} ≈ {formatHKD(getExchangeRate(state.selectedAsset === "USDC" ? "USD" : "USDT", "HKD"))}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total planned deposit</span>
                    <span className="text-foreground font-medium">
                      {state.selectedAsset} {formatAssetAmount(mainAmount)} · {formatHKD(convertToHKD(mainAmount, state.selectedAsset))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Actual received in Step 1</span>
                    <span className="text-foreground">
                      {state.selectedAsset} {formatAssetAmount(detectedVerificationAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Remaining to send</span>
                    <span className="text-gold font-semibold">
                      {state.selectedAsset} {formatAssetAmount(remainingTransferAmount)}
                    </span>
                  </div>
                  {overTransferredAmount > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Over planned amount</span>
                      <span className="text-warning font-medium">
                        {state.selectedAsset} {formatAssetAmount(overTransferredAmount)}
                      </span>
                    </div>
                  )}

                  {/* 费用明细(确认前展示) */}
                  <div className="border-t border-border/30 pt-2 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Fees</p>
                    {computeDepositFees().map((f) => (
                      <div key={f.key} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className={f.deducted ? "text-foreground" : "text-muted-foreground"}>
                          {f.deducted ? "−" : ""}{f.unit === "USD" ? `$${f.amount.toFixed(2)}` : `${f.amount} ${f.unit}`} · {formatHKD(f.hkd)}
                          {f.note ? <span className="text-muted-foreground/50"> · {f.note}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border/30 pt-2 flex items-center justify-between text-xs">
                    <span className="text-foreground font-semibold">Estimated received</span>
                    <div className="text-right">
                      <span className="text-gold font-semibold">{state.selectedAsset} {formatAssetAmount(netReceive)}</span>
                      <p className="text-[10px] text-muted-foreground">Based on actual/expected total {displayProjectedTransferredAmount} {state.selectedAsset}</p>
                      <p className="text-[10px] text-muted-foreground">≈ {formatHKD(convertToHKD(netReceive, state.selectedAsset))}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">
                    Network gas fee is currently borne by the customer and deducted from the amount received.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Deposit address reminder */}
            <div className="card-gold rounded-xl p-4 space-y-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Verified receiving address
              </p>
              <div className="bg-input rounded-lg px-3 py-2">
                <code className="block font-mono text-[10px] text-gold break-all">
                  {state.depositAddress}
                </code>
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                Same verified address from Step 1 &middot; {formatNetworkRail(state.selectedNetwork)} network only
              </p>
            </div>

            <button
              onClick={hasRemainingTransfer ? () => handleMainDepositSent() : handleNoSecondTransferNeeded}
              disabled={!amount || mainAmount <= 0}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {hasRemainingTransfer
                ? state.travelRuleComplete && isTravelRuleRequired
                  ? `Continue with ${displayRemainingAmount} ${state.selectedAsset}`
                  : `Proceed to Send ${displayRemainingAmount} ${state.selectedAsset}`
                : "Continue — no second transfer needed"}
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
                ? `Scanning for your remaining ${displayRemainingAmount} ${state.selectedAsset} transfer...`
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
              Step 1 actual: {displayVerificationAmount} {state.selectedAsset} · Remaining transfer: {displayRemainingAmount} {state.selectedAsset} · Planned: {displayAmount} {state.selectedAsset}
            </p>
          </motion.div>
        )}
      </div>
    </Shell>
  );
}
