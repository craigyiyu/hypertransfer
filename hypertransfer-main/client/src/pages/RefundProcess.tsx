/**
 * RefundProcess — Customer-facing refund request and destination verification.
 * Treasury approval and Hex Safe payout execution stay in the staff portal.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Undo2,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import Shell from "@/components/Shell";
import { useDemo } from "@/contexts/DemoContext";
import { formatAssetAmount, getHKDEquivalent } from "@/lib/currency";
import {
  createRefundRequest,
  formatRefundStatus,
  REFUND_PROCESS_STEPS,
  REFUND_REASON_LABELS,
  submitRefundDestination,
  submitRefundForApproval,
  validateRefundDestination,
  type RefundReason,
  type RefundStatus,
} from "@/lib/refund-process";

const reasonOptions = Object.entries(REFUND_REASON_LABELS) as [RefundReason, string][];

function statusTone(status: RefundStatus) {
  if (status === "completed" || status === "approved" || status === "destination_kyt_passed") return "text-success";
  if (status === "rejected" || status === "failed") return "text-destructive";
  if (status === "manual_review") return "text-warning";
  return "text-gold";
}

export default function RefundProcess() {
  const [, navigate] = useLocation();
  const { state, updateState, seedRefundDemo } = useDemo();
  const [reason, setReason] = useState<RefundReason>("customer_cancelled");
  const [destinationAddress, setDestinationAddress] = useState(state.refundRequest?.destinationAddress || "");
  const [addressError, setAddressError] = useState("");

  const latestMainTx = useMemo(
    () => state.transactions.find((tx) => tx.type === "main" && (tx.status === "confirmed" || tx.status === "cleared")),
    [state.transactions],
  );
  const refundAmount = parseFloat(latestMainTx?.amount || state.mainDepositAmount) || 0;
  const hasRefundableDeposit = Boolean(latestMainTx && refundAmount > 0 && state.mainDepositConfirmed);
  const request = state.refundRequest;
  const networkLabel = state.selectedNetwork === "tron" ? "TRC-20" : "ERC-20";
  const placeholder =
    state.selectedNetwork === "tron"
      ? "TQ2fL7pXJ9m3J8aVvYpYcFh7q7D4Qm5B1T"
      : "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

  const createRequest = () => {
    if (!latestMainTx) return;
    try {
      const next = createRefundRequest({
        originalDepositSessionId: latestMainTx.sessionId,
        originalTxHash: latestMainTx.txHash,
        asset: latestMainTx.asset,
        network: latestMainTx.network,
        amount: refundAmount,
        reason,
      });
      updateState({ refundRequest: next });
      toast.success("Refund request created", {
        description: "Please confirm the refund destination wallet.",
      });
    } catch (err) {
      toast.error("Refund unavailable", {
        description: err instanceof Error ? err.message : "Unsupported asset or network.",
      });
    }
  };

  const loadDemoRefundCase = () => {
    seedRefundDemo();
    setReason("customer_cancelled");
    setDestinationAddress("");
    setAddressError("");
    toast.success("Demo refundable deposit loaded", {
      description: "A cleared 12,500 USDT TRC-20 deposit is ready for refund testing.",
    });
  };

  const useDemoDestination = () => {
    setDestinationAddress(placeholder);
    setAddressError("");
    toast.success("Demo refund wallet filled", {
      description: `${networkLabel} destination address is ready for KYT screening.`,
    });
  };

  const submitAddress = () => {
    if (!request) return;
    const validation = validateRefundDestination(destinationAddress, request.network);
    if (!validation.valid) {
      setAddressError(validation.error || "Invalid refund address.");
      return;
    }

    setAddressError("");
    const next = submitRefundDestination(request, destinationAddress);
    updateState({ refundRequest: next });
    if (next.status === "destination_kyt_passed") {
      toast.success("Refund wallet passed KYT", {
        description: next.kytResult?.reference,
      });
    } else if (next.status === "manual_review") {
      toast.warning("Manual review required", {
        description: next.kytResult?.note,
      });
    } else {
      toast.error("Refund wallet rejected", {
        description: next.kytResult?.note,
      });
    }
  };

  const sendForApproval = () => {
    if (!request) return;
    const next = submitRefundForApproval(request);
    updateState({ refundRequest: next });
    toast.success("Sent for treasury approval", {
      description: "Support will notify you after review.",
    });
  };

  return (
    <Shell showBack backTo="/deposit-success" title="Refund Request" subtitle="Verify destination before treasury review">
      <div className="space-y-5">
        {!hasRefundableDeposit && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-gold rounded-xl p-5 text-center"
          >
            <Undo2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">No refundable deposit found</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A refund case can only be opened after a completed stablecoin deposit is matched to your account.
            </p>
            <button
              onClick={() => navigate("/dashboard")}
              className="mt-4 rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-background"
            >
              Return to Dashboard
            </button>
            <button
              onClick={loadDemoRefundCase}
              className="mt-3 rounded-lg border border-gold/40 px-4 py-2 text-xs font-semibold text-gold"
            >
              Load Demo Refund Case
            </button>
          </motion.div>
        )}

        {hasRefundableDeposit && (
          <>
            <div className="card-gold rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Original deposit</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {formatAssetAmount(refundAmount, 0)} {latestMainTx?.asset}
                  </p>
                  <p className="text-xs text-gold">≈ {getHKDEquivalent(refundAmount, latestMainTx?.asset)}</p>
                </div>
                <span className="rounded-lg bg-gold/10 px-2 py-1 text-[10px] font-semibold text-gold">
                  {networkLabel}
                </span>
              </div>
              <div className="rounded-lg bg-input px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Original txHash</p>
                <p className="mt-1 truncate font-mono text-[10px] text-gold">{latestMainTx?.txHash}</p>
              </div>
            </div>

            {!request && (
              <div className="card-wine rounded-xl p-4 space-y-3">
                <label className="block text-xs font-medium text-muted-foreground">Refund reason</label>
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value as RefundReason)}
                  className="h-12 w-full rounded-xl border border-border bg-input px-3 text-sm text-foreground outline-none focus:border-gold/50"
                >
                  {reasonOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={createRequest}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold py-4 text-sm font-semibold text-background"
                >
                  Create Refund Request
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {request && (
              <>
                <div className="card-gold rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Refund case</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-foreground">{request.id}</p>
                    </div>
                    <span className={`text-xs font-semibold capitalize ${statusTone(request.status)}`}>
                      {formatRefundStatus(request.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-secondary/20 px-3 py-2">
                      <p className="text-muted-foreground">Reason</p>
                      <p className="mt-1 text-foreground">{REFUND_REASON_LABELS[request.reason]}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/20 px-3 py-2">
                      <p className="text-muted-foreground">Expires</p>
                      <p className="mt-1 text-foreground">{new Date(request.expiresAt).toLocaleDateString("en-US")}</p>
                    </div>
                  </div>
                </div>

                {request.status === "address_required" && (
                  <div className="card-wine rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Confirm refund wallet</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Use a wallet you control on the same {networkLabel} network. Do not provide private keys,
                          seed phrases, or exchange account passwords.
                        </p>
                      </div>
                    </div>
                    <input
                      value={destinationAddress}
                      onChange={(event) => setDestinationAddress(event.target.value)}
                      placeholder={placeholder}
                      className="h-12 w-full rounded-xl border border-border bg-input px-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-gold/50"
                    />
                    <button
                      onClick={useDemoDestination}
                      className="w-full rounded-xl border border-border/60 py-3 text-xs font-semibold text-foreground transition-colors hover:border-gold/40 hover:text-gold"
                    >
                      Use Demo {networkLabel} Wallet
                    </button>
                    {addressError && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {addressError}
                      </p>
                    )}
                    <button
                      onClick={submitAddress}
                      className="w-full rounded-xl bg-gold py-4 text-sm font-semibold text-background"
                    >
                      Submit Refund Wallet
                    </button>
                  </div>
                )}

                {request.status === "destination_kyt_passed" && (
                  <div className="card-wine rounded-xl p-4 space-y-3 border-success/30">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <div>
                        <p className="text-sm font-semibold text-success">Destination wallet cleared</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          KYT reference {request.kytResult?.reference}. The case can now be submitted for treasury approval.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={sendForApproval}
                      className="w-full rounded-xl bg-gold py-4 text-sm font-semibold text-background"
                    >
                      Send for Treasury Approval
                    </button>
                  </div>
                )}

                {(request.status === "approval_pending" || request.status === "approved" || request.status === "completed") && (
                  <div className="card-gold rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      {request.status === "completed" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {request.status === "completed" ? "Refund completed" : "Treasury review in progress"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {request.status === "completed"
                            ? `Transfer ${request.payout.transferId} was completed on-chain.`
                            : "Casino treasury and compliance staff must approve the payout before Hex Safe signing."}
                        </p>
                        {request.payout.txHash && (
                          <p className="mt-2 truncate font-mono text-[10px] text-gold">{request.payout.txHash}</p>
                        )}
                        {request.status === "approval_pending" && (
                          <button
                            onClick={() => navigate("/casino-ops")}
                            className="mt-3 rounded-lg border border-gold/40 px-3 py-2 text-xs font-semibold text-gold"
                          >
                            Open Staff Approval Demo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {(request.status === "manual_review" || request.status === "rejected") && (
                  <div className="card-wine rounded-xl border-warning/40 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {request.status === "rejected" ? "Refund wallet rejected" : "Manual review required"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {request.kytResult?.note || "Support will review the refund destination before payout can continue."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Refund process</p>
              {REFUND_PROCESS_STEPS.map((step, index) => (
                <div key={step.title} className="flex gap-3 rounded-xl border border-border/50 bg-card/50 px-3 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/10 text-[10px] font-semibold text-gold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{step.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
