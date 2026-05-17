/**
 * History — Transaction history page. Shows all past deposit sessions.
 * Groups test + main deposits by session.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, ArrowUpRight, Filter } from "lucide-react";

export default function History() {
  const [, navigate] = useLocation();
  const { state } = useDemo();

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
      case "cleared":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed":
      case "cleared":
        return "text-success";
      case "failed":
        return "text-destructive";
      default:
        return "text-warning";
    }
  };

  return (
    <Shell showBack backTo="/dashboard" title="Transaction History" subtitle="All your deposit records">
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-gold/10 text-gold text-xs font-medium">
              All
            </button>
            <button className="px-3 py-1.5 rounded-lg text-muted-foreground text-xs hover:text-gold transition-colors">
              Deposits
            </button>
            <button className="px-3 py-1.5 rounded-lg text-muted-foreground text-xs hover:text-gold transition-colors">
              Pending
            </button>
          </div>
          <button className="text-muted-foreground hover:text-gold transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Transaction list */}
        {state.transactions.length === 0 ? (
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
          <div className="space-y-2">
            {state.transactions.map((tx, i) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="card-gold rounded-xl px-4 py-4 space-y-3"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {statusIcon(tx.status)}
                    <span className="text-sm font-medium text-foreground">
                      {tx.type === "test" ? "Test Deposit" : "Deposit"}
                    </span>
                  </div>
                  <span className={`text-xs font-medium capitalize ${statusColor(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-y-2 text-xs">
                  <div>
                    <p className="text-muted-foreground/60">Amount</p>
                    <p className="text-foreground font-medium">
                      {tx.amount} {tx.asset}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground/60">Network</p>
                    <p className="text-foreground capitalize">{tx.network}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground/60">Transaction Hash</p>
                    <p className="font-mono text-[10px] text-gold truncate">{tx.txHash}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground/60">Date</p>
                    <p className="text-foreground">{formatDate(tx.date)}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
