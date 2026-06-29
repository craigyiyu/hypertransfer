/**
 * CasinoOpsPortal — Staff-facing operations portal for casino treasury,
 * compliance, finance, and audit users. This route is intentionally separate
 * from the HyperTransfer customer H5 flow.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  UserPlus2,
  CheckCircle2,
  Clock,
  DatabaseZap,
  FileArchive,
  LockKeyhole,
  LogOut,
  MapPinOff,
  PlugZap,
  RadioTower,
  ShieldCheck,
  SlidersHorizontal,
  SendHorizontal,
  Undo2,
  UserCog,
  Vault,
} from "lucide-react";
import { toast } from "sonner";
import { useDemo } from "@/contexts/DemoContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiError } from "@/lib/api";
import { calculateOtcFee, formatNetworkRail, formatUsd } from "@/lib/compliance";
import { formatAssetAmount, getHKDEquivalent } from "@/lib/currency";
import { sumsubApi, type SumsubHealth } from "@/lib/sumsub";
import {
  approveAndSettleOtc,
  createDepegWorkflow,
  createOtcConversion,
  custodyEvidenceItems,
  macauAccessControls,
  reconciliationItems,
} from "@/lib/treasury-ops";
import {
  approveRefundRequest,
  broadcastRefundPayout,
  formatRefundStatus,
  submitRefundForApproval,
} from "@/lib/refund-process";
import HexSafeLivePanel from "@/components/HexSafeLivePanel";
import RefundQueuePanel from "@/components/RefundQueuePanel";
import DepositQueuePanel from "@/components/DepositQueuePanel";
import InvitationReviewPanel from "@/components/InvitationReviewPanel";
import StaffAdminPanel from "@/components/StaffAdminPanel";

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "warning"
      ? "border-warning/30 bg-warning/10 text-warning"
      : tone === "danger"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-border/50 bg-secondary/30 text-muted-foreground";

  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function OpsCard({
  title,
  eyebrow,
  icon,
  children,
}: {
  title: string;
  eyebrow: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
        </div>
      </div>
      {children}
    </motion.section>
  );
}

// 左侧板块导航(tab 式)。roles=可见该板块的角色; admin 全可见。
// 两层 RBAC: RM 只看 Access Requests(且板块内只能提交+看自己进度); marketing 看 Access Requests 审批队列。
const SECTIONS = [
  { key: "deposits", label: "Deposits", icon: Boxes, roles: ["compliance", "ops", "custodian"] },
  { key: "refunds", label: "Refunds", icon: Undo2, roles: ["compliance", "ops", "custodian"] },
  { key: "access", label: "Access Requests", icon: UserPlus2, roles: ["rm", "marketing", "compliance"] },
  { key: "staff", label: "Staff Admin", icon: UserCog, roles: [] as string[] }, // admin-only
  { key: "custody", label: "Custody (Hex Safe)", icon: RadioTower, roles: ["compliance", "ops", "custodian"] },
  { key: "ops", label: "Treasury & Compliance", icon: SlidersHorizontal, roles: ["compliance", "ops", "custodian"] },
] as const;

export default function CasinoOpsPortal() {
  const [activeSection, setActiveSection] = useState<string>("deposits");
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  // 两层 RBAC: 侧栏只显示当前角色可见的板块(admin 全可见)。RM → 只见 Access Requests。
  const visibleSections = useMemo(() => {
    const roles = new Set(user?.roles ?? []);
    if (roles.has("admin")) return SECTIONS;
    return SECTIONS.filter((s) => s.roles.some((r) => roles.has(r)));
  }, [user]);
  useEffect(() => {
    if (visibleSections.length && !visibleSections.some((s) => s.key === activeSection)) {
      setActiveSection(visibleSections[0].key);
    }
  }, [visibleSections, activeSection]);
  const { state, updateState } = useDemo();
  const [sumsubHealth, setSumsubHealth] = useState<SumsubHealth | null>(null);
  const [sumsubStatus, setSumsubStatus] = useState("Checking Sumsub provider...");
  const depositAmount = parseFloat(state.mainDepositAmount) || 0;
  const otcFee = depositAmount > 0 ? calculateOtcFee(depositAmount) : 0;
  const netUsd = Math.max(0, depositAmount - otcFee);
  // 确认数用 Hex Safe 真实值(选网络时存); 无则显示 — 而非编造数字。
  const requiredConfirmations = state.selectedMinConfirmations;
  const depegWorkflow = createDepegWorkflow();
  const latestMainTx = useMemo(
    () => state.transactions.find((tx) => tx.type === "main"),
    [state.transactions],
  );
  const refundRequest = state.refundRequest;

  useEffect(() => {
    let cancelled = false;
    sumsubApi.health()
      .then((res) => {
        if (cancelled) return;
        setSumsubHealth(res.data);
        setSumsubStatus(
          res.data.configured
            ? `Configured for ${res.data.environment}; ready to request Sumsub SDK tokens.`
            : "Backend adapter is installed, but Sumsub credentials are not configured.",
        );
      })
      .catch((err) => {
        if (!cancelled) setSumsubStatus(apiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const testSumsubConnection = async () => {
    setSumsubStatus("Testing Sumsub signed API call...");
    try {
      const res = await sumsubApi.connectionTest({
        levelName: sumsubHealth?.kycLevelName,
        ttlInSecs: 600,
      });
      setSumsubStatus(
        res.data.connected
          ? `Connected. Sumsub returned an SDK token for ${res.data.userId}.`
          : "Sumsub responded, but did not return an SDK token.",
      );
      toast.success("Sumsub connection test completed", {
        description: `${res.data.environment} / ${res.data.levelName}`,
      });
    } catch (err) {
      const message = apiError(err);
      setSumsubStatus(message);
      toast.error("Sumsub connection test failed", { description: message });
    }
  };

  const requestQuote = () => {
    const conversion = createOtcConversion(
      depositAmount,
      state.selectedAsset === "USDC" ? "USDC" : "USDT",
    );
    updateState({ otcConversion: conversion });
    toast.success("HT Markets quote prepared", {
      description: `${formatUsd(conversion.feeUsd)} estimated fee recorded for treasury approval.`,
    });
  };

  const approveQuote = () => {
    if (!state.otcConversion) return;
    const settledConversion = approveAndSettleOtc(state.otcConversion);
    updateState({ otcConversion: settledConversion });
    toast.success("OTC conversion settled", {
      description: settledConversion.settlement.receipt,
    });
  };

  const submitRefundApproval = () => {
    if (!refundRequest) return;
    const next = submitRefundForApproval(refundRequest);
    updateState({ refundRequest: next });
    toast.success("Refund queued for approval", { description: next.id });
  };

  const approveRefund = () => {
    if (!refundRequest) return;
    const next = approveRefundRequest(refundRequest, "Treasury Approver");
    updateState({ refundRequest: next });
    toast.success("Refund approved", { description: next.approval.requiredRole });
  };

  const broadcastRefund = () => {
    if (!refundRequest) return;
    const next = broadcastRefundPayout(refundRequest);
    updateState({ refundRequest: next });
    toast.success("Refund payout completed", { description: next.payout.transferId });
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10 text-gold">
              <Vault className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Casino Staff Operations
              </p>
              <h1 className="text-lg font-semibold text-foreground">VA Operations Portal</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone="success">Staff only</StatusPill>
            <button
              onClick={async () => {
                await logout();
                navigate("/ops");   // 退出回工作人员登录, 与客户端分离(不落 patron /login)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1480px] gap-0">
        {/* 左侧板块导航(桌面) */}
        <aside className="sticky top-[57px] hidden h-[calc(100svh-57px)] w-52 shrink-0 overflow-y-auto border-r border-border/50 p-3 lg:block">
          <nav className="space-y-1">
            {visibleSections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeSection === s.key ? "bg-gold/10 text-gold" : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                }`}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-6 px-6 py-6">
          {/* 移动端: 顶部横向板块切换 */}
          <div className="-mx-6 mb-1 flex gap-2 overflow-x-auto border-b border-border/50 px-6 pb-3 lg:hidden">
            {visibleSections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  activeSection === s.key ? "bg-gold/10 text-gold" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {activeSection === "custody" && <HexSafeLivePanel />}
          {activeSection === "deposits" && <DepositQueuePanel />}
          {activeSection === "refunds" && <RefundQueuePanel />}
          {activeSection === "access" && <InvitationReviewPanel />}
          {activeSection === "staff" && <StaffAdminPanel />}

          {activeSection === "deposits" && (
            <>
        <section className="rounded-lg border border-border/60 bg-card/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active deposit case
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground">
                {depositAmount > 0
                  ? `${formatAssetAmount(depositAmount, 0)} ${state.selectedAsset}`
                  : "No active customer deposit"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {depositAmount > 0
                  ? `Estimated value ${getHKDEquivalent(depositAmount, state.selectedAsset)}`
                  : "Complete a customer deposit session to populate live controls."}
              </p>
            </div>
            <div className="grid min-w-[320px] grid-cols-3 gap-3">
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Asset</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{state.selectedAsset || "USDT"}</p>
              </div>
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Network</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatNetworkRail(state.selectedNetwork)}</p>
              </div>
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">KYT</p>
                <p className="mt-1 text-sm font-semibold text-success">
                  {state.mainDepositConfirmed ? "cleared" : "pending"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-3">
          <OpsCard
            eyebrow="WTA settlement"
            title="Treasury account receipt"
            icon={<Banknote className="h-5 w-5" />}
          >
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Confirmation gate</span>
                <span className="font-semibold text-foreground">
                  {requiredConfirmations != null ? `${requiredConfirmations} confirmations` : "— (from Hex Safe)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Latest txHash</span>
                <span className="max-w-[190px] truncate font-mono text-xs text-gold">
                  {latestMainTx?.txHash || "Pending main deposit"}
                </span>
              </div>
              <div className="rounded-lg bg-secondary/25 px-3 py-2 text-xs text-muted-foreground">
                Hex Trust defines chain confirmation thresholds; HyperTransfer records the settlement gate and audit state.
              </div>
            </div>
          </OpsCard>

          <OpsCard
            eyebrow="HT Markets OTC"
            title="Stablecoin to USD conversion"
            icon={<SlidersHorizontal className="h-5 w-5" />}
          >
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gross amount</span>
                <span className="font-semibold text-foreground">{formatUsd(depositAmount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">OTC fee</span>
                <span className="font-semibold text-warning">-{formatUsd(otcFee)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <span className="font-semibold text-foreground">Net USD</span>
                <span className="font-semibold text-gold">{formatUsd(netUsd)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={requestQuote}
                  disabled={depositAmount <= 0}
                  className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Prepare Quote
                </button>
                <button
                  onClick={approveQuote}
                  disabled={!state.otcConversion}
                  className="rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-gold/30 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Approve & Settle
                </button>
              </div>
            </div>
          </OpsCard>

          <OpsCard
            eyebrow="Depeg response"
            title="Liquidation path"
            icon={<AlertTriangle className="h-5 w-5" />}
          >
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Trigger threshold</span>
                <span className="font-semibold text-foreground">{depegWorkflow.threshold.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Demo price</span>
                <span className="font-semibold text-foreground">{depegWorkflow.currentPrice.toFixed(3)}</span>
              </div>
              <StatusPill tone={depegWorkflow.triggered ? "warning" : "success"}>
                {depegWorkflow.status}
              </StatusPill>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {depegWorkflow.otcChannel}. {depegWorkflow.bankingWarning}
              </p>
            </div>
          </OpsCard>
        </div>

        {state.otcConversion && (
          <section className="rounded-lg border border-success/20 bg-success/10 p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">OTC workflow</p>
                <h2 className="mt-1 text-base font-semibold text-foreground">
                  Conversion <span className="font-mono text-success">{state.otcConversion.id}</span> is {state.otcConversion.status.replaceAll("_", " ")}
                </h2>
              </div>
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Quote + fee", `${formatUsd(state.otcConversion.feeUsd)} fee`, "prepared"],
                ["Approval", state.otcConversion.approval.requiredRole, state.otcConversion.approval.status],
                ["Execution", state.otcConversion.execution.channel, state.otcConversion.execution.status],
                ["Settlement", state.otcConversion.settlement.receipt, state.otcConversion.settlement.status],
              ].map(([label, value, status]) => (
                <div key={label} className="rounded-lg bg-background/45 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className="mt-1 truncate text-xs text-foreground">{value}</p>
                  <p className="mt-2 text-[11px] font-semibold text-gold">{status}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-background/45 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Audit trail</p>
              {state.otcConversion.auditTrail.map((entry) => (
                <p key={entry} className="mt-1 text-xs text-muted-foreground">{entry}</p>
              ))}
            </div>
          </section>
        )}
            </>
          )}

          {activeSection === "ops" && (
            <>
        <div className="grid gap-5 lg:grid-cols-2">
          <OpsCard
            eyebrow="Refund / payout"
            title="Customer refund queue"
            icon={<Undo2 className="h-5 w-5" />}
          >
            {refundRequest ? (
              <div className="space-y-3 text-sm">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg bg-secondary/25 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatAssetAmount(refundRequest.amount, 0)} {refundRequest.asset}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/25 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
                    <p className="mt-1 text-sm font-semibold capitalize text-gold">
                      {formatRefundStatus(refundRequest.status)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/25 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">KYT</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {refundRequest.kytResult?.decision || "not started"}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg bg-secondary/20 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Refund destination</p>
                  <p className="mt-1 truncate font-mono text-xs text-gold">
                    {refundRequest.destinationAddress || "Waiting for customer address"}
                  </p>
                  <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
                    Original tx: {refundRequest.originalTxHash}
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <button
                    onClick={submitRefundApproval}
                    disabled={refundRequest.status !== "destination_kyt_passed"}
                    className="rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-gold/30 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Submit Approval
                  </button>
                  <button
                    onClick={approveRefund}
                    disabled={refundRequest.status !== "approval_pending"}
                    className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Approve
                  </button>
                  <button
                    onClick={broadcastRefund}
                    disabled={refundRequest.status !== "approved"}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-gold/30 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <SendHorizontal className="h-3.5 w-3.5" />
                    Broadcast
                  </button>
                </div>
                <div className="rounded-lg bg-secondary/20 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Audit trail</p>
                  {refundRequest.auditTrail.slice(-4).map((entry) => (
                    <p key={entry} className="mt-1 text-xs text-muted-foreground">{entry}</p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-secondary/20 px-3 py-4 text-sm text-muted-foreground">
                No active refund request. Customer refund cases appear here after a completed deposit and refund-wallet submission.
              </div>
            )}
          </OpsCard>

          <OpsCard
            eyebrow="Sumsub provider"
            title="KYC, KYT and Travel Rule adapter"
            icon={<PlugZap className="h-5 w-5" />}
          >
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-secondary/25 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {sumsubHealth?.configured ? "configured" : "missing env"}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary/25 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Environment</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {sumsubHealth?.environment || "sandbox"}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary/25 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">KYC level</p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground">
                    {sumsubHealth?.kycLevelName || "idv-and-phone-verification"}
                  </p>
                </div>
              </div>
              <p className="rounded-lg bg-secondary/25 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                {sumsubStatus}
              </p>
              <div className="flex flex-wrap gap-2">
                {["KYC WebSDK", "AML", "Device Intelligence", "Questionnaire", "Travel Rule", "Crypto Monitoring"].map((item) => (
                  <StatusPill key={item} tone="neutral">{item}</StatusPill>
                ))}
              </div>
              <button
                onClick={testSumsubConnection}
                disabled={!sumsubHealth?.configured}
                className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
              >
                Test Sumsub Connection
              </button>
            </div>
          </OpsCard>

          <OpsCard
            eyebrow="Hex Safe webhook/API"
            title="Custody event monitor"
            icon={<RadioTower className="h-5 w-5" />}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deposit status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{state.hexSafeStatus?.status || "waiting"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {state.hexSafeStatus
                    ? `${state.hexSafeStatus.confirmationCount}/${state.hexSafeStatus.requiredConfirmations} confirmations`
                    : "No Hex Safe event yet"}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vault balance</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {state.vaultBalance
                    ? `${formatAssetAmount(state.vaultBalance.available, 2)} ${state.vaultBalance.asset}`
                    : "Pending"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{state.vaultBalance?.vaultId || "WTA vault pending"}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {state.custodyLogs.length > 0 ? (
                state.custodyLogs.map((log) => (
                  <div key={`${log.event}-${log.at}`} className="rounded-lg bg-secondary/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground">{log.event}</p>
                      <p className="text-[10px] text-gold">{log.source}</p>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">{log.detail}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">Complete a main deposit to populate mocked webhook/API transaction logs.</p>
              )}
            </div>
          </OpsCard>

          <OpsCard
            eyebrow="Reconciliation"
            title="API, webhook, SFTP, statement"
            icon={<DatabaseZap className="h-5 w-5" />}
          >
            <div className="space-y-2">
              {reconciliationItems.map((item) => (
                <div key={item.source} className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{item.source}</p>
                    <StatusPill
                      tone={item.status === "matched" ? "success" : item.status === "exception" ? "danger" : "warning"}
                    >
                      {item.status}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
                </div>
              ))}
            </div>
          </OpsCard>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <OpsCard
            eyebrow="Macau access exclusion"
            title="Operator access controls"
            icon={<MapPinOff className="h-5 w-5" />}
          >
            <div className="space-y-2">
              {macauAccessControls.map((item) => (
                <div key={item.control} className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{item.control}</p>
                    <StatusPill
                      tone={
                        item.status === "active"
                          ? "success"
                          : item.status === "required"
                          ? "warning"
                          : "danger"
                      }
                    >
                      {item.status.replaceAll("_", " ")}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Owner: {item.owner}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.evidence}</p>
                </div>
              ))}
            </div>
          </OpsCard>

          <OpsCard
            eyebrow="Custody evidence"
            title="Hex Trust provided controls"
            icon={<ShieldCheck className="h-5 w-5" />}
          >
            <div className="space-y-2">
              {custodyEvidenceItems.map((item, index) => (
                <div key={item.capability} className="flex gap-3 rounded-lg border border-border/50 bg-secondary/20 px-3 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/50 text-gold">
                    {index === 0 && <LockKeyhole className="h-4 w-4" />}
                    {index === 1 && <ShieldCheck className="h-4 w-4" />}
                    {index === 2 && <FileArchive className="h-4 w-4" />}
                    {index === 3 && <Clock className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.capability}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.evidence}</p>
                    <p className="mt-2 text-[10px] text-gold">
                      Displayed as {item.shownAs}; not a HyperTransfer-owned custody service.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </OpsCard>
        </div>
            </>
          )}

        <section className="rounded-lg border border-border/60 bg-card/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <UserCog className="h-5 w-5 text-gold" />
              <div>
                <p className="text-sm font-semibold text-foreground">Staff portal boundary</p>
                <p className="text-xs text-muted-foreground">
                  This site is for casino treasury, compliance, finance, and audit teams. Customer-facing HyperTransfer pages do not expose these controls.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="rounded-lg bg-gold px-4 py-2 text-xs font-semibold text-background"
            >
              Open Customer Dashboard
            </button>
          </div>
        </section>
        </main>
      </div>
    </div>
  );
}
