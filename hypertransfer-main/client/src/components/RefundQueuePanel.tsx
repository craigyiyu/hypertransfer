/**
 * RefundQueuePanel — 真实退款队列审批(staff/casino-ops 用)。
 *
 * 调后端 /api/refunds*(compliance/ops/custodian/admin 角色守卫): 队列 / 合规 KYT screen /
 * 管理层 approve / reject / custodian execute(真实 Hex Safe withdrawal 退回原钱包)。
 * process v1 §C: re-KYC + 原钱包 re-KYT + 管理层审批 + vault 余额 + 强制原路退回。
 * 按钮按当前 staff 角色显隐(UX); 真正防越权靠后端 require_role。自包含, 由 CasinoOpsPortal 渲染。
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Undo2, RefreshCw, ShieldCheck, Gavel, SendHorizontal, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { apiError, refundApi, type RefundRecord } from "@/lib/api";

function Pill({ children, tone = "neutral" }: { children: string; tone?: "success" | "warning" | "danger" | "neutral" }) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "warning"
      ? "border-warning/30 bg-warning/10 text-warning"
      : tone === "danger"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-border/50 bg-secondary/30 text-muted-foreground";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" {
  if (s === "completed" || s === "approved") return "success";
  if (s === "rejected" || s === "kyc_failed" || s === "kyt_failed" || s === "insufficient_funds" || s === "failed")
    return "danger";
  if (s === "requested") return "warning";
  return "neutral";
}

function shortAddr(a: string | null) {
  if (!a) return "—";
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

export default function RefundQueuePanel() {
  const { user } = useAuth();
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const roles = useMemo(() => new Set(user?.roles ?? []), [user]);
  const isAdmin = roles.has("admin");
  const canScreen = isAdmin || roles.has("compliance");
  const canApprove = isAdmin || roles.has("compliance");
  const canExecute = isAdmin || roles.has("custodian");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await refundApi.queue();
      setRefunds(data.refunds ?? []);
    } catch (err) {
      // 403 = 当前 staff 角色无权看退款队列(rm/marketing); 友好提示而非红错。
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 403 ? "Your staff role cannot view the refund queue (needs compliance / ops / custodian)." : apiError(err));
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error("Action failed", { description: apiError(err) });
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
            <Undo2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Refund Queue — Live /api/refunds
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              Compliance KYT → Management approval → Custodian payout
            </h2>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-gold/30 hover:text-gold disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="mb-2 text-[11px] text-muted-foreground">
        Your roles: {(user?.roles ?? []).join(", ") || "—"} · Refunds return only to a customer&apos;s previously-verified
        original wallet (enforced server-side).
      </p>
      <p className="mb-3 rounded-lg border border-border/40 bg-background/30 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Gate execution — <span className="text-foreground">KYC</span>: Sumsub API (auto, valid 6 months; re-do on expiry) ·{" "}
        <span className="text-foreground">Wallet KYT</span>: Hex Safe API (re-screen original wallet — currently mock, endpoint TBD) ·{" "}
        <span className="text-foreground">Sufficient funds</span>: checked manually in the Hex Trust portal before custodian payout.
      </p>

      {error && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{error}</p>
      )}

      {!error && refunds.length === 0 && (
        <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
          {loading ? "Loading refund queue…" : "No refund requests in the queue."}
        </p>
      )}

      <div className="space-y-3">
        {refunds.map((r) => {
          const busy = busyId === r.id;
          // 动作门(同时受后端 require_role 守卫): screen 仅 requested 且未判 KYT; approve 需 KYC ok + KYT pass; execute 需 approved。
          const showScreen = canScreen && r.status === "requested" && (!r.kytStatus || r.kytStatus === "manual_review");
          const showApprove = canApprove && r.status === "requested" && r.kycOk && r.kytStatus === "pass";
          const showExecute = canExecute && r.status === "approved";
          const showReject = (canApprove || canScreen) && (r.status === "requested" || r.status === "approved");
          return (
            <div key={r.id} className="rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">{r.id}</span>
                <Pill tone={statusTone(r.status)}>{r.status}</Pill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Amount">{r.amountDecimal} {r.asset}</Field>
                <Field label="Chain">{r.chainId}</Field>
                <Field label="KYC" hint="Sumsub · 6-mo">{r.kycOk ? "ok" : "failed"}</Field>
                <Field label="Wallet KYT" hint="Hex Safe API · mock">{r.kytStatus || "not screened"}</Field>
                <Field label="Original wallet (verified)">
                  <span className="font-mono">{shortAddr(r.toAddress)}</span>
                </Field>
                <Field label="Reason">{r.reason || "—"}</Field>
                <Field label="Approved by">{r.approvedBy ? r.approvedBy.slice(0, 8) + "…" : "—"}</Field>
                <Field label="Transfer ID">{r.transferId ? r.transferId.slice(0, 12) + "…" : "—"}</Field>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {showScreen && (
                  <>
                    <ActionBtn icon={ShieldCheck} disabled={busy} tone="neutral"
                      onClick={() => void act(r.id, () => refundApi.screen(r.id, "pass"), "KYT marked pass")}>
                      KYT Pass
                    </ActionBtn>
                    <ActionBtn icon={ShieldCheck} disabled={busy} tone="warning"
                      onClick={() => void act(r.id, () => refundApi.screen(r.id, "manual_review"), "KYT → manual review")}>
                      Manual review
                    </ActionBtn>
                    <ActionBtn icon={XCircle} disabled={busy} tone="danger"
                      onClick={() => void act(r.id, () => refundApi.screen(r.id, "reject"), "KYT rejected")}>
                      KYT Reject
                    </ActionBtn>
                  </>
                )}
                {showApprove && (
                  <ActionBtn icon={Gavel} disabled={busy} tone="success"
                    onClick={() => void act(r.id, () => refundApi.approve(r.id), "Refund approved by management")}>
                    Approve (Management)
                  </ActionBtn>
                )}
                {showExecute && (
                  <ActionBtn icon={SendHorizontal} disabled={busy} tone="danger"
                    onClick={() => void act(r.id, () => refundApi.execute(r.id), "Refund payout submitted to custodian")}>
                    Execute payout (Custodian)
                  </ActionBtn>
                )}
                {showReject && (
                  <ActionBtn icon={XCircle} disabled={busy} tone="neutral"
                    onClick={() => void act(r.id, () => refundApi.reject(r.id), "Refund rejected")}>
                    Reject
                  </ActionBtn>
                )}
                {!showScreen && !showApprove && !showExecute && !showReject && (
                  <span className="text-[11px] text-muted-foreground">No action available for your role at this status.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg bg-background/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs text-foreground">{children}</p>
      {hint && <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/50">{hint}</p>}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  icon: Icon,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon: typeof ShieldCheck;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const cls =
    tone === "success"
      ? "border-success/40 text-success hover:bg-success/10"
      : tone === "warning"
      ? "border-warning/40 text-warning hover:bg-warning/10"
      : tone === "danger"
      ? "border-destructive/40 text-destructive hover:bg-destructive/10"
      : "border-border/60 text-muted-foreground hover:border-gold/30 hover:text-gold";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
