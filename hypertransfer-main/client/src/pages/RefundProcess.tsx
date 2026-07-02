/**
 * RefundProcess — Customer-facing withdrawal / return request.
 * Treasury approval and Hex Safe payout execution stay in the staff portal.
 *
 * 口径来源: 最终流程 v1 §C「RETURN」+ 规则 #10/#11
 *   - 退款金额**不绑定**入金额: 可多可少, 客户端不设上限, 由员工端 "Sufficient Fund in Vault?"
 *     + 管理层审批兜底(process v1 §C 第 5 步)。后端 /api/refunds 早已接受任意 amountDecimal。
 *   - 退款只能退回客户**此前已验证过的原钱包**(verified_wallets), 严禁自由输入新地址(规则 #10)。
 *   - 退款前重新 KYT 筛查(Wallet clear?), 再走管理层审批。
 * 本页因此重构为 "Return to a verified wallet": 选原钱包 → 输任意金额 → 可选原因 → 提交,
 * 不再以单笔已完成入金为中心、不再把金额写死成 latestMainTx.amount。
 */
import { useEffect, useMemo, useState } from "react";
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
import { apiError, refundApi, type VerifiedWallet } from "@/lib/api";
import {
  createRefundRequest,
  formatRefundStatus,
  REFUND_PROCESS_STEPS,
  REFUND_REASON_LABELS,
  submitRefundDestination,
  submitRefundForApproval,
  type RefundReason,
  type RefundStatus,
} from "@/lib/refund-process";

const reasonOptions = Object.entries(REFUND_REASON_LABELS) as [RefundReason, string][];

// 退款可选目标(只读): 来自后端 verified_wallets, 无则回退到本次入金的来源钱包(demo)。
interface RefundWalletOption {
  id: string;
  address: string;
  network: "tron" | "ethereum" | "demo";
  chainLabel: string;
  source: "verified" | "demo";
}

function statusTone(status: RefundStatus) {
  if (status === "completed" || status === "approved" || status === "destination_kyt_passed") return "text-success";
  if (status === "rejected" || status === "failed") return "text-destructive";
  if (status === "manual_review") return "text-warning";
  return "text-gold";
}

function shortAddr(addr: string) {
  return addr.length > 18 ? `${addr.slice(0, 10)}…${addr.slice(-6)}` : addr;
}

