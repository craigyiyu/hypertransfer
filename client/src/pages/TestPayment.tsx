/**
 * TestPayment — Monitors the test payment. Shows status updates as the blockchain confirms.
 * Handles both success and failure scenarios.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, XCircle, ArrowRight, RotateCcw, AlertTriangle } from "lucide-react";
import TransactionStatus from "@/components/TransactionStatus";
import FeeBreakdown from "@/components/FeeBreakdown";
import { getNetworkFee } from "@/lib/currency";

type PaymentState = "monitoring" | "confirming" | "confirmed" | "failed" | "timeout";

export default function TestPayment() {
  const [, navigate] = useLocation();
  const { state, updateState, addTransaction } = useDemo();
  const [paymentState, setPaymentState] = useState<PaymentState>("monitoring");
  const [confirmations, setConfirmations] = useState(0);
  const requiredConfirmations = 3;

  useEffect(() => {
    // Simulate monitoring → confirming → confirmed
    const t1 = setTimeout(() => setPaymentState("confirming"), 2500);
    const t2 = setTimeout(() => setConfirmations(1), 3500);
    const t3 = setTimeout(() => setConfirmations(2), 4500);
    const t4 = setTimeout(() => {
      setConfirmations(3);
      setPaymentState("confirmed");
      updateState({ testPaymentConfirmed: true });
      addTransaction({
        id: "tx-test-" + Date.now(),
        type: "test",
        asset: state.selectedAsset,
        network: state.selectedNetwork,
        amount: "1.00",
        status: "confirmed",
        date: new Date().toISOString(),
        txHash: "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""),
        sessionId: "sess-" + Date.now(),
      });
    }, 5500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  const handleSimulateFailure = () => {
    setPaymentState("failed");
  };

  const handleRetry = () => {
    navigate("/deposit-address");
  };

  return (
    <Shell showBack backTo="/deposit-address" title="Test Payment" subtitle="Monitoring your test deposit">
      <div className="space-y-6">
        {/* Fee breakdown */}
        <FeeBreakdown
          amount="1.00"
          network={state.selectedNetwork}
          networkFee={getNetworkFee(state.selectedNetwork).toFixed(2)}
          totalFee={getNetworkFee(state.selectedNetwork).toFixed(2)}
          settlementTime="~30 seconds"
          showDetails
        />

        {/* Transaction status timeline */}
        {paymentState !== "failed" && paymentState !== "timeout" && (
          <TransactionStatus
            steps={[
              {
                label: "Transaction Initiated",
                status: paymentState === "monitoring" ? "pending" : "confirmed",
                timestamp: "Just now",
              },
              {
                label: "Blockchain Confirmation",
                status: paymentState === "confirming" || paymentState === "confirmed" ? (paymentState === "confirmed" ? "confirmed" : "pending") : "pending",
                confirmations: confirmations,
                totalConfirmations: requiredConfirmations,
              },
              {
                label: "Deposit Confirmed",
                status: paymentState === "confirmed" ? "confirmed" : "pending",
              },
            ]}
            estimatedTime="~30 seconds"
            currentStatus={paymentState === "confirmed" ? "confirmed" : "pending"}
          />
        )}

        {/* Session info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="px-2 py-1 rounded-md bg-gold/10 text-gold font-mono text-[10px]">
            {state.selectedAsset}
          </div>
          <span>&middot;</span>
          <span className="capitalize">{state.selectedNetwork}</span>
          <span>&middot;</span>
          <span>Test Deposit</span>
        </div>

        {/* Status card - only show for failed state */}
        {(paymentState === "failed" || paymentState === "timeout") && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-wine rounded-xl p-6 flex flex-col items-center text-center"
          >
            <XCircle className="w-12 h-12 text-destructive mb-3" />
            <h2 className="text-lg font-semibold text-destructive mb-2">
              {paymentState === "failed" ? "Payment Failed" : "Transaction Timed Out"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {paymentState === "failed"
                ? "The test payment could not be confirmed. Please check the address and network."
                : "No transaction detected within the expected timeframe."}
            </p>
          </motion.div>
        )}

        {/* Failure guidance */}
        {(paymentState === "failed" || paymentState === "timeout") && (
          <div className="card-wine rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-xs text-foreground font-medium">What to do next:</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Verify you sent to the correct address</li>
                  <li>Confirm you used the <span className="text-gold">{state.selectedNetwork}</span> network</li>
                  <li>Check your wallet for the transaction status</li>
                  <li>Contact your host for assistance</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Demo controls */}
        {paymentState === "monitoring" && (
          <button
            onClick={handleSimulateFailure}
            className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors text-center w-full"
          >
            (Demo: Simulate failure)
          </button>
        )}
      </div>

      <div className="mt-8">
        {paymentState === "confirmed" && (
          <button
            onClick={() => navigate("/main-deposit")}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
          >
            Proceed to Main Deposit
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {(paymentState === "failed" || paymentState === "timeout") && (
          <div className="space-y-3">
            <button
              onClick={handleRetry}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Retry with Same Address
            </button>
            <button
              onClick={() => navigate("/new-deposit")}
              className="w-full rounded-xl py-3 text-xs text-muted-foreground hover:text-gold transition-colors"
            >
              Start New Deposit Session
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}
