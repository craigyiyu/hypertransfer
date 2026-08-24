/**
 * SessionRecovery — Alerts user about incomplete sessions and allows resumption.
 * Design: Dark canvas, wine accent, action-oriented.
 */
import { motion } from "framer-motion";
import { AlertCircle, Play } from "lucide-react";

interface IncompleteSession {
  sessionId: string;
  asset: string;
  network: string;
  step: "test-payment" | "main-deposit" | "screening";
  createdAt: string;
}

interface SessionRecoveryProps {
  sessions: IncompleteSession[];
  onResume: (sessionId: string) => void;
  onDismiss: () => void;
}

export default function SessionRecovery({
  sessions,
  onResume,
  onDismiss,
}: SessionRecoveryProps) {
  if (sessions.length === 0) return null;

  const session = sessions[0]; // Show the most recent incomplete session
  if (!session) return null;
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const stepLabel = (step: string) => {
    switch (step) {
      case "test-payment":
        return "Test Payment";
      case "main-deposit":
        return "Main Deposit";
      case "screening":
        return "Wallet Screening";
      default:
        return "Deposit";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="card-wine rounded-xl p-4 space-y-3 border border-wine/30"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Incomplete Deposit Session
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            You have an ongoing {session.asset} deposit on {session.network} from {timeAgo(session.createdAt)}.
            You were at the <span className="text-gold font-medium">{stepLabel(session.step)}</span> step.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onResume(session.sessionId)}
          className="flex-1 px-3 py-2 rounded-lg bg-gold/10 text-gold text-xs font-medium hover:bg-gold/20 transition-colors flex items-center justify-center gap-1.5"
        >
          <Play className="w-3 h-3" />
          Resume
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-2 rounded-lg text-muted-foreground text-xs hover:text-foreground transition-colors"
        >
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}
