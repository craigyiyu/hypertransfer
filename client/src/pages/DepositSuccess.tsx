/**
 * DepositSuccess — Final confirmation screen after a successful deposit session.
 * Shows summary with HKD equivalent and next steps.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Clock, Banknote } from "lucide-react";
import { getHKDEquivalent, getNetworkFee, formatHKD, convertToHKD } from "@/lib/currency";

const SUCCESS_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/success-illustration-eEvN4zYtHrbHQ2jjhx3ZrM.webp";

export default function DepositSuccess() {
  const [, navigate] = useLocation();
  const { state } = useDemo();

  const depositAmount = parseFloat(state.mainDepositAmount) || 0;
  const networkFee = getNetworkFee(state.selectedNetwork);
  const netReceive = Math.max(0, depositAmount - networkFee);

  return (
    <Shell showProgress={false}>
      <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
        {/* Success illustration */}
        <motion.img
          src={SUCCESS_IMG}
          alt="Success"
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
          <h1 className="text-xl font-bold text-foreground">Deposit Complete</h1>
          <p className="text-sm text-muted-foreground max-w-[280px]">
            Your {state.mainDepositAmount} {state.selectedAsset} deposit has been confirmed and is being processed.
          </p>
          <p className="text-xs text-gold">
            ≈ {getHKDEquivalent(state.mainDepositAmount, state.selectedAsset)}
          </p>
        </motion.div>

        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full card-gold rounded-xl p-5 mt-8 space-y-3"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Amount Sent</span>
            <span className="text-foreground font-semibold">
              {state.mainDepositAmount} {state.selectedAsset}
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Network Fee</span>
            <span className="text-foreground">−{networkFee.toFixed(2)} {state.selectedAsset}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">You'll Receive</span>
            <div className="text-right">
              <span className="text-gold font-semibold">{netReceive.toFixed(2)} {state.selectedAsset}</span>
              <p className="text-[10px] text-muted-foreground">≈ {formatHKD(convertToHKD(netReceive, state.selectedAsset))}</p>
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Network</span>
            <span className="text-foreground capitalize">{state.selectedNetwork}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Verification</span>
            <span className="text-success flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Confirmed
            </span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Status</span>
            <span className="text-gold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Clearing
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
              <p className="text-xs text-foreground font-medium">What happens next</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Once the funds are cleared by the custodian, the equivalent HKD amount will be credited to your account. You will receive a notification when settlement is complete.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="space-y-3 pb-4">
        <button
          onClick={() => navigate("/new-deposit")}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
        >
          Make Another Deposit
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => navigate("/dashboard")}
          className="w-full rounded-xl py-3 text-xs text-muted-foreground hover:text-gold transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    </Shell>
  );
}
