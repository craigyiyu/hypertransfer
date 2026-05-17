/**
 * Dashboard — Main patron hub. Shows status, recent activity, and the primary "New Deposit" CTA.
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
  Plus,
  User,
  HelpCircle,
} from "lucide-react";
import SessionRecovery from "@/components/SessionRecovery";
import SecurityStatus from "@/components/SecurityStatus";
import { useState } from "react";

const WALLET_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/wallet-illustration-UrVobqFRocWM8UQXYryQQw.webp";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { state } = useDemo();
  const [dismissedSessions, setDismissedSessions] = useState<string[]>([]);

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
    <Shell title={`Welcome, ${state.patronName || "Patron"}`} subtitle="Manage your crypto deposits">
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

        {/* Security status */}
        <SecurityStatus
          twoFAEnabled={true}
          kycVerified={state.kycComplete}
          travelRuleComplete={state.travelRuleComplete || false}
          compact={false}
        />

        {/* Status cards */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card-gold rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">KYC Status</span>
            </div>
            <p className={`text-sm font-semibold ${state.kycComplete ? "text-success" : "text-warning"}`}>
              {state.kycComplete ? "Verified" : "Pending"}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="card-gold rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="w-3.5 h-3.5 text-gold" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Deposits</span>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {confirmedTx} <span className="text-muted-foreground font-normal">completed</span>
            </p>
          </motion.div>
        </div>

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

        {/* Main CTA — New Deposit */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => navigate("/new-deposit")}
          className="w-full card-gold rounded-xl p-5 flex items-center gap-4 hover:border-gold/40 transition-all duration-200 group"
        >
          <img
            src={WALLET_IMG}
            alt="Deposit"
            className="w-14 h-14 rounded-xl object-cover"
          />
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-foreground group-hover:text-gold transition-colors">
              New Crypto Deposit
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Transfer crypto to your casino account
            </p>
          </div>
          <Plus className="w-5 h-5 text-gold" />
        </motion.button>

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
                      {tx.type === "test" ? "Test Deposit" : "Deposit"} &middot; {tx.amount} {tx.asset}
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
            onClick={() => navigate("/")}
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
