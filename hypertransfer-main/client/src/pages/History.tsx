/**
 * History — Transaction history page. Shows all past deposit sessions.
 * Groups test + main deposits by session with resumption capability.
 */
import { useLocation } from "wouter";
import { useDemo, type Transaction } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, ArrowUpRight, Play, ChevronDown, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { canProceedToDeposit } from "@/lib/kyc-status";
import { formatAssetAmount } from "@/lib/currency";
import { formatNetworkRail } from "@/lib/compliance";
import { useI18n } from "@/contexts/I18nContext";
import {
  DEMO_DEPOSIT_SETTLEMENT_EVENT,
  readDemoDepositSettlement,
  type DemoDepositSettlementRecord,
} from "@/lib/demo-deposit-settlement";

type HistoryStatus = "pending" | "deposit_completed" | "settled" | "failed";
type HistoryFilter = "all" | "pending" | "deposit_completed" | "settled";

interface SessionGroup {
  sessionId: string;
  asset: string;
  network: string;
  status: HistoryStatus;
  totalAmount: string;
  testTx?: Transaction;
  mainTx?: Transaction;
  createdAt: string;
  completedAt?: string;
  markerRef?: string;
  markerIssuedAt?: string;
  referenceId?: string;
  receiptRef?: string;
}

const statusLabels: Record<HistoryStatus, string> = {
  pending: "WIP",
  deposit_completed: "Transferred",
  settled: "Settled",
  failed: "Failed",
};

const filterLabels: Record<HistoryFilter, string> = {
  all: "All",
  pending: "WIP",
  deposit_completed: "Transferred",
  settled: "Settled",
};

const isTxComplete = (tx?: Transaction) => tx?.status === "confirmed" || tx?.status === "cleared";

const referenceIdFromTx = (tx?: Transaction) =>
  tx?.txHash ? `HT-${tx.txHash.slice(2, 12).toUpperCase()}` : "";

const demoSettlementMatchesSession = (record: DemoDepositSettlementRecord | null, session: SessionGroup) => {
  if (!record || !session.mainTx) return false;
  const referenceId = referenceIdFromTx(session.mainTx);
  return Boolean(
    (record.txHash && record.txHash === session.mainTx.txHash) ||
      (record.referenceId && referenceId && record.referenceId === referenceId),
  );
};

