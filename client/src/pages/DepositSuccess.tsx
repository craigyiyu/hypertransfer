/**
 * DepositSuccess — Final confirmation screen after a successful deposit session.
 * Shows summary with HKD equivalent, celebratory animation, and next steps.
 */
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowRight, Clock, Banknote } from "lucide-react";
import { getHKDEquivalent, getNetworkFee, formatHKD, convertToHKD } from "@/lib/currency";
import { SuccessCelebration } from "@/components/SuccessCelebration";

const SUCCESS_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/success-illustration-eEvN4zYtHrbHQ2jjhx3ZrM.webp";

export default function DepositSuccess() {
  const [, navigate] = useLocation();
  const { state } = useDemo();

  const depositAmount = parseFloat(state.mainDepositAmount) || 0;
  const networkFee = getNetworkFee(state.selectedNetwork);
  const netReceive = Math.max(0, depositAmount - networkFee);
  const hkdAmount = formatHKD(convertToHKD(netReceive, state.selectedAsset));

  return (
    <Shell showProgress={false}>
      <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
        {/* Celebratory animation */}
        <SuccessCelebration
          title="Deposit Complete"
          message={`Your ${state.mainDepositAmount} ${state.selectedAsset} deposit has been confirmed and is being processed.`}
          amount={hkdAmount}
          nextStep="Funds will settle in 1–2 hours. Track progress in your History."
        />

        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
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
              <p className="text-[10px] text-muted-foreground">≈ {hkdAmount}</p>
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
          transition={{ delay: 0.7 }}
          className="w-full card-wine rounded-xl px-4 py-3 mt-4"
        >
          <div className="flex items-start gap-3">
            <Banknote className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <div className="text-left">
              <p className="text-xs text-foreground font-medium">What happens next</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Funds will settle in 1–2 hours. Once cleared, the HKD equivalent will be credited to your account. You'll receive a notification when complete.
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
