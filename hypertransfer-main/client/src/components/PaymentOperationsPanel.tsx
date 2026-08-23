/**
 * PaymentOperationsPanel — HK Operations 视图(2026-08-21)。
 *
 * 展示 payment intents 的两段转账(verification / main)、Travel Rule/KYT 状态、
 * Notabene reference、托管地址与 TxID;HK Operations 手动录入 **Cage confirmation ID**,
 * 之后 Finance 录入 reconciliation。legacy deposit_requests 的 marker 记录原样保留
 * (见 DepositQueuePanel)。
 */
import { useCallback, useEffect, useState } from "react";
import { Boxes, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { apiError, operationsApi, type PaymentCaseView } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";
import { ActionBtn, EmptyState, Field, LoadingSkeleton, PanelHeader, Pill, type Tone } from "@/components/ops-ui";

function legTone(leg: PaymentCaseView["transferLeg"]): Tone {
  return leg === "main" ? "success" : "neutral";
}

export default function PaymentOperationsPanel() {
  const { t } = useI18n();
  const [cases, setCases] = useState<PaymentCaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [cageDrafts, setCageDrafts] = useState<Record<string, string>>({});
  const [reconDrafts, setReconDrafts] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [casesRes, flagsRes] = await Promise.all([
        operationsApi.paymentCases(),
        operationsApi.monitoringFlags().catch(() => ({ data: { flags: [] as never[] } })),
      ]);
      setCases(casesRes.data.cases);
      setFlags(flagsRes.data.flags.length);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recordCage = async (packId: string) => {
    const cage = (cageDrafts[packId] || "").trim();
    if (!cage) {
      toast.error(t("opsPanel.cageRequired"));
      return;
    }
    setBusyId(packId);
    try {
      await operationsApi.cageConfirmation(packId, cage);
      toast.success(t("opsPanel.cageRecorded"));
      await load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusyId("");
    }
  };

  const reconcile = async (packId: string) => {
    const ref = (reconDrafts[packId] || "").trim();
    if (!ref) {
      toast.error(t("opsPanel.reconRequired"));
      return;
    }
    setBusyId(packId);
    try {
      await operationsApi.reconcile(packId, ref);
      toast.success(t("opsPanel.reconRecorded"));
      await load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusyId("");
    }
  };

  const runMonitoring = async () => {
    setBusyId("monitor");
    try {
      const res = await operationsApi.runMonitoring();
      toast.success(`Monitoring flagged ${res.data.flagged} linked-transfer event(s) for Compliance.`);
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
        icon={Boxes}
        eyebrow={t("opsPanel.hkOperations")}
        title={t("opsPanel.title")}
        onRefresh={() => void load()}
        refreshing={loading}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={flags > 0 ? "danger" : "success"}>{`${flags} compliance flag(s)`}</Pill>
        <ActionBtn icon={ShieldCheck} tone="warning" onClick={runMonitoring} disabled={busyId === "monitor"}>
          {t("opsPanel.runMonitoring")}
        </ActionBtn>
      </div>

      {loading ? (
        <LoadingSkeleton rows={2} />
      ) : cases.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={t("opsPanel.noCases")}
          description={t("opsPanel.emptyHint")}
        />
      ) : null}

      <div className="space-y-3">
        {cases.map((c) => {
          const main = c.transferLeg === "main";
          const confirmed = Boolean(c.finalizedAt);
          return (
            <div key={c.packId} className="card-interactive rounded-lg border border-border/60 bg-card/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gold">{c.packId.slice(0, 8)}</span>
                  <Pill tone={legTone(c.transferLeg)}>{c.transferLeg}</Pill>
                  <Pill tone={c.travelRuleDepth === "enhanced" ? "success" : "neutral"}>
                    {`${c.travelRuleDepth} Travel Rule`}
                  </Pill>
                </div>
                <span className="text-xs text-muted-foreground">{c.patronEmailMasked}</span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("opsPanel.amount")}>
                  {c.actualAmount} {c.asset} · HKD {Number(c.actualHkdAmount).toLocaleString()}
                </Field>
                <Field label={t("opsPanel.compliance")}>
                  KYT {c.kytStatus} · TR {c.travelRuleStatus}
                </Field>
                <Field label={t("opsPanel.notabene")}>{c.notabeneReference || "—"}</Field>
                <Field label={t("opsPanel.custodyTx")}>
                  <span className="block max-w-[160px] truncate">{c.custodyAddress || "—"}</span>
                  <span className="block max-w-[160px] truncate">{c.txHash || "—"}</span>
                </Field>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={t("opsPanel.cageConfirmationId")}>{c.cageConfirmationId || "—"}</Field>
                <Field label={t("opsPanel.reconciliation")}>
                  {c.reconciliationRef || "—"}
                  {c.reconciledAt ? ` · ${new Date(c.reconciledAt * 1000).toLocaleString()}` : ""}
                </Field>
                <Field label={t("opsPanel.mainTransfer")}>{confirmed ? t("opsPanel.confirmed") : t("opsPanel.pending")}</Field>
                <Field label={t("opsPanel.retentionUntil")}>
                  {c.retentionUntil ? new Date(c.retentionUntil * 1000).toLocaleDateString() : "—"}
                </Field>
              </div>

              {main && (
                <div className="mt-4 flex flex-wrap items-end gap-2">
                  {!c.cageConfirmationId && (
                    <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-end">
                      <input
                        value={cageDrafts[c.packId] || ""}
                        onChange={(e) => setCageDrafts((p) => ({ ...p, [c.packId]: e.target.value }))}
                        placeholder="Cage confirmation ID *"
                        className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs outline-none focus:border-gold/50"
                      />
                      <ActionBtn
                        icon={RefreshCw}
                        tone="success"
                        onClick={() => void recordCage(c.packId)}
                        disabled={busyId === c.packId}
                      >
                        {t("opsPanel.recordCage")}
                      </ActionBtn>
                    </div>
                  )}
                  {c.cageConfirmationId && !c.reconciliationRef && (
                    <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-end">
                      <input
                        value={reconDrafts[c.packId] || ""}
                        onChange={(e) => setReconDrafts((p) => ({ ...p, [c.packId]: e.target.value }))}
                        placeholder="Finance reconciliation ref *"
                        className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs outline-none focus:border-gold/50"
                      />
                      <ActionBtn
                        icon={ShieldCheck}
                        tone="success"
                        onClick={() => void reconcile(c.packId)}
                        disabled={busyId === c.packId}
                      >
                        {t("opsPanel.recordReconciliation")}
                      </ActionBtn>
                    </div>
                  )}
                  {c.cageConfirmationId && c.reconciliationRef && (
                    <span className="text-xs text-success">Settled — Cage {c.cageConfirmationId} · {c.reconciliationRef}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