export default function History() {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const { state } = useDemo();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<HistoryFilter>("all");
  const [demoSettlement, setDemoSettlement] = useState<DemoDepositSettlementRecord | null>(() =>
    readDemoDepositSettlement(),
  );
  const canDeposit = canProceedToDeposit(state.kyc);

  // Map known statuses to translated labels; fall back to English for statuses
  // without a translation key (e.g. "pending"/"WIP", "deposit_completed").
  const localStatusLabel = (status: HistoryStatus): string => {
    if (status === "settled") return t("history.transferType.settled");
    if (status === "deposit_completed") return t("history.transferType.transferred");
    if (status === "failed") return t("history.transferType.failed");
    return statusLabels[status];
  };
  const localFilterLabel = (filter: HistoryFilter): string => {
    if (filter === "settled") return t("history.transferType.settled");
    if (filter === "deposit_completed") return t("history.transferType.transferred");
    return filterLabels[filter];
  };

  useEffect(() => {
    const syncDemoSettlement = () => setDemoSettlement(readDemoDepositSettlement());
    window.addEventListener("storage", syncDemoSettlement);
    window.addEventListener(DEMO_DEPOSIT_SETTLEMENT_EVENT, syncDemoSettlement);
    return () => {
      window.removeEventListener("storage", syncDemoSettlement);
      window.removeEventListener(DEMO_DEPOSIT_SETTLEMENT_EVENT, syncDemoSettlement);
    };
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const baseSessions: SessionGroup[] = state.transactions.reduce((acc: SessionGroup[], tx) => {
    const existing = acc.find((s) => s.sessionId === tx.sessionId);
    if (existing) {
      if (tx.type === "test") existing.testTx = tx;
      if (tx.type === "main") existing.mainTx = tx;
      if (tx.type === "main") existing.totalAmount = tx.amount;
      if (tx.status === "failed") existing.status = "failed";
      if (tx.type === "main" && isTxComplete(tx)) {
        existing.status = "deposit_completed";
        existing.completedAt = tx.date;
      }
    } else {
      acc.push({
        sessionId: tx.sessionId,
        asset: tx.asset,
        network: tx.network,
        status: tx.type === "main" && isTxComplete(tx) ? "deposit_completed" : tx.status === "failed" ? "failed" : "pending",
        totalAmount: tx.amount,
        [tx.type === "test" ? "testTx" : "mainTx"]: tx,
        createdAt: tx.date,
        completedAt: tx.type === "main" && isTxComplete(tx) ? tx.date : undefined,
      });
    }
    return acc;
  }, []);

  const hasDemoSettlementSession = Boolean(
    demoSettlement && baseSessions.some((session) => demoSettlementMatchesSession(demoSettlement, session)),
  );
  const sessionsWithDemoRecord: SessionGroup[] =
    demoSettlement && !hasDemoSettlementSession
      ? [
          {
            sessionId: demoSettlement.referenceId || demoSettlement.txHash || "HT-DEMO-DEPOSIT",
            asset: demoSettlement.asset,
            network: demoSettlement.network,
            status: demoSettlement.markerRef || demoSettlement.status === "settled" ? "settled" : "deposit_completed",
            totalAmount: demoSettlement.amountDecimal,
            mainTx: {
              id: `tx-${demoSettlement.referenceId || "demo-deposit"}`,
              type: "main",
              asset: demoSettlement.asset,
              network: demoSettlement.network,
              amount: demoSettlement.amountDecimal,
              status: "confirmed",
              date: demoSettlement.updatedAt || demoSettlement.markerIssuedAt || new Date().toISOString(),
              txHash: demoSettlement.txHash,
              sessionId: demoSettlement.referenceId || demoSettlement.txHash || "HT-DEMO-DEPOSIT",
            },
            createdAt: demoSettlement.updatedAt || demoSettlement.markerIssuedAt || new Date().toISOString(),
            completedAt: demoSettlement.updatedAt || demoSettlement.markerIssuedAt || undefined,
          },
          ...baseSessions,
        ]
      : baseSessions;

  const firstMainSessionId = sessionsWithDemoRecord.find((session) => session.mainTx)?.sessionId;
  const groupedSessions: SessionGroup[] = sessionsWithDemoRecord.map((session) => {
    const mainReferenceId = referenceIdFromTx(session.mainTx);
    const demoRecordMatches = demoSettlementMatchesSession(demoSettlement, session);
    const shouldUseDemoSettlement =
      demoRecordMatches || (Boolean(demoSettlement?.markerRef) && session.sessionId === firstMainSessionId);
    const shouldUseContextSettlement =
      Boolean(state.depositSettlement?.markerRef || state.depositSettlement?.status === "settled") &&
      session.sessionId === firstMainSessionId;
    const markerRef = shouldUseDemoSettlement
      ? demoSettlement?.markerRef
      : shouldUseContextSettlement
      ? state.depositSettlement.markerRef
      : "";
    const settlementStatus = shouldUseDemoSettlement
      ? demoSettlement?.status
      : shouldUseContextSettlement
      ? state.depositSettlement.status
      : "";
    const status: HistoryStatus =
      markerRef || settlementStatus === "settled"
        ? "settled"
        : session.status === "failed"
        ? "failed"
        : isTxComplete(session.mainTx)
        ? "deposit_completed"
        : "pending";

    return {
      ...session,
      status,
      markerRef: markerRef || undefined,
      markerIssuedAt: shouldUseDemoSettlement ? demoSettlement?.markerIssuedAt : state.depositSettlement?.markerIssuedAt,
      receiptRef: shouldUseDemoSettlement ? demoSettlement?.receiptRef : state.depositSettlement?.receiptRef,
      referenceId: shouldUseDemoSettlement ? demoSettlement?.referenceId || mainReferenceId : mainReferenceId,
    };
  });

  const filteredSessions = groupedSessions.filter((session) =>
    statusFilter === "all" ? true : session.status === statusFilter,
  );

  const statusIcon = (status: HistoryStatus) => {
    switch (status) {
      case "settled":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "deposit_completed":
        return <CheckCircle2 className="w-4 h-4 text-gold" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const statusColor = (status: HistoryStatus | Transaction["status"]) => {
    switch (status) {
      case "settled":
      case "confirmed":
      case "cleared":
        return "text-success";
      case "deposit_completed":
        return "text-gold";
      case "failed":
        return "text-destructive";
      default:
        return "text-warning";
    }
  };

  const handleResumeSession = (session: SessionGroup) => {
    if (session.status === "pending" && session.testTx) {
      // Resume at main deposit step
      navigate("/main-deposit");
    } else if (session.status === "pending") {
      // Resume at test payment step
      navigate("/test-payment");
    }
  };

  const handleMakeDeposit = () => {
    if (canDeposit) {
      navigate("/new-deposit");
      return;
    }

    toast.error(t("history.accountOnHold"), {
      description: t("history.kycRequired"),
      action: {
        label: t("history.startKyc"),
        onClick: () => navigate("/kyc"),
      },
    });
  };

  const formatSessionAmount = (amount: string, isTestDeposit = false) =>
    formatAssetAmount(amount, isTestDeposit ? 2 : 0);

  return (
    <Shell
      showBack
      backTo="/dashboard"
      compactContent
      title={t("history.title")}
      subtitle={state.patronName ? `${state.patronName} · ${t("history.subtitle").toLowerCase()}` : t("history.subtitle")}
    >
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {(["all", "pending", "deposit_completed", "settled"] as HistoryFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === filter ? "bg-gold/10 text-gold" : "text-muted-foreground hover:text-gold"
              }`}
            >
              {localFilterLabel(filter)}
            </button>
          ))}
        </div>

        {/* Session list */}
        {filteredSessions.length === 0 ? (
          <div className="card-gold rounded-xl p-12 flex flex-col items-center text-center">
            <ArrowUpRight className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === "all" ? t("history.noTransactions") : `No ${localFilterLabel(statusFilter)} transactions`}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {statusFilter === "all"
                ? t("history.historyEmpty")
                : t("history.noFilterResults")}
            </p>
            {statusFilter === "all" && (
              <button
                onClick={handleMakeDeposit}
                className="mt-4 px-4 py-2 rounded-lg bg-gold/10 text-gold text-xs font-medium hover:bg-gold/20 transition-colors"
              >
                {t("history.makeDeposit")}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session, i) => (
              <motion.div
                key={session.sessionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card-gold rounded-xl overflow-hidden"
              >
                {/* Session header */}
                <button
                  onClick={() => setExpandedSession(expandedSession === session.sessionId ? null : session.sessionId)}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {statusIcon(session.status)}
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {session.asset} on {formatNetworkRail(session.network)}
                        </p>
                        <span className={`text-xs font-medium ${statusColor(session.status)}`}>
                          {localStatusLabel(session.status)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {formatSessionAmount(session.totalAmount, !session.mainTx)} {session.asset} • {formatDate(session.createdAt)}
                      </p>
                      {session.markerRef && (
                        <p className="mt-0.5 truncate text-xs text-gold">
                          {t("history.markerRef")} <span className="font-mono">{session.markerRef}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Resume button or expand icon */}
                  {session.status === "pending" ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResumeSession(session);
                      }}
                      className="ml-2 px-3 py-1.5 rounded-lg bg-gold/10 text-gold text-xs font-medium hover:bg-gold/20 transition-colors flex items-center gap-1.5 flex-shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      {t("history.resume")}
                    </button>
                  ) : (
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${
                        expandedSession === session.sessionId ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </button>

                {/* Session details (expanded) */}
                {expandedSession === session.sessionId && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 py-4 border-t border-border/30 space-y-3"
                  >
                    {/* Test transaction */}
                    {session.testTx && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {t("history.testDeposit")}
                        </p>
                        <div className="grid grid-cols-2 gap-y-2 text-xs">
                          <div>
                            <p className="text-muted-foreground/60">{t("history.amount")}</p>
                            <p className="text-foreground font-medium">
                              {formatSessionAmount(session.testTx.amount, true)} {session.testTx.asset}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground/60">{t("history.status")}</p>
                            <p className={`font-medium capitalize ${statusColor(session.testTx.status)}`}>
                              {session.testTx.status}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-muted-foreground/60">{t("history.transactionHash")}</p>
                            <p className="font-mono text-[10px] text-gold truncate">
                              {session.testTx.txHash}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Main transaction */}
                    {session.mainTx && (
                      <>
                        <div className="h-px bg-border/30" />
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {t("history.mainDeposit")}
                          </p>
                          <div className="grid grid-cols-2 gap-y-2 text-xs">
                            <div>
                              <p className="text-muted-foreground/60">{t("history.amount")}</p>
                              <p className="text-foreground font-medium">
                                {formatSessionAmount(session.mainTx.amount)} {session.mainTx.asset}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground/60">{t("history.status")}</p>
                              <p className={`font-medium ${statusColor(session.status)}`}>
                                {localStatusLabel(session.status)}
                              </p>
                            </div>
                            {session.referenceId && (
                              <div className="col-span-2">
                                <p className="text-muted-foreground/60">{t("history.referenceId")}</p>
                                <p className="font-mono text-[10px] text-gold truncate">
                                  {session.referenceId}
                                </p>
                              </div>
                            )}
                            <div className="col-span-2">
                              <p className="text-muted-foreground/60">{t("history.transactionHash")}</p>
                              <p className="font-mono text-[10px] text-gold truncate">
                                {session.mainTx.txHash}
                              </p>
                            </div>
                            {session.markerRef && (
                              <div className="col-span-2">
                                <p className="text-muted-foreground/60">{t("history.markerReference")}</p>
                                <p className="font-mono text-[10px] text-success truncate">
                                  {session.markerRef}
                                </p>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => navigate("/refund")}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 py-2 text-xs font-semibold text-foreground transition-colors hover:border-gold/30 hover:text-gold"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                            {t("history.requestWithdrawal")}
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
