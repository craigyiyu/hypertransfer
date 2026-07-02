/**
 * DepositQueuePanel — 真实入金队列(staff/casino-ops 用)。
 *
 * 调后端 GET /api/deposits(compliance/ops/custodian) + Marker 录回(marketing/ops) +
 * settle(custodian/ops, Forex 兑法币 demo + 生成 Receipt)。按 useAuth 角色显隐, 后端 require_role 守卫。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Tag, Banknote } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { apiError, depositApi, type DepositRecord } from "@/lib/api";
import { ActionBtn, Field, PanelHeader, Pill, shortAddr, type Tone } from "@/components/ops-ui";
import { formatNetworkRail } from "@/lib/compliance";
import {
  DEMO_DEPOSIT_SETTLEMENT_EVENT,
  readDemoDepositSettlement,
  writeDemoDepositSettlement,
  type DemoDepositSettlementRecord,
} from "@/lib/demo-deposit-settlement";

function statusTone(s: string): Tone {
  if (s === "settled" || s === "verified") return "success";
  if (s === "screening_failed" || s === "cancelled") return "danger";
  if (s === "created" || s === "screening_passed") return "neutral";
  return "warning";
}

const FALLBACK_SETTLEMENT = {
  status: "pending_marker" as const,
  markerRef: "",
  markerIssuedAt: "",
  receiptRef: "",
};

export default function DepositQueuePanel() {
  const { user } = useAuth();
  const { state, updateState } = useDemo();
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [markerDraft, setMarkerDraft] = useState<Record<string, string>>({});
  const [demoRecord, setDemoRecord] = useState<DemoDepositSettlementRecord | null>(() => readDemoDepositSettlement());

  const roles = useMemo(() => new Set(user?.roles ?? []), [user]);
  const isAdmin = roles.has("admin");
  const canMarker = isAdmin || roles.has("marketing") || roles.has("ops");
  const canSettle = isAdmin || roles.has("custodian") || roles.has("ops");
  const demoMainTx = useMemo(
    () => state.transactions.find((tx) => tx.type === "main" && (tx.status === "confirmed" || tx.status === "cleared")),
    [state.transactions],
  );
  const showDemoDeposit = !state.depositRequestId && Boolean(demoRecord || (state.mainDepositConfirmed && demoMainTx));
  const demoReferenceId = demoRecord?.referenceId || (demoMainTx?.txHash ? `HT-${demoMainTx.txHash.slice(2, 12).toUpperCase()}` : "HT-DEMO-DEPOSIT");
  const localSettlement = demoRecord
    ? {
        status: demoRecord.status,
        markerRef: demoRecord.markerRef,
        markerIssuedAt: demoRecord.markerIssuedAt,
        receiptRef: demoRecord.receiptRef,
      }
    : state.depositSettlement ?? FALLBACK_SETTLEMENT;
  const demoAsset = demoRecord?.asset || state.selectedAsset;
  const demoNetwork = demoRecord?.network || state.selectedNetwork || "demo";
  const demoAmount = demoRecord?.amountDecimal || state.mainDepositAmount || "—";
  const demoTxHash = demoRecord?.txHash || demoMainTx?.txHash || "";
  const demoSourceWallet = demoRecord?.sourceWallet || state.sourceWallet;
  const demoDepositAddress = demoRecord?.depositAddress || state.depositAddress;
  const demoTravelRuleStatus = demoRecord?.travelRuleStatus || state.travelRuleStatus;
  const demoScreeningStatus = demoRecord?.screeningStatus || (state.screeningPassed ? "pass" : "demo pass");
  const demoVerifyStatus = demoRecord?.verifyStatus || (state.testPaymentConfirmed ? "confirmed" : "pending");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await depositApi.queue();
      setDeposits(data.deposits ?? []);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 403 ? "Your staff role cannot view the deposit queue (needs compliance / ops / custodian)." : apiError(err));
      setDeposits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const syncDemoRecord = () => setDemoRecord(readDemoDepositSettlement());
    window.addEventListener("storage", syncDemoRecord);
    window.addEventListener(DEMO_DEPOSIT_SETTLEMENT_EVENT, syncDemoRecord);
    return () => {
      window.removeEventListener("storage", syncDemoRecord);
      window.removeEventListener(DEMO_DEPOSIT_SETTLEMENT_EVENT, syncDemoRecord);
    };
  }, []);

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

  const saveDemoMarker = () => {
    const markerRef = (markerDraft.__demo ?? localSettlement.markerRef ?? "").trim();
    if (!markerRef) return;
    const now = new Date().toISOString();
    const nextRecord: DemoDepositSettlementRecord = {
      referenceId: demoReferenceId,
      asset: demoAsset,
      network: demoNetwork,
      amountDecimal: demoAmount,
      sourceWallet: demoSourceWallet,
      depositAddress: demoDepositAddress,
      txHash: demoTxHash,
      travelRuleStatus: demoTravelRuleStatus,
      screeningStatus: demoScreeningStatus,
      verifyStatus: demoVerifyStatus,
      status: "marker_issued",
      markerRef,
      markerIssuedAt: now,
      receiptRef: localSettlement.receiptRef,
      updatedAt: now,
    };
    writeDemoDepositSettlement(nextRecord);
    setDemoRecord(nextRecord);
    updateState({
      depositSettlement: {
        ...localSettlement,
        status: "marker_issued",
        markerRef,
        markerIssuedAt: now,
      },
    });
    toast.success("Demo marker saved");
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm">
      <PanelHeader
        icon={Boxes}
        eyebrow="Deposit Queue — Live /api/deposits"
        title="Source-wallet KYT · 1 USDT verify · Marker · Forex settlement"
        onRefresh={() => void load()}
        refreshing={loading}
      />
      <p className="mb-3 text-[11px] text-muted-foreground">
        Your roles: {(user?.roles ?? []).join(", ") || "—"} · Marker &amp; fiat settlement are demo (Hex Trust OTC has no
        quote/order API).
      </p>

      {error && <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{error}</p>}
      {!error && deposits.length === 0 && !showDemoDeposit && (
        <p className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
          {loading ? "Loading deposit queue…" : "No deposit requests in the queue."}
        </p>
      )}

      <div className="space-y-3">
        {showDemoDeposit && (
          <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-foreground">{demoReferenceId}</span>
              <Pill tone={localSettlement.markerRef ? "success" : "warning"}>
                {localSettlement.markerRef ? "marker issued" : "pending marker"}
              </Pill>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Asset / network">{demoAsset} · {formatNetworkRail(demoNetwork)}</Field>
              <Field label="Amount">{demoAmount}</Field>
              <Field label="Source wallet KYT">{demoScreeningStatus}</Field>
              <Field label="1 USDT verify">{demoVerifyStatus}</Field>
              <Field label="Travel Rule">{demoTravelRuleStatus}</Field>
              <Field label="Deposit address"><span className="font-mono">{shortAddr(demoDepositAddress)}</span></Field>
              <Field label="Marker">{localSettlement.markerRef || "—"}</Field>
              <Field label="Settlement">{localSettlement.receiptRef || "pending marker"}</Field>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              {canMarker ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Marker ref</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={markerDraft.__demo ?? localSettlement.markerRef ?? ""}
                      onChange={(e) => setMarkerDraft({ ...markerDraft, __demo: e.target.value })}
                      placeholder="External marker reference"
                      className="w-44 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs font-mono"
                    />
                    <ActionBtn
                      icon={Tag}
                      disabled={!(markerDraft.__demo ?? localSettlement.markerRef ?? "").trim()}
                      onClick={saveDemoMarker}
                    >
                      Save marker
                    </ActionBtn>
                  </div>
                </div>
              ) : (
                <span className="text-[11px] text-muted-foreground">No marker action available for your role.</span>
              )}
            </div>
          </div>
        )}
        {deposits.map((d) => {
          const busy = busyId === d.id;
          const verified = d.verifyStatus === "confirmed";
          const showSettle = canSettle && verified && d.status !== "settled";
          return (
            <div key={d.id} className="rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">{d.id}</span>
                <Pill tone={statusTone(d.status)}>{d.status}</Pill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Asset / network">{d.asset} · {d.network}</Field>
                <Field label="Amount">{d.amountDecimal || "—"}</Field>
                <Field label="Source wallet KYT">{d.screeningStatus || "—"}</Field>
                <Field label="1 USDT verify">{d.verifyStatus}</Field>
                <Field label="Travel Rule">{d.travelRuleRequired ? d.travelRuleStatus : "not required"}</Field>
                <Field label="Deposit address"><span className="font-mono">{shortAddr(d.depositAddress)}</span></Field>
                <Field label="Marker">{d.markerRef || "—"}</Field>
                <Field label="Settlement">
                  {d.receiptRef ? `${d.receiptRef} · ${d.fiatAmount} ${d.fiatCurrency}` : "—"}
                </Field>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                {canMarker && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Marker ref</span>
                    <div className="flex items-center gap-1.5">
                    <input
                      value={markerDraft[d.id] ?? d.markerRef ?? ""}
                      onChange={(e) => setMarkerDraft({ ...markerDraft, [d.id]: e.target.value })}
                      placeholder="External marker reference"
                      className="w-32 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs font-mono"
                    />
                    <ActionBtn
                      icon={Tag}
                      disabled={busy || !(markerDraft[d.id] ?? d.markerRef ?? "").trim()}
                      onClick={() => void act(d.id, () => depositApi.marker(d.id, (markerDraft[d.id] ?? "").trim()), "Marker saved")}
                    >
                      Save marker
                    </ActionBtn>
                    </div>
                  </div>
                )}
                {showSettle && (
                  <ActionBtn
                    icon={Banknote}
                    tone="success"
                    disabled={busy}
                    onClick={() => void act(d.id, () => depositApi.settle(d.id), "Settled (Forex demo) + receipt issued")}
                  >
                    Settle → vault / Forex
                  </ActionBtn>
                )}
                {!canMarker && !showSettle && (
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
