/**
 * LeaderApprovalPanel — 单一领导审批工作台(2026-08-21)。
 *
 * 只读 leader_pending 队列并做客户服务准入决策:
 *  - 业务摘要: Host rationale、KYC passed/valid-until、来源分类、预期资产/网络/金额、
 *    pre-check 状态;
 *  - approved -> service_enabled; rejected 必填业务原因;
 *  - 绝不渲染原始证件、地址、钱包地址、provider 响应或内部 KYC 原因。
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Gavel, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiError, leaderApi, type LeaderCase } from "@/lib/api";
import {
  leaderIntendedPaymentLabel,
  leaderKycSummary,
  leaderReasonRequired,
} from "@/lib/leader-approval";
import { ActionBtn, EmptyState, Field, LoadingSkeleton, PanelHeader, Pill, type Tone } from "@/components/ops-ui";

function statusTone(status: string): Tone {
  if (status === "leader_pending") return "warning";
  if (status === "service_enabled") return "success";
  if (status === "rejected") return "danger";
  return "neutral";
}

export default function LeaderApprovalPanel() {
  const [cases, setCases] = useState<LeaderCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await leaderApi.cases();
      setCases(res.data.cases);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (caseId: string, decision: "approved" | "rejected") => {
    const reason = (rejectReasons[caseId] || "").trim();
    if (leaderReasonRequired(decision) && !reason) {
      toast.error("A business reason is required to reject an admission case.");
      return;
    }
    setBusyId(caseId);
    try {
      await leaderApi.decide(caseId, decision, reason || undefined);
      toast.success(decision === "approved" ? "Admission approved — service enabled." : "Admission rejected.");
      await load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="space-y-5">
      <PanelHeader
        icon={Gavel}
        eyebrow="Single leader"
        title="Leader Approval"
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      {loading ? (
        <LoadingSkeleton rows={2} />
      ) : cases.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="Nothing awaiting your decision"
          description="Cases appear here once they pass KYC and the payment pre-check."
        />
      ) : null}

      <div className="space-y-3">
        {cases.map((c) => {
          const kyc = leaderKycSummary(c);
          return (
            <div key={c.id} className="card-interactive rounded-lg border border-border/60 bg-card/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gold">{c.id.slice(0, 8)}</span>
                  <span className="text-sm font-semibold text-foreground">{c.patronEmailMasked}</span>
                  <Pill tone={statusTone(c.status)}>{c.status.replace(/_/g, " ")}</Pill>
                </div>
                <span className="text-xs text-muted-foreground">Host: {c.hostName}</span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Business rationale">{c.servicePurpose || "—"}</Field>
                <Field label="KYC">
                  {kyc.passed ? `Passed · valid until ${kyc.validUntilLabel}` : "Not passed"}
                </Field>
                <Field label="Intended payment">
                  {leaderIntendedPaymentLabel(c.intendedPayment)}
                </Field>
                <Field label="Route">
                  {c.route === "complete_dossier" ? "Complete dossier" : "KYC-first"}
                </Field>
              </div>

              <div className="mt-2">
                <Field label="Host note (business context)">
                  {c.hostNotes || "—"}
                </Field>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-2">
                <ActionBtn
                  icon={CheckCircle2}
                  tone="success"
                  onClick={() => void decide(c.id, "approved")}
                  disabled={busyId === c.id}
                >
                  Approve
                </ActionBtn>
                <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-end">
                  <input
                    value={rejectReasons[c.id] || ""}
                    onChange={(e) => setRejectReasons((p) => ({ ...p, [c.id]: e.target.value }))}
                    placeholder="Rejection reason (required to reject)"
                    className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs outline-none focus:border-gold/50"
                  />
                  <ActionBtn
                    icon={XCircle}
                    tone="danger"
                    onClick={() => void decide(c.id, "rejected")}
                    disabled={busyId === c.id}
                  >
                    Reject
                  </ActionBtn>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
