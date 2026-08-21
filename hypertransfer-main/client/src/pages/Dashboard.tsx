/**
 * Dashboard — Main account hub. Shows account status and recent transfer activity.
 * Design: Dark canvas, gold accents, single-column layout.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  HelpCircle,
  Lock,
  ChevronDown,
} from "lucide-react";
import { formatAssetAmount } from "@/lib/currency";
import SessionRecovery from "@/components/SessionRecovery";
import { useState, useEffect } from "react";
import { formatNetworkRail } from "@/lib/compliance";
import { admissionApi } from "@/lib/api";
import { ADMISSION_STATUS_LABELS } from "@/lib/admission-case";
import type { AdmissionCaseStatus } from "@/lib/admission-case";
import { getCaseAwareKYCEligibility } from "@/lib/kyc-status";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { state } = useDemo();
  const [dismissedSessions, setDismissedSessions] = useState<string[]>([]);
  const [expandedTxId, setExpandedTxId] = useState("");
  // Case-aware: 被绑定的 admission case 决定"正确下一步"(入金只在 service_enabled + KYC 有效时)。
  const [caseStatus, setCaseStatus] = useState<AdmissionCaseStatus | undefined>(undefined);
  const [caseKycValidUntil, setCaseKycValidUntil] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    admissionApi
      .patronMine()
      .then((res) => {
        if (cancelled) return;
        setCaseStatus(res.data.case.status);
        setCaseKycValidUntil(res.data.case.kycValidUntil ?? undefined);
      })
      .catch(() => {
        if (cancelled) return;
        setCaseStatus(undefined); // 未绑定 case -> 沿用 demo/KYC 状态
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const caseEligibility = getCaseAwareKYCEligibility({ caseStatus, kycValidUntil: caseKycValidUntil });

  const accountStatus = (() => {
    // Case-aware: 已绑定 admission case 时, 入金只在 service_enabled + KYC 有效时开放。
    if (caseStatus && caseStatus !== "service_enabled") {
      if (caseStatus === "kyc_passed" || caseStatus === "payment_precheck" || caseStatus === "leader_pending") {
        return {
          label: ADMISSION_STATUS_LABELS[caseStatus],
          description: "Your VIP admission is with the leader for final approval.",
          icon: Clock,
          color: "text-warning",
          bg: "bg-warning/10",
          action: "View Status",
          path: "/kyc-status",
        };
      }
      return {
        label: ADMISSION_STATUS_LABELS[caseStatus],
        description: caseEligibility.blockerMessage || "Your admission is being prepared.",
        icon: AlertCircle,
        color: "text-warning",
        bg: "bg-warning/10",
        action: caseEligibility.canRetryKYC ? "Complete Verification" : "View Status",
        path: caseEligibility.canRetryKYC ? "/kyc" : "/kyc-status",
      };
    }
    switch (state.kyc.status) {
      case "approved":
        return {
          label: "Verified",
          description: "Your identity verification is complete.",
          icon: CheckCircle2,
          color: "text-success",
          bg: "bg-success/10",
          action: "New Deposit",
          path: "/new-deposit",
        };
      case "pending":
        return {
          label: "Under review",
          description: "Your documents are being reviewed.",
          icon: Clock,
          color: "text-warning",
          bg: "bg-warning/10",
          action: "View Review Status",
          path: "/kyc-status",
        };
      case "rejected":
        return {
          label: "Rejected",
          description: "Please update your verification information.",
          icon: AlertCircle,
          color: "text-destructive",
          bg: "bg-destructive/10",
          action: "Update KYC",
          path: "/kyc",
        };
      default:
        return {
          label: "Not verified",
          description: "Complete identity verification before making a deposit.",
          icon: Lock,
          color: "text-destructive",
          bg: "bg-destructive/10",
          action: "Start KYC Verification",
          path: "/kyc",
        };
    }
  })();
  const AccountStatusIcon = accountStatus.icon;

  const pendingTx = state.transactions.filter((t) => t.status === "pending").length;
  const isSettlementSettled = Boolean(state.depositSettlement?.markerRef || state.depositSettlement?.status === "settled");
  const formatTransferDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const transferStatusLabel = (tx: (typeof state.transactions)[number]) => {
    if (tx.status === "failed") return "Rejected";
    if (tx.status === "pending") return "WIP";
    if (tx.type === "main" && isSettlementSettled) return "Settled";
    return "Transferred";
  };
  const transferStatusClass = (label: string) => {
    if (label === "Settled" || label === "Transferred") return "text-success";
    if (label === "Rejected") return "text-destructive";
    return "text-warning";
  };
  const referenceIdFromTx = (txHash: string) =>
    txHash ? `HT-${txHash.slice(2, 12).toUpperCase()}` : "WIP";

  // Find incomplete sessions for recovery
  const incompleteSessions = state.transactions
    .filter((t) => t.status === "pending" && !dismissedSessions.includes(t.sessionId))
    .reduce((acc: any[], tx) => {
      const existing = acc.find((s) => s.sessionId === tx.sessionId);
      if (!existing) {
        acc.push({
          sessionId: tx.sessionId,
          asset: tx.asset,
          network: tx.network,
          step: tx.type === "test" ? "test-payment" : "main-deposit",
          createdAt: tx.date,
        });
      }
      return acc;
    }, []);

  return (
    <Shell title={`Welcome, ${state.patronName || "User"}`} subtitle="Manage your crypto deposits">
      <div className="space-y-5">
        {/* Session recovery alert */}
        {incompleteSessions.length > 0 && (
          <SessionRecovery
            sessions={incompleteSessions}
            onResume={(sessionId) => {
              const session = incompleteSessions.find((s) => s.sessionId === sessionId);
              if (session?.step === "test-payment") {
                navigate("/test-payment");
              } else {
                navigate("/main-deposit");
              }
            }}
            onDismiss={() => {
              setDismissedSessions([...dismissedSessions, incompleteSessions[0].sessionId]);
            }}
          />
        )}

        {/* Account status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-gold rounded-xl p-5 space-y-4"
        >
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl ${accountStatus.bg} flex items-center justify-center shrink-0`}>
              <AccountStatusIcon className={`w-5 h-5 ${accountStatus.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Account Status</p>
              <h2 className={`text-base font-semibold mt-1 ${accountStatus.color}`}>
                {accountStatus.label}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {accountStatus.description}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(accountStatus.path)}
            className="w-full rounded-xl border border-gold/50 bg-gold/5 py-3 text-xs font-semibold text-gold transition-all hover:bg-gold/10 hover:border-gold"
          >
            {accountStatus.action}
          </button>
        </motion.div>

        {/* Pending alert */}
        {pendingTx > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card-wine rounded-xl px-4 py-3 flex items-center gap-3"
          >
            <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            <p className="text-xs text-muted-foreground">
              You have <span className="text-warning font-medium">{pendingTx} WIP</span> transfer{pendingTx > 1 ? "s" : ""} awaiting confirmation.
            </p>
          </motion.div>
        )}

        {/* Recent Activity */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Recent Activity</h2>
          </div>

          {state.transactions.length === 0 ? (
            <div className="card-gold rounded-xl p-8 flex flex-col items-center text-center">
              <Clock className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {state.transactions.slice(0, 3).map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => setExpandedTxId(expandedTxId === tx.id ? "" : tx.id)}
                  className="w-full card-gold rounded-xl px-4 py-3 text-left transition-all hover:border-gold/30"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      transferStatusLabel(tx) === "Settled" || transferStatusLabel(tx) === "Transferred"
                        ? "bg-success/10"
                        : transferStatusLabel(tx) === "Rejected"
                        ? "bg-destructive/10"
                        : "bg-warning/10"
                    }`}>
                      {transferStatusLabel(tx) === "Settled" || transferStatusLabel(tx) === "Transferred" ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : transferStatusLabel(tx) === "Rejected" ? (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                      ) : (
                        <Clock className="w-4 h-4 text-warning" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        {formatAssetAmount(tx.amount, tx.type === "test" ? 2 : 0)} {tx.asset}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Transfer date · {formatTransferDate(tx.date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`text-[10px] font-semibold ${transferStatusClass(transferStatusLabel(tx))}`}>
                        {transferStatusLabel(tx)}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedTxId === tx.id ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                  {expandedTxId === tx.id && (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/30 pt-3 text-[11px]">
                      <div>
                        <p className="text-muted-foreground/60">Transfer type</p>
                        <p className="font-medium text-foreground">{tx.type === "test" ? "Verification" : "Main deposit"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground/60">Network</p>
                        <p className="font-medium text-foreground">{formatNetworkRail(tx.network)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground/60">Reference ID</p>
                        <p className="font-mono text-gold">{referenceIdFromTx(tx.txHash)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground/60">Transaction hash</p>
                        <p className="truncate font-mono text-gold">{tx.txHash || "WIP"}</p>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={() => navigate("/support")}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border/50 hover:border-gold/20 transition-all text-muted-foreground hover:text-gold"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="text-[10px]">Support</span>
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border/50 hover:border-gold/20 transition-all text-muted-foreground hover:text-gold"
          >
            <User className="w-4 h-4" />
            <span className="text-[10px]">Profile</span>
          </button>
        </div>
      </div>
    </Shell>
  );
}
