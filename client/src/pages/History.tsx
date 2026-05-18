/**
 * History — Transaction history page. Shows all past deposit sessions.
 * Groups test + main deposits by session with resumption capability.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, ArrowUpRight, Filter, Play, ChevronDown } from "lucide-react";
import { useState } from "react";

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

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-warning" />;
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

  const handleResumeSession = (session: SessionGroup) => {
    if (session.status === "pending" && session.testTx) {
      // Resume at main deposit step
      navigate("/main-deposit");
    } else if (session.status === "pending") {
      // Resume at test payment step
      navigate("/test-payment");
    }
  };

  return (
    <Shell showBack backTo="/dashboard" title="Transaction History" subtitle="All your deposit records">
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <button className="px-3 py-1.5 rounded-lg bg-gold/10 text-gold text-xs font-medium whitespace-nowrap">
              All
            </button>
            <button className="px-3 py-1.5 rounded-lg text-muted-foreground text-xs hover:text-gold transition-colors whitespace-nowrap">
              Completed
            </button>
            <button className="px-3 py-1.5 rounded-lg text-muted-foreground text-xs hover:text-gold transition-colors whitespace-nowrap">
              Pending
            </button>
          </div>
          <button className="text-muted-foreground hover:text-gold transition-colors flex-shrink-0">
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Session list */}
        {groupedSessions.length === 0 ? (
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
            {groupedSessions.map((session, i) => (
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
                          {session.asset} on {session.network}
                        </p>
                        <span className={`text-xs font-medium capitalize ${statusColor(session.status)}`}>
                          {session.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        {session.totalAmount} {session.asset} • {formatDate(session.createdAt)}
                      </p>
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
                      Resume
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
                          Test Deposit
                        </p>
                        <div className="grid grid-cols-2 gap-y-2 text-xs">
                          <div>
                            <p className="text-muted-foreground/60">Amount</p>
                            <p className="text-foreground font-medium">
                              {session.testTx.amount} {session.testTx.asset}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground/60">Status</p>
                            <p className={`font-medium capitalize ${statusColor(session.testTx.status)}`}>
                              {session.testTx.status}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-muted-foreground/60">Transaction Hash</p>
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
                            Main Deposit
                          </p>
                          <div className="grid grid-cols-2 gap-y-2 text-xs">
                            <div>
                              <p className="text-muted-foreground/60">Amount</p>
                              <p className="text-foreground font-medium">
                                {session.mainTx.amount} {session.mainTx.asset}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground/60">Status</p>
                              <p className={`font-medium capitalize ${statusColor(session.mainTx.status)}`}>
                                {session.mainTx.status}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-muted-foreground/60">Transaction Hash</p>
                              <p className="font-mono text-[10px] text-gold truncate">
                                {session.mainTx.txHash}
                              </p>
                            </div>
                          </div>
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
