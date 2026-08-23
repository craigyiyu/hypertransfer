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
  Banknote,
  KeyRound,
  Boxes,
  Gavel,
  UserPlus2,
  LogOut,
  Undo2,
  UserCog,
  Vault,
} from "lucide-react";
import { useDemo } from "@/contexts/DemoContext";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import BrandMark from "@/components/BrandMark";
import { staffApi, apiError } from "@/lib/api";
import { toast } from "sonner";
import { formatNetworkRail } from "@/lib/compliance";
import { formatAssetAmount, getHKDEquivalent } from "@/lib/currency";
import RefundQueuePanel from "@/components/RefundQueuePanel";
import DepositQueuePanel from "@/components/DepositQueuePanel";
import InvitationReviewPanel from "@/components/InvitationReviewPanel";
import StaffAdminPanel from "@/components/StaffAdminPanel";
import AdmissionCasePanel from "@/components/AdmissionCasePanel";
import LeaderApprovalPanel from "@/components/LeaderApprovalPanel";
import PaymentOperationsPanel from "@/components/PaymentOperationsPanel";

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
// 两层 RBAC: RM/Host 只看 VIP Admissions(且板块内只能操作自己的 case); marketing 看 Access Requests 审批队列。
function useSections() {
  const { t } = useI18n();
  return [
    { key: "deposits", label: t("casinoOps.deposits"), icon: Boxes, roles: ["compliance", "ops", "custodian"] },
    { key: "refunds", label: t("casinoOps.withdrawals"), icon: Undo2, roles: ["compliance", "ops", "custodian"] },
    { key: "vip", label: t("casinoOps.vipAdmissions"), icon: UserPlus2, roles: ["host", "rm"] },
    { key: "leader", label: t("casinoOps.leaderApproval"), icon: Gavel, roles: ["leader"] },
    { key: "payment-ops", label: t("casinoOps.paymentOperations"), icon: Banknote, roles: ["ops", "custodian", "compliance"] },
    { key: "access", label: t("casinoOps.accessRequests"), icon: UserPlus2, roles: ["marketing", "compliance"] },
    { key: "staff", label: t("casinoOps.staffAdmin"), icon: UserCog, roles: [] as string[] }, // admin-only
  ] as const;
}

function OktaLinkButton() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const linked = Boolean(user?.oktaLinked);
  const link = async () => {
    setBusy(true);
    try {
      const { data } = await staffApi.oktaLink();
      await refresh();
      toast.success(data.demo ? "Okta linked (demo placeholder — production uses real OIDC)." : t("casinoOps.oktaLinkedToast"));
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={link}
      disabled={busy}
      title="Enterprise Okta SSO — demo placeholder, real OIDC reserved"
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
        linked ? "border-success/40 text-success hover:bg-success/10" : "border-border/60 text-muted-foreground hover:border-gold/30 hover:text-gold"
      }`}
    >
      <KeyRound className="h-3.5 w-3.5" />
      {linked ? t("casinoOps.oktaLinked") : t("casinoOps.linkOkta")}
    </button>
  );
}

export default function CasinoOpsPortal() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const SECTIONS = useSections();
  // 按角色落地默认工作台: Host→VIP Admissions, Manager→Leader Approval, Ops→Payment Operations
  const [activeSection, setActiveSection] = useState<string>(() => {
    const roles = new Set(user?.roles ?? []);
    if (roles.has("host")) return "vip";
    if (roles.has("leader")) return "leader";
    if (roles.has("ops")) return "payment-ops";
    return "deposits";
  });
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
  const { state } = useDemo();
  const depositAmount = parseFloat(state.mainDepositAmount) || 0;
  // 确认数用 Hex Safe 真实值(选网络时存); 无则显示 — 而非编造数字。
  const requiredConfirmations = state.selectedMinConfirmations;
  const latestMainTx = useMemo(
    () => state.transactions.find((tx) => tx.type === "main"),
    [state.transactions],
  );
  const activeSessionDate = latestMainTx?.date
    ? new Date(latestMainTx.date).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="page-enter min-h-[100svh] bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10 text-gold">
              <BrandMark size={26} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("casinoOps.subtitle")}
              </p>
              <h1 className="font-display text-lg font-semibold text-foreground">{t("casinoOps.title")}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <StatusPill tone="success">{t("casinoOps.staffOnly")}</StatusPill>
            <OktaLinkButton />
            <button
              onClick={async () => {
                await logout();
                navigate("/ops");   // 退出回工作人员登录, 与客户端分离(不落 patron /login)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("casinoOps.signOut")}
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

          {activeSection === "deposits" && <DepositQueuePanel />}
          {activeSection === "refunds" && <RefundQueuePanel />}
          {activeSection === "vip" && <AdmissionCasePanel />}
          {activeSection === "leader" && <LeaderApprovalPanel />}
          {activeSection === "payment-ops" && <PaymentOperationsPanel />}
          {activeSection === "access" && <InvitationReviewPanel />}
          {activeSection === "staff" && <StaffAdminPanel />}

          {activeSection === "deposits" && (
            <>
        <section className="rounded-lg border border-border/60 bg-card/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("casinoOps.activeDepositCase")}
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground">
                {depositAmount > 0
                  ? `${formatAssetAmount(depositAmount, 0)} ${state.selectedAsset}`
                  : t("casinoOps.noActiveDeposit")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {depositAmount > 0
                  ? `Estimated value ${getHKDEquivalent(depositAmount, state.selectedAsset)}`
                  : t("casinoOps.completeSession")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Staff task: review session gates, then enter the required marker reference in the deposit queue.
              </p>
            </div>
            <div className="grid min-w-[320px] grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("casinoOps.sessionDate")}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{activeSessionDate}</p>
              </div>
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("casinoOps.asset")}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{state.selectedAsset || "USDT"}</p>
              </div>
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("casinoOps.network")}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatNetworkRail(state.selectedNetwork)}</p>
              </div>
              <div className="rounded-lg bg-secondary/25 px-3 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("casinoOps.kyt")}</p>
                <p className="mt-1 text-sm font-semibold text-success">
                  {state.mainDepositConfirmed ? "cleared" : "pending"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <OpsCard
            eyebrow={t("casinoOps.wtaSettlement")}
            title={t("casinoOps.treasuryReceipt")}
            icon={<Banknote className="h-5 w-5" />}
          >
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("casinoOps.confirmationGate")}</span>
                <span className="font-semibold text-foreground">
                  {requiredConfirmations != null ? `${requiredConfirmations} confirmations` : "— (from Hex Safe)"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("casinoOps.latestTxHash")}</span>
                <span className="max-w-[190px] truncate font-mono text-xs text-gold">
                  {latestMainTx?.txHash || t("casinoOps.pendingMainDeposit")}
                </span>
              </div>
              <div className="rounded-lg bg-secondary/25 px-3 py-2 text-xs text-muted-foreground">
                Hex Trust defines chain confirmation thresholds; HyperTransfer records the settlement gate and audit state.
              </div>
            </div>
          </OpsCard>
        </div>
            </>
          )}

        </main>
      </div>
    </div>
  );
}
