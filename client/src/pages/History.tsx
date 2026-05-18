/**
 * History — Transaction history page. Shows all past deposit sessions.
 * Displays deposit amount in USDT and HKD equivalent, network fees, and status.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, ArrowUpRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import { convertToHKD, formatHKD } from "@/lib/currency";

interface SessionGroup {
  sessionId: string;
  asset: string;
  network: string;
  status: "pending" | "completed" | "failed";
  totalAmount: string;
  testTx?: any;
  mainTx?: any;
  createdAt: string;
  completedAt?: string;
}

export default function History() {
  const [, navigate] = useLocation();
  const { state } = useDemo();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending">("all");

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Group transactions by session
  const groupedSessions: SessionGroup[] = state.transactions.reduce((acc: SessionGroup[], tx) => {
    const existing = acc.find((s) => s.sessionId === tx.sessionId);
    if (existing) {
      if (tx.type === "test") existing.testTx = tx;
      if (tx.type === "main") existing.mainTx = tx;
      existing.totalAmount = tx.amount;
      if (tx.status === "confirmed" || tx.status === "cleared") {
        existing.status = "completed";
        existing.completedAt = tx.date;
      }
    } else {
      acc.push({
        sessionId: tx.sessionId,
        asset: tx.asset,
        network: tx.network,
        status: tx.type === "test" ? "pending" : "completed",
        totalAmount: tx.amount,
        [tx.type === "test" ? "testTx" : "mainTx"]: tx,
        createdAt: tx.date,
      });
    }
    return acc;
  }, []);

  // Filter sessions by status
  const filteredSessions = groupedSessions.filter((session) => {
    if (filterStatus === "all") return true;
    return session.status === filterStatus;
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-warning animate-spin" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-success";
      case "failed":
        return "text-destructive";
      default:
        return "text-warning";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      default:
        return "Pending";
    }
  };

  const handleResumeSession = (session: SessionGroup) => {
    if (session.status === "pending" && session.testTx) {
      navigate("/main-deposit");
    } else if (session.status === "pending") {
      navigate("/test-payment");
    }
  };

  const calculateNetAmount = (amount: string) => {
    // Assume 0.5% platform fee for demo
    const numAmount = parseFloat(amount);
    const fee = numAmount * 0.005;
    return (numAmount - fee).toFixed(2);
  };

  return (
    <Shell showBack backTo="/dashboard" title="Transaction History" subtitle="All your deposit records">
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              filterStatus === "all"
                ? "bg-gold/10 text-gold"
                : "text-muted-foreground hover:text-gold"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterStatus("completed")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              filterStatus === "completed"
                ? "bg-gold/10 text-gold"
                : "text-muted-foreground hover:text-gold"
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setFilterStatus("pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              filterStatus === "pending"
                ? "bg-gold/10 text-gold"
                : "text-muted-foreground hover:text-gold"
            }`}
          >
            Pending
          </button>
        </div>

        {/* Session list */}
        {filteredSessions.length === 0 ? (
          <div className="card-gold rounded-xl p-12 flex flex-col items-center text-center">
            <ArrowUpRight className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No transactions yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Your deposit history will appear here
            </p>
            <button
              onClick={() => navigate("/new-deposit")}
              className="mt-4 px-4 py-2 rounded-lg bg-gold/10 text-gold text-xs font-medium hover:bg-gold/20 transition-colors"
            >
              Make a Deposit
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session, i) => {
              const mainAmount = session.mainTx?.amount || session.totalAmount;
              const netAmount = calculateNetAmount(mainAmount);
              const hkdAmount = convertToHKD(netAmount);

              return (
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
                      <div className="text-left min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-foreground">
                            {mainAmount} USDT
                          </p>
                          <span className={`text-xs font-medium ${statusColor(session.status)}`}>
                            {statusLabel(session.status)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/60">
                          {session.network} • {formatDate(session.createdAt)}
                        </p>
                      </div>
                    </div>

                    {/* HKD equivalent or expand icon */}
                    {session.status === "completed" ? (
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className="text-sm font-semibold text-gold">HKD {hkdAmount}</p>
                        <p className="text-xs text-muted-foreground/60">Received</p>
                      </div>
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
                      className="px-4 py-4 border-t border-border/30 space-y-4"
                    >
                      {/* Deposit summary */}
                      <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Deposit Summary
                        </p>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Deposit Amount</span>
                            <span className="text-foreground font-medium">{mainAmount} USDT</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Network Fee</span>
                            <span className="text-foreground font-medium">~$0.50</span>
                          </div>
                          <div className="h-px bg-border/30" />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground font-medium">Amount Received</span>
                            <span className="text-gold font-semibold">{netAmount} USDT</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">HKD Equivalent</span>
                            <span className="text-gold font-semibold">HKD {hkdAmount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Transaction details */}
                      {session.mainTx && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Transaction Details
                          </p>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Network</span>
                              <span className="text-foreground font-medium capitalize">{session.network}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Status</span>
                              <span className={`font-medium capitalize ${statusColor(session.mainTx.status)}`}>
                                {statusLabel(session.mainTx.status)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Submitted</span>
                              <span className="text-foreground font-medium">{formatDate(session.createdAt)}</span>
                            </div>
                            {session.completedAt && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Completed</span>
                                <span className="text-foreground font-medium">{formatDate(session.completedAt)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Resume button for pending */}
                      {session.status === "pending" && (
                        <button
                          onClick={() => handleResumeSession(session)}
                          className="w-full mt-2 px-3 py-2 rounded-lg bg-gold/10 text-gold text-xs font-medium hover:bg-gold/20 transition-colors"
                        >
                          Resume Deposit
                        </button>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