export default function RefundProcess() {
  const [, navigate] = useLocation();
  const { state, updateState, seedRefundDemo } = useDemo();
  const [reason, setReason] = useState<RefundReason>("customer_cancelled");
  const [verifiedWallets, setVerifiedWallets] = useState<VerifiedWallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [pickError, setPickError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 拉取本人已验证原钱包(后端真实)。失败/为空 → 回退 demo(入金来源钱包)。
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

  const asset = state.selectedAsset || "USDT";
  const request = state.refundRequest;
  // 仅作"最近一笔入金"参考(留痕/审计用), 退款金额不依赖它。
  const latestMainTx = useMemo(
    () => state.transactions.find((tx) => tx.type === "main" && (tx.status === "confirmed" || tx.status === "cleared")),
    [state.transactions],
  );

  // 候选钱包: 优先后端 verified_wallets; 否则回退到入金来源钱包(demo, 客户已通过筛查 + 1 USDT 验证)。
  const walletOptions = useMemo<RefundWalletOption[]>(() => {
    if (verifiedWallets.length) {
      return verifiedWallets.map((w) => {
        const isTron = w.chainId.includes("tron");
        return {
          id: w.id,
          address: w.address,
          network: (isTron ? "tron" : "ethereum") as RefundWalletOption["network"],
          chainLabel: isTron ? "TRC-20" : "ERC-20",
          source: "verified" as const,
        };
      });
    }
    if (state.sourceWallet) {
      const net = (state.selectedNetwork || "demo") as string;
      const network: RefundWalletOption["network"] =
        net === "tron" ? "tron" : net === "ethereum" ? "ethereum" : "demo";
      return [
        {
          id: `demo:${state.sourceWallet}`,
          address: state.sourceWallet,
          network,
          chainLabel: network === "tron" ? "TRC-20" : network === "ethereum" ? "ERC-20" : "Demo",
          source: "demo" as const,
        },
      ];
    }
    return [];
  }, [verifiedWallets, state.sourceWallet, state.selectedNetwork]);

  // 资格: 有已验证原钱包(后端或 demo)即可发起。KYC 闸门在首页入口 + 后端 /api/refunds 已校验。
  const canRequestRefund = walletOptions.length > 0;
  const parsedAmount = parseFloat(amount.replace(/,/g, "")) || 0;

  // 默认选中首项; 候选变化(后端 verified wallets 异步到达, 替换掉 demo 回退)时, 若当前选中已不在列表则重选。
  useEffect(() => {
    if (walletOptions.length && !walletOptions.some((w) => w.id === selectedWalletId)) {
      setSelectedWalletId(walletOptions[0].id);
    }
  }, [walletOptions, selectedWalletId]);

  const handleAmountChange = (value: string) => {
    const normalized = value.replace(/,/g, "");
    if (/^\d*\.?\d{0,6}$/.test(normalized)) {
      setAmount(normalized);
      setAmountError("");
    }
  };

  const loadDemoRefundCase = () => {
    seedRefundDemo();
    setReason("customer_cancelled");
    setSelectedWalletId("");
    setAmount("");
    setPickError("");
    setAmountError("");
    toast.success("Demo verified wallet loaded", {
      description: "A KYC-approved customer with a verified TRC-20 wallet is ready for withdrawal testing.",
    });
  };

  // 一步提交: 选钱包 + 任意金额 + 原因 → 建退款单(本地状态机展示) + 真实后端 /api/refunds(verified 钱包)。
  const createRefund = async () => {
    const picked = walletOptions.find((w) => w.id === selectedWalletId);
    if (!picked) {
      setPickError("Select a previously verified wallet to receive the withdrawal.");
      return;
    }
    if (parsedAmount <= 0) {
      setAmountError("Enter the amount you want returned.");
      return;
    }
    setPickError("");
    setAmountError("");
    setSubmitting(true);

    try {
      // 本地退款单(驱动 UI 状态展示)。金额来自用户输入, 与入金额无关。
      const base = createRefundRequest({
        originalDepositSessionId: latestMainTx?.sessionId || "",
        originalTxHash: latestMainTx?.txHash || "",
        asset,
        network: picked.network,
        amount: parsedAmount,
        reason,
      });

      // 真实路径: 选中的是后端已验证原钱包 → 创建真实退款单(强制 walletId, 后端再校验所属 + 任意金额)。
      if (picked.source === "verified") {
        try {
          const { data } = await refundApi.create({
            walletId: picked.id,
            amountDecimal: String(parsedAmount),
            reason,
          });
          const next = submitRefundForApproval(submitRefundDestination(base, picked.address));
          updateState({ refundRequest: { ...next, id: data.requestId } });
          toast.success("Withdrawal request submitted", {
            description: `Request ${data.requestId} — compliance & treasury will review in the staff portal.`,
          });
          return;
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status;
          // 真实拒绝(walletId 非本人 400 / 未登录 401 / KYC 403 等) → 如实暴露, 不伪装成功;
          // 仅网络不可达 / 未部署(无响应或 404)才落回本地 demo, 保证演示不中断。
          if (status && status !== 404) {
            setPickError(apiError(err));
            toast.error("Withdrawal request rejected", { description: apiError(err) });
            return;
          }
          toast.message("Using local demo flow", { description: apiError(err) });
        }
      }

      // demo 路径: 仅退回入金来源钱包(已验证), 走本地状态机做 KYT 展示。
      const next = submitRefundDestination(base, picked.address);
      updateState({ refundRequest: next });
      if (next.status === "destination_kyt_passed") {
        toast.success("Withdrawal wallet passed KYT", { description: next.kytResult?.reference });
      } else if (next.status === "manual_review") {
        toast.warning("Manual review required", { description: next.kytResult?.note });
      } else {
        toast.error("Withdrawal wallet rejected", { description: next.kytResult?.note });
      }
    } catch (err) {
      // createRefundRequest 的 Phase 1 资产/网络兜底校验(理论上 USDT + 已验证钱包不会触发)。
      toast.error("Withdrawal unavailable", {
        description: err instanceof Error ? err.message : "Unsupported asset or network.",
      });
    } finally {
      setSubmitting(false);
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
    <Shell showBack backTo="/dashboard" title="Request a Withdrawal" subtitle="Return funds to a verified wallet">
      <div className="space-y-5">
        {!canRequestRefund && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-gold rounded-xl p-5 text-center"
          >
            <Undo2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-semibold text-foreground">No verified wallet on file</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              For your protection, withdrawals can only be returned to a wallet you previously verified during a deposit.
              Complete a deposit&apos;s 1 USDT wallet verification first, then funds can be returned to that original wallet.
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
              Load Demo Withdrawal Case
            </button>
          </motion.div>
        )}

        {canRequestRefund && (
          <>
            {/* 输入区: 选已验证原钱包 + 任意金额 + 可选原因 (仅在尚未建单时显示) */}
            {!request && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card-wine rounded-xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Return to a verified wallet</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Funds are returned only to a wallet you previously verified — new addresses cannot be entered.
                        The amount can differ from any single deposit; treasury verifies the vault balance before payout.
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* 已验证钱包选择 */}
                <div className="card-gold rounded-xl p-4 space-y-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verified wallet</p>
                  <div className="space-y-2">
                    {walletOptions.map((w) => {
                      const active = selectedWalletId === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setSelectedWalletId(w.id);
                            setPickError("");
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                            active ? "border-gold/70 bg-gold/5" : "border-border bg-input hover:border-gold/40"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs text-foreground">{shortAddr(w.address)}</p>
                            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                              {w.chainLabel} · {w.source === "verified" ? "Verified wallet" : "Deposit source wallet"}
                            </p>
                          </div>
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              active ? "border-gold" : "border-border"
                            }`}
                          >
                            {active && <span className="h-2 w-2 rounded-full bg-gold" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {pickError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {pickError}
                    </p>
                  )}
                </div>

                {/* 退款金额 (自由输入, 可多可少) */}
                <div className="card-gold rounded-xl p-4 space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Withdrawal amount</label>
                  <div className="relative">
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder="0.00"
                      className="h-14 w-full rounded-xl border border-border bg-input pr-16 pl-3 text-lg font-semibold text-foreground outline-none focus:border-gold/50"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gold">
                      {asset}
                    </span>
                  </div>
                  {parsedAmount > 0 && (
                    <p className="text-xs text-muted-foreground">≈ {getHKDEquivalent(parsedAmount, asset)}</p>
                  )}
                  {latestMainTx && (
                    <p className="text-[10px] text-muted-foreground/60">
                      Most recent deposit: {formatAssetAmount(parseFloat(latestMainTx.amount) || 0, 0)} {latestMainTx.asset}
                      {" "}· the withdrawal amount does not have to match.
                    </p>
                  )}
                  {amountError && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {amountError}
                    </p>
                  )}
                </div>

                {/* 退款原因 (可选, 供员工端审批参考) */}
                <div className="card-wine rounded-xl p-4 space-y-3">
                  <label className="block text-xs font-medium text-muted-foreground">Withdrawal reason</label>
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
                    onClick={createRefund}
                    disabled={submitting || parsedAmount <= 0 || !selectedWalletId}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold py-4 text-sm font-semibold text-background disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Create Withdrawal Request"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}

            {/* 已建单: 状态追踪 */}
            {request && (
              <>
                <div className="card-gold rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Withdrawal case</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-foreground">{request.id}</p>
                    </div>
                    <span className={`text-xs font-semibold capitalize ${statusTone(request.status)}`}>
                      {formatRefundStatus(request.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-secondary/20 px-3 py-2">
                      <p className="text-muted-foreground">Amount</p>
                      <p className="mt-1 text-foreground">
                        {formatAssetAmount(request.amount, 0)} {request.asset}
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary/20 px-3 py-2">
                      <p className="text-muted-foreground">Destination</p>
                      <p className="mt-1 truncate font-mono text-foreground">{shortAddr(request.destinationAddress)}</p>
                    </div>
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
                          {request.status === "completed" ? "Withdrawal completed" : "Treasury review in progress"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {request.status === "completed"
                            ? `Transfer ${request.payout.transferId} was completed on-chain.`
                            : "Casino treasury and compliance staff must approve the payout (including vault balance) before Hex Safe signing."}
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
                          {request.status === "rejected" ? "Withdrawal wallet rejected" : "Manual review required"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {request.kytResult?.note || "Support will review the withdrawal destination before payout can continue."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Withdrawal process</p>
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
