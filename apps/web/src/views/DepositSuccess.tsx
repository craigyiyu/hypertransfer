/**
 * DepositSuccess — Final confirmation screen after a successful deposit session.
 * Shows summary with HKD equivalent and next steps.
 */
import { useEffect, useState } from "react";
import { useLocation } from "@/lib/wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Banknote } from "lucide-react";
import { getHKDEquivalent, formatHKD, convertToHKD, estimatedReceived, DEPOSIT_FEE_MODEL } from "@/lib/currency";
import { formatNetworkRail, blockExplorerTxUrl } from "@/lib/compliance";
import { depositApi, type DepositRecord } from "@/lib/api";
import { ExternalLink } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import {
  DEMO_DEPOSIT_SETTLEMENT_EVENT,
  readDemoDepositSettlement,
  type DemoDepositSettlementRecord,
} from "@/lib/demo-deposit-settlement";

const SUCCESS_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/success-illustration-eEvN4zYtHrbHQ2jjhx3ZrM.webp";

const formatAssetAmount = (value: number, decimals = 2) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const FALLBACK_SETTLEMENT = {
  status: "pending_marker" as const,
  markerRef: "",
  markerIssuedAt: "",
  receiptRef: "",
};

export default function DepositSuccess() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const { state } = useDemo();
  const [depositRecord, setDepositRecord] = useState<DepositRecord | null>(null);
  const [demoRecord, setDemoRecord] = useState<DemoDepositSettlementRecord | null>(() => readDemoDepositSettlement());

  const selectedAsset = state.selectedAsset || demoRecord?.asset || "USDT";
  const selectedNetwork = state.selectedNetwork || demoRecord?.network || "demo";
  const mainDepositAmount = state.mainDepositAmount || demoRecord?.amountDecimal || "";
  const plannedAmount = parseFloat(mainDepositAmount) || 0;
  const actualTransferredAmount = state.totalTransferredAmount || demoRecord?.amountDecimal || mainDepositAmount;
  const depositAmount = parseFloat(actualTransferredAmount) || 0;
  // 到账 = 存入额 − 网络 Gas 费(用户承担, 2026-07 口径)。
  const netReceive = depositAmount > 0 ? estimatedReceived(depositAmount) : 0;
  const gasFee = depositAmount > 0 ? Math.min(DEPOSIT_FEE_MODEL.networkGasFeeUsdt, depositAmount) : 0;
  const displayDepositAmount = depositAmount > 0
    ? formatAssetAmount(depositAmount, 0)
    : actualTransferredAmount;
  const displayPlannedAmount = plannedAmount > 0
    ? formatAssetAmount(plannedAmount, 0)
    : mainDepositAmount;
  const actualDiffersFromPlanned = plannedAmount > 0 && depositAmount > 0 && Math.abs(plannedAmount - depositAmount) > 0.000001;

  // 完成页对账信息: 链上交易哈希 + reference/transaction ID(供对账 + HK marketing 出 marker)。
  const mainTx = state.transactions.find(
    (tx) => tx.type === "main" && (tx.status === "confirmed" || tx.status === "cleared"),
  );
  const txHash = state.hexSafeStatus?.txHash || mainTx?.txHash || demoRecord?.txHash || "";
  const referenceId = state.depositRequestId || demoRecord?.referenceId || (txHash ? "HT-" + txHash.slice(2, 12).toUpperCase() : "—");
  const shortHash = txHash ? `${txHash.slice(0, 10)}…${txHash.slice(-8)}` : "—";
  const explorerUrl = blockExplorerTxUrl(selectedNetwork, txHash);
  const localSettlement = state.depositSettlement ?? FALLBACK_SETTLEMENT;
  const markerRef = depositRecord?.markerRef || demoRecord?.markerRef || localSettlement.markerRef;
  const receiptRef = depositRecord?.receiptRef || demoRecord?.receiptRef || localSettlement.receiptRef;
  const settlementSettled =
    Boolean(markerRef) ||
    depositRecord?.status === "settled" ||
    demoRecord?.status === "settled" ||
    localSettlement.status === "settled";
  const settlementText = settlementSettled
    ? `Settled${markerRef ? ` · ${markerRef}` : receiptRef ? ` · ${receiptRef}` : ""}`
    : "In progress · pending marker";
  const SettlementIcon = settlementSettled ? CheckCircle2 : Clock;
  const settlementClass = settlementSettled ? "text-success" : "text-gold";
  const nextStepCopy = settlementSettled
    ? t("depositSuccess.settledMarker")
    : t("depositSuccess.pendingMarker");

  useEffect(() => {
    if (!state.depositRequestId) {
      setDepositRecord(null);
      return;
    }

    let alive = true;
    const loadDeposit = async () => {
      try {
        const { data } = await depositApi.get(state.depositRequestId);
        if (alive) setDepositRecord(data.deposit);
      } catch {
        if (alive) setDepositRecord(null);
      }
    };

    void loadDeposit();
    const timer = window.setInterval(loadDeposit, 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [state.depositRequestId]);

  useEffect(() => {
    const syncDemoRecord = () => setDemoRecord(readDemoDepositSettlement());
    const timer = window.setInterval(syncDemoRecord, 3000);
    window.addEventListener("storage", syncDemoRecord);
    window.addEventListener(DEMO_DEPOSIT_SETTLEMENT_EVENT, syncDemoRecord);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", syncDemoRecord);
      window.removeEventListener(DEMO_DEPOSIT_SETTLEMENT_EVENT, syncDemoRecord);
    };
  }, []);

  return (
    <Shell showProgress={false}>
      <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
        {/* Success illustration */}
        <motion.img
          src={SUCCESS_IMG}
          alt={t("depositSuccess.success")}
          className="w-24 h-24 mb-6"
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
        />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <h1 className="text-xl font-bold text-foreground">{t("depositSuccess.title")}</h1>
          <p className="text-sm text-muted-foreground max-w-[280px]">
            Your {displayDepositAmount} {selectedAsset} deposit has been confirmed and is being processed.
          </p>
          <p className="text-xs text-gold">
            ≈ {getHKDEquivalent(actualTransferredAmount, selectedAsset)}
          </p>
        </motion.div>

        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full card-gold rounded-xl p-5 mt-8 space-y-3"
        >
          {actualDiffersFromPlanned && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("depositSuccess.plannedAmount")}</span>
                <span className="text-foreground font-semibold">
                  {displayPlannedAmount} {selectedAsset}
                </span>
              </div>
              <div className="h-px bg-border" />
            </>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("depositSuccess.amountSent")}</span>
            <span className="text-foreground font-semibold">
              {displayDepositAmount} {selectedAsset}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("depositSuccess.credited")}</span>
            <div className="text-right">
              <span className="text-gold font-semibold">{formatAssetAmount(netReceive)} {selectedAsset}</span>
              <p className="text-[10px] text-muted-foreground">≈ {formatHKD(convertToHKD(netReceive, selectedAsset))}</p>
              <p className="text-[10px] text-warning">
                Gas fee deducted: -{formatAssetAmount(gasFee)} {selectedAsset} · ≈ {formatHKD(convertToHKD(gasFee, selectedAsset))}
              </p>
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("depositSuccess.network")}</span>
            <span className="text-foreground">{formatNetworkRail(selectedNetwork)}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground shrink-0">{t("depositSuccess.transactionHash")}</span>
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-gold underline decoration-dotted truncate hover:text-gold-bright"
              >
                {shortHash} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
            ) : (
              <span className="font-mono text-[10px] text-foreground truncate">{shortHash}</span>
            )}
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground shrink-0">{t("depositSuccess.referenceId")}</span>
            <span className="font-mono text-[11px] text-gold">{referenceId}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("depositSuccess.paymentStatus")}</span>
            <span className="text-success flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {t("depositSuccess.received")}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{t("depositSuccess.settlement")}</span>
            <span className={`${settlementClass} flex min-w-0 items-center justify-end gap-1`}>
              <SettlementIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">{settlementText}</span>
            </span>
          </div>
        </motion.div>

        {/* Next steps */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full card-wine rounded-xl px-4 py-3 mt-4"
        >
          <div className="flex items-start gap-3">
            <Banknote className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-xs text-foreground font-medium">{t("depositSuccess.whatHappensNext")}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {nextStepCopy}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="space-y-3 pb-4">
        <button
          onClick={() => navigate("/new-deposit")}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold"
        >
          {t("depositSuccess.makeAnotherDeposit")}
        </button>
      </div>
    </Shell>
  );
}
