/**
 * Dashboard — Main account hub. Shows account status, deposit overview, and recent activity.
 * Design: Dark canvas, gold accents, single-column layout.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  History,
  User,
  HelpCircle,
  Lock,
  Undo2,
} from "lucide-react";
import { formatAssetAmount } from "@/lib/currency";
import { refundApi, type VerifiedWallet } from "@/lib/api";
import SessionRecovery from "@/components/SessionRecovery";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { state } = useDemo();
  const [dismissedSessions, setDismissedSessions] = useState<string[]>([]);
  const [verifiedWallets, setVerifiedWallets] = useState<VerifiedWallet[]>([]);

  // 拉取本人已验证原钱包(后端真实); 失败/为空 → 回退 demo 信号(本会话已完成入金的来源钱包)。
  useEffect(() => {
    let alive = true;
    refundApi
      .wallets()
      .then(({ data }) => {
        if (alive) setVerifiedWallets(data.wallets || []);
      })
      .catch(() => {
        if (alive) setVerifiedWallets([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const kycApproved = state.kyc.status === "approved";
  // 退款门槛(process v1 §C): KYC 通过 + 至少一个已验证原钱包(后端 verified_wallets, 或 demo: 本会话已完成入金)。
  const hasVerifiedWallet = verifiedWallets.length > 0 || (state.mainDepositConfirmed && Boolean(state.sourceWallet));
  const canRefund = kycApproved && hasVerifiedWallet;
  
  const accountStatus = (() => {
    switch (state.kyc.status) {
      case "approved":
        return {
          label: "Verified",
          title: "Deposits enabled",
          description: "Your account is verified and ready for crypto deposits.",
          icon: CheckCircle2,
          color: "text-success",
          bg: "bg-success/10",
          action: "Start Deposit",
          path: "/new-deposit",
        };
      case "pending":
        return {
          label: "Under Review",
          title: "KYC is being reviewed",
          description: "Your documents are under review. Deposits will unlock once approved.",
          icon: Clock,
          color: "text-warning",
          bg: "bg-warning/10",
          action: "View Review Status",
          path: "/kyc-status",
        };
      case "rejected":
        return {
          label: "Action Required",
          title: "KYC needs attention",
          description: "Please update your verification information to continue.",
          icon: AlertCircle,
          color: "text-destructive",
          bg: "bg-destructive/10",
          action: "Update KYC",
          path: "/kyc",
        };
      default:
        return {
          label: "On Hold",
          title: "KYC verification required",
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
  const confirmedTx = state.transactions.filter((t) => t.status === "confirmed" || t.status === "cleared").length;

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
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Account Status</p>
                <span className={`text-xs font-semibold ${accountStatus.color}`}>
                  {accountStatus.label}
                </span>
              </div>
              <h2 className="text-base font-semibold text-foreground mt-1">
                {accountStatus.title}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {accountStatus.description}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(accountStatus.path)}
            className="w-full rounded-xl py-3 text-xs font-semibold border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all"
          >
            {accountStatus.action}
          </button>
        </motion.div>

        {/* Deposit overview */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => navigate("/history")}
          className="w-full card-gold rounded-xl p-4 text-left hover:border-gold/30 transition-all"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="w-3.5 h-3.5 text-gold" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Deposit Overview</span>
              </div>
              <p className="text-sm font-semibold text-foreground">
                {confirmedTx} completed
                {pendingTx > 0 && <span className="text-warning"> · {pendingTx} pending</span>}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingTx > 0 ? "You have an active deposit session." : "No active deposit session."}
              </p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
              <History className="w-4 h-4 text-gold" />
            </div>
          </div>
        </motion.button>

        {/* Withdrawal / Return funds */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card-gold rounded-xl p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Undo2 className="w-3.5 h-3.5 text-gold" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Withdraw Funds</span>
              </div>
              <p className="text-sm font-semibold text-foreground">Request a withdrawal</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {canRefund
                  ? "Return any amount to a wallet you previously verified."
                  : kycApproved
                  ? "Verify a wallet by completing a deposit's 1 USDT check first."
                  : "Finish KYC and verify a wallet before requesting a withdrawal."}
              </p>
            </div>
            <button
              onClick={() => navigate("/refund")}
              disabled={!canRefund}
              className="shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold border border-gold/40 text-gold hover:bg-gold/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Request
            </button>
          </div>
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
              You have <span className="text-warning font-medium">{pendingTx} pending</span> transaction{pendingTx > 1 ? "s" : ""} awaiting confirmation.
            </p>
          </motion.div>
        )}

        {/* Recent Activity */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Recent Activity</h2>
            {state.transactions.length > 0 && (
              <button
                onClick={() => navigate("/history")}
                className="text-xs text-gold hover:text-gold-bright transition-colors flex items-center gap-1"
              >
                View All <History className="w-3 h-3" />
              </button>
            )}
          </div>

          {state.transactions.length === 0 ? (
            <div className="card-gold rounded-xl p-8 flex flex-col items-center text-center">
              <Clock className="w-8 h-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No transactions yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Start a new deposit to begin
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {state.transactions.slice(0, 3).map((tx) => (
                <div
                  key={tx.id}
                  className="card-gold rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tx.status === "confirmed" || tx.status === "cleared"
                      ? "bg-success/10"
                      : tx.status === "failed"
                      ? "bg-destructive/10"
                      : "bg-warning/10"
                  }`}>
                    {tx.status === "confirmed" || tx.status === "cleared" ? (
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    ) : tx.status === "failed" ? (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    ) : (
                      <Clock className="w-4 h-4 text-warning" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      {tx.type === "test" ? "Test Deposit" : "Deposit"} &middot; {formatAssetAmount(tx.amount, tx.type === "test" ? 2 : 0)} {tx.asset}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {tx.txHash}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium capitalize ${
                    tx.status === "confirmed" || tx.status === "cleared"
                      ? "text-success"
                      : tx.status === "failed"
                      ? "text-destructive"
                      : "text-warning"
                  }`}>
                    {tx.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <button
            onClick={() => navigate("/history")}
            className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border/50 hover:border-gold/20 transition-all text-muted-foreground hover:text-gold"
          >
            <History className="w-4 h-4" />
            <span className="text-[10px]">History</span>
          </button>
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
