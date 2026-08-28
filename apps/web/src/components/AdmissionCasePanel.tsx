/**
 * AdmissionCasePanel — Host workspace for VIP admission requests (2026-08-21).
 * Replaces the legacy Access-Request tab for RM/Host roles.
 *
 * Contents:
 *  - Host activation banner (operational fields + customer-data policy ack);
 *  - create-request form: VIP name + invitation email + intended deposit
 *    amount (USDT) + preferred language (affects invitation emails) + note;
 *  - a collapsible per-customer request list: each row shows the VIP name /
 *    email / status; expanding reveals timeline, KYC status and per-leg
 *    transfer / settlement detail;
 *  - "Needs your attention" pills are clickable and expand the matching rows;
 *  - dual-channel invitation delivery (email link + dynamic QR) and revoke.
 *
 * Hosts only ever see their own cases and the safe KYC category message
 * (`kycHostMessage`) — never raw KYC evidence, provider reports or Host notes
 * of other users.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronDown,
  ChevronRight,
  IdCard,
  Mail,
  MailCheck,
  Plus,
  QrCode,
  RotateCcw,
  UserPlus2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { DEMO_AUTOFILL_EVENT, useDemoMode } from "@/contexts/DemoModeContext";
import {
  admissionApi,
  apiError,
  hostApi,
  type AdmissionCase,
  type HostProfile,
} from "@/lib/api";
import {
  admissionCaseHistory,
  admissionTimeline,
  formatUsdInput,
  hostAdmissionLifecyclePresentation,
  hostRowStatusPresentation,
  hostAttentionSummary,
  invitationActionPolicy,
  sortByRecentAdmissionActivity,
  toggleExpandedCaseIds,
  type AdmissionCaseStatus,
  type HostAttentionSignal,
} from "@/lib/admission-case";
import { ActionBtn, EmptyState, Field, LabeledInput, LoadingSkeleton, PanelHeader, Pill } from "@/components/ops-ui";

const EMPTY_CASE_FORM = {
  firstName: "",
  lastName: "",
  patronEmail: "",
  memberReference: "",
  intendedAmount: "",
  preferredLanguage: "zh",
  hostNotes: "",
};

const LANGUAGE_OPTIONS = [
  { value: "zh", labelKey: "admissionPanel.langZh" },
  { value: "zh-Hant", labelKey: "admissionPanel.langZhHant" },
  { value: "en", labelKey: "admissionPanel.langEn" },
  { value: "other", labelKey: "admissionPanel.langOther" },
] as const;

/** Host 跟进汇总(B2, 可点击): 按状态聚合"需要动作"的 case; 点击展开对应行。 */
function HostFollowUpSummary({
  cases,
  onSelect,
}: {
  cases: AdmissionCase[];
  onSelect: (caseIds: string[]) => void;
}) {
  const { t } = useI18n();
  const labels: Record<HostAttentionSignal, string> = {
    "Invitation Pending": "Invitation Pending",
    "Invitation Expired": "Invitation Expired",
    "KYC Action Required": t("admissionPanel.kycActionNeeded"),
    "Pending Approval": t("admissionPanel.awaitingApprover"),
  };
  const tones: Record<HostAttentionSignal, "warning" | "danger"> = {
    "Invitation Pending": "warning",
    "Invitation Expired": "warning",
    "KYC Action Required": "danger",
    "Pending Approval": "warning",
  };
  const items = hostAttentionSummary(cases).map((group) => ({
    ...group,
    label: labels[group.signal],
    tone: tones[group.signal],
  }));

  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("admissionPanel.needsAttention")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((i) => (
          <button
            key={i.label}
            onClick={() => onSelect(i.ids)}
            className="transition-opacity hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-gold/40 rounded-full"
          >
            <Pill tone={i.tone}>{`${i.label} · ${i.ids.length}`}</Pill>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 5 步 Admission Status(2026-08 mockup 定稿): Invited → Clicked → KYC info submitted → KYC approved → Service enabled */
const CASE_STEPS: { key: string; label: string }[] = [
  { key: "invitation_open", label: "Invited" },
  { key: "vip_claimed", label: "Account Created" },
  { key: "kyc_in_progress", label: "KYC Submitted" },
  { key: "kyc_passed", label: "KYC Approved" },
  { key: "service_enabled", label: "Service Enabled" },
];

function CaseTimeline({ status }: { status: AdmissionCaseStatus }) {
  const { t } = useI18n();
  const timeline = admissionTimeline(status);
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("admissionPanel.admissionStatus")}</p>
      <div className="mt-3 flex w-full items-start">
        {CASE_STEPS.map((s, i) => {
          const step = timeline[i];
          const done = step?.completed ?? false;
          const isCurrent = step?.current ?? false;
          return (
            <div key={s.key} className="relative flex flex-1 flex-col items-center gap-1.5">
              <span
                className={`relative z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  done
                    ? "border-gold text-gold"
                    : isCurrent
                      ? "border-gold-bright text-gold-bright shadow-[0_0_0_4px_color-mix(in_oklab,var(--gold)_12%,transparent)]"
                      : "border-border/40 text-muted-foreground/60"
                }`}
              >
                {i + 1}
              </span>
              {i < CASE_STEPS.length - 1 && (
                <span
                  className={`absolute top-[9px] left-[calc(50%+12px)] h-[3px] w-[calc(100%-24px)] rounded-full ${
                    done || isCurrent ? "bg-gold/60" : "bg-white/15"
                  }`}
                />
              )}
              <span
                className={`text-center text-[10px] leading-tight ${
                  done ? "text-gold" : isCurrent ? "font-semibold text-foreground" : "text-muted-foreground/60"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 单个 VIP 请求行: 行头(可展开 + 操作按钮) + 展开详情。 */
function fmtTs(ts?: number | null): string {
  return ts ? new Date(ts * 1000).toLocaleString() : "—";
}

function formatDepositUsd(c: AdmissionCase): string {
  const fmt = (n: number) => `${n.toLocaleString("en-US")} USD`;
  if (c.intendedDepositUsd && c.intendedDepositUsd.trim() !== "") {
    const n = Number(c.intendedDepositUsd);
    if (Number.isFinite(n)) return fmt(n);
  }
  // 兼容旧数据: servicePurpose 可能是 "50000 USD" 或 "50000 USDT" → 统一归一为千分位 USD
  const m = (c.servicePurpose || "").match(/([\d.,]+)\s*(USD|USDT)?/i);
  const rawNum = m?.[1];
  if (rawNum) {
    const n = Number(rawNum.replace(/,/g, ""));
    if (Number.isFinite(n)) return fmt(n);
  }
  return c.servicePurpose || "—";
}

function HistRow({ k, v, done, err }: { k: string; v: string; done?: boolean; err?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 border-card ${
          err ? "bg-destructive" : done ? "bg-gold" : "bg-muted-foreground/40"
        }`}
      />
      <span className="text-muted-foreground">{k} · </span>
      <span className={err ? "text-destructive" : ""}>{v}</span>
    </div>
  );
}

function CaseRow({
  c,
  expanded,
  toggleExpand,
  busyId,
  onSendEmail,
  onShowQr,
  onRemind,
  onRevoke,
  onReenable,
}: {
  c: AdmissionCase;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  busyId: string;
  onSendEmail: (id: string) => void;
  onShowQr: (id: string) => void;
  onRemind: (id: string) => void;
  onRevoke: (id: string) => void;
  onReenable: (id: string) => void;
}) {
  const { t } = useI18n();
  const isOpen = expanded.has(c.id);
  const isApproved = c.status === "service_enabled";
  const displayName = c.patronName || c.patronEmailMasked;
  const rowStatus = hostRowStatusPresentation(c);
  const invitationActions = invitationActionPolicy(c);
  const canResend = invitationActions.canResend;
  const canQr = invitationActions.canQr;
  const canRemind = invitationActions.canRemind;
  const canRevoke = invitationActions.canRevoke;
  const canReenable = c.status === "revoked" && Boolean(c.priorStatusBeforeRevocation);
  return (
    <div
      className={`rounded-lg border bg-background/40 transition-colors ${
        isOpen ? "border-gold/40" : "border-border/40 card-interactive"
      }`}
    >
      {/* Row header — click to expand */}
      <div className="flex w-full items-center justify-between gap-2 px-3 py-2.5">
        <button
          onClick={() => toggleExpand(c.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus:outline-none focus:ring-1 focus:ring-gold/40 rounded-lg"
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
          {c.patronName && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{c.patronEmailMasked}</span>
          )}
          {rowStatus && <Pill tone={rowStatus.tone}>{rowStatus.label}</Pill>}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {canResend && (
            <ActionBtn icon={Mail} onClick={() => void onSendEmail(c.id)} disabled={busyId === c.id}>
              {t("admissionPanel.resendInvitation")}
            </ActionBtn>
          )}
          {canQr && (
            <ActionBtn icon={QrCode} onClick={() => void onShowQr(c.id)} disabled={busyId === c.id}>
              {t("admissionPanel.invitationQr")}
            </ActionBtn>
          )}
          {canRemind && (
            <ActionBtn icon={MailCheck} onClick={() => void onRemind(c.id)} disabled={busyId === c.id}>
              {t("admissionPanel.sendReminder")}
            </ActionBtn>
          )}
          {canRevoke && (
            <ActionBtn icon={Ban} tone="danger" onClick={() => void onRevoke(c.id)} disabled={busyId === c.id}>
              {t("admissionPanel.revoke")}
            </ActionBtn>
          )}
          {canReenable && (
            <ActionBtn icon={RotateCcw} onClick={() => void onReenable(c.id)} disabled={busyId === c.id}>
              {t("admissionPanel.reenable")}
            </ActionBtn>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {isOpen && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2">
          {/* 审批决策 + 原因(leader 落库后 Host 可见, 便于 follow up) */}
          {c.leaderDecision === "rejected" && (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
              <span className="font-semibold text-destructive">{t("admissionPanel.rejectedByApprover")}</span>
              {c.leaderReason && (
                <span className="ml-2 text-muted-foreground">{t("common.reason")}: {c.leaderReason}</span>
              )}
            </div>
          )}
          {isApproved && c.leaderDecision === "approved" && (
            <div className="mb-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs font-semibold text-success">
              {t("admissionPanel.approver")} — {t("admissionPanel.enabled")}
            </div>
          )}

          {/* 状态 timeline */}
          <CaseTimeline status={c.status} />

          {/* KYC 拒绝横幅(安全消息, 不给 provider 细节) */}
          {c.status === "kyc_failed" && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
              <div>
                <span className="font-semibold text-destructive">KYC documents need resubmission</span>
                <span className="ml-2 text-muted-foreground">Ask the VIP to resubmit valid documentation.</span>
              </div>
              <ActionBtn icon={MailCheck} onClick={() => void onRemind(c.id)} disabled={busyId === c.id}>
                Send KYC reminder
              </ActionBtn>
            </div>
          )}
          {c.status === "compliance_review" && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
              <span className="font-semibold text-destructive">KYC verification not approved</span>
              {c.kycHostMessage && <span className="ml-2 text-muted-foreground">{c.kycHostMessage}</span>}
            </div>
          )}
          {c.status === "kyc_expired" && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
              <div>
                <span className="font-semibold text-destructive">KYC document expired</span>
                <span className="ml-2 text-muted-foreground">Ask the VIP to resubmit valid documentation.</span>
              </div>
              <ActionBtn icon={MailCheck} onClick={() => void onRemind(c.id)} disabled={busyId === c.id}>
                Send KYC reminder
              </ActionBtn>
            </div>
          )}

          {/* Notes 黑框(恢复原设计: 明显深色框) */}
          <div className="mt-3 rounded-lg border border-border/80 bg-background/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("admissionPanel.note")}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                <Field label={t("admissionPanel.intendedDeposit")}>{formatDepositUsd(c)}</Field>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                <Field label={t("admissionPanel.memberReference")}>{c.memberReference || "—"}</Field>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                <Field label={t("admissionPanel.kycValidUntil")}>
                  {c.kycValidUntil ? (
                    <>
                      {new Date(c.kycValidUntil * 1000).toLocaleDateString()}
                      {Date.now() / 1000 > c.kycValidUntil && (
                        <span className="ml-1 text-[10px] font-semibold text-destructive">
                          {t("admissionPanel.expired")}
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </Field>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                <Field label={t("admissionPanel.hostNotes")}>{c.hostNotes || "—"}</Field>
              </div>
            </div>
          </div>

          {/* History: 事件时间线 + 入金记录(2026-08 mockup, 统一 Payments & Settlements) */}
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">History</p>
            <div className="mt-2 space-y-1.5 border-l-2 border-border/40 pl-3">
              {admissionCaseHistory(c).map((event) => (
                <HistRow
                  key={`${event.label}-${event.timestamp}`}
                  k={event.label}
                  v={fmtTs(event.timestamp)}
                  done={event.tone === "success"}
                  err={event.tone === "danger"}
                />
              ))}
            </div>

            {isApproved && (
              <>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Deposits</p>
                {(c.payments ?? []).length === 0 ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("admissionPanel.noTransfersYet")}
                  </p>
                ) : (
                  <div className="mt-1 space-y-2">
                {[...(c.payments ?? [])]
                  .sort((a, b) => (b.finalizedAt ?? 0) - (a.finalizedAt ?? 0))
                  .map((p) => {
                    const confirmed = Boolean(p.finalizedAt);
                    return (
                      <div
                        key={p.packId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-[11px]"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {p.transferLeg === "verification" ? t("admissionPanel.verificationLeg") : t("admissionPanel.mainTransfer")}
                            {p.actualAmount
                              ? ` · ${Number(p.actualAmount).toLocaleString("en-US")} ${p.transferLeg === "verification" ? "USDT" : "USD"}`
                              : ""}
                          </p>
                          {p.txHash && <p className="mt-0.5 max-w-[220px] truncate font-mono text-gold">{p.txHash}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {p.finalizedAt && (
                            <span className="text-muted-foreground">
                              {new Date(p.finalizedAt * 1000).toLocaleString()}
                            </span>
                          )}
                          <Pill tone={confirmed ? "success" : "warning"}>
                            {confirmed
                              ? t("admissionPanel.received")
                              : p.cageConfirmationId
                                ? t("admissionPanel.cageRecorded")
                                : t("admissionPanel.pending")}
                          </Pill>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdmissionCasePanel({
  view = "all",
}: {
  /** 左侧菜单复用: form=创建表单 / attention=待办列表 / approved=已启用列表 / archived=已归档 / all=完整工作台 */
  view?: "form" | "attention" | "approved" | "archived" | "all";
}) {
  const { user } = useAuth();
  const { isDemoMode, getDemoValue } = useDemoMode();
  const { t } = useI18n();

  const [profile, setProfile] = useState<HostProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activateForm, setActivateForm] = useState({
    operatingTeam: "",
    location: "",
    phone: "",
    acknowledged: false,
  });
  const [activating, setActivating] = useState(false);

  const [cases, setCases] = useState<AdmissionCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [caseForm, setCaseForm] = useState({ ...EMPTY_CASE_FORM });
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const canManage = useMemo(() => {
    const roles = new Set(user?.roles ?? []);
    return roles.has("admin") || roles.has("host");
  }, [user]);

  // Host queue contains only active cases with a current follow-up signal.
  const attentionCases = useMemo(
    () => sortByRecentAdmissionActivity(cases.filter((c) => {
      const lifecycle = hostAdmissionLifecyclePresentation(c);
      return !lifecycle.isArchived && lifecycle.attention !== null;
    })),
    [cases],
  );
  const approvedCases = useMemo(
    () => cases.filter((c) => c.status === "service_enabled"),
    [cases],
  );
  const archivedCases = useMemo(
    () => cases.filter((c) => hostAdmissionLifecyclePresentation(c).isArchived),
    [cases],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleMany = useCallback((ids: string[]) => {
    setExpanded((prev) => toggleExpandedCaseIds(prev, ids));
  }, []);

  const applyDemoForm = useCallback(() => {
    setCaseForm((prev) => ({
      ...prev,
      patronEmail: getDemoValue("patronEmail") || prev.patronEmail,
      memberReference: getDemoValue("memberId") || prev.memberReference,
    }));
  }, [getDemoValue]);

  useEffect(() => {
    if (isDemoMode) applyDemoForm();
    window.addEventListener(DEMO_AUTOFILL_EVENT, applyDemoForm);
    return () => window.removeEventListener(DEMO_AUTOFILL_EVENT, applyDemoForm);
  }, [applyDemoForm, isDemoMode]);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await hostApi.profile();
      setProfile(res.data.profile);
    } catch (err) {
      // 404 = 尚未激活 profile, 属正常首屏状态。
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await admissionApi.mine();
      setCases(res.data.cases);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadCases();
  }, [loadProfile, loadCases]);

  const activateProfile = async () => {
    if (!activateForm.operatingTeam.trim() || !activateForm.location.trim()) {
      toast.error(t("admissionPanel.activateHostNote"));
      return;
    }
    setActivating(true);
    try {
      const res = await hostApi.activate({
        operatingTeam: activateForm.operatingTeam,
        location: activateForm.location,
        phone: activateForm.phone,
        acknowledged: activateForm.acknowledged,
      });
      setProfile(res.data.profile);
      if (res.data.profile.status === "active") {
        toast.success(t("admissionPanel.activatedToast"));
      } else {
        toast.info("Profile saved — acknowledge the customer-data handling policy to activate.");
      }
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setActivating(false);
    }
  };

  const createCase = async () => {
    if (!caseForm.patronEmail.trim()) {
      toast.error(t("admissionPanel.invitationEmailRequired"));
      return;
    }
    setCreating(true);
    try {
      // Intended deposit: 金额以纯数字入库(前端千分位 + USD 展示; 不再显示 USDT)
      const amount = caseForm.intendedAmount.replace(/,/g, "").trim();
      const servicePurpose = amount ? `${amount} USD` : undefined;
      await admissionApi.create({
        patronEmail: caseForm.patronEmail.trim(),
        firstName: caseForm.firstName.trim() || undefined,
        lastName: caseForm.lastName.trim() || undefined,
        memberReference: caseForm.memberReference.trim() || undefined,
        servicePurpose,
        intendedDepositUsd: amount || undefined,
        hostNotes: caseForm.hostNotes.trim() || undefined,
        preferredLanguage: caseForm.preferredLanguage || undefined,
        // route 固定走后端默认 complete_dossier(前端不再暴露)
      });
      toast.success(t("admissionPanel.caseCreated"));
      setCaseForm({ ...EMPTY_CASE_FORM });
      await loadCases();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setCreating(false);
    }
  };

  const sendEmailInvite = async (caseId: string) => {
    setBusyId(caseId);
    try {
      const res = await admissionApi.inviteEmail(caseId);
      toast.success(t("admissionPanel.emailSent"));
      await refreshCase(caseId, res.data.case);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusyId("");
    }
  };

  const showQrSession = async (caseId: string) => {
    setBusyId(caseId);
    try {
      const res = await admissionApi.inviteQrSession(caseId);
      toast.success(t("admissionPanel.qrIssued"));
      await refreshCase(caseId, res.data.case);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusyId("");
    }
  };

  const revokeCase = async (caseId: string) => {
    setBusyId(caseId);
    try {
      await admissionApi.revoke(caseId);
      toast.success(t("admissionPanel.revokedToast"));
      await loadCases();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusyId("");
    }
  };

  const reenableCase = async (caseId: string) => {
    setBusyId(caseId);
    try {
      await admissionApi.reenable(caseId);
      toast.success(t("admissionPanel.reenabledToast"));
      await loadCases();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusyId("");
    }
  };

  const remindCase = async (caseId: string) => {
    setBusyId(caseId);
    try {
      await admissionApi.remind(caseId);
      toast.success(t("admissionPanel.remindSent"));
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusyId("");
    }
  };

  const refreshCase = async (caseId: string, incoming?: AdmissionCase) => {
    if (incoming) {
      setCases((prev) => prev.map((c) => (c.id === caseId ? incoming : c)));
      return;
    }
    try {
      const res = await admissionApi.get(caseId);
      setCases((prev) => prev.map((c) => (c.id === caseId ? res.data.case : c)));
    } catch {
      await loadCases();
    }
  };

  return (
    <section className="space-y-5">
      <PanelHeader
        icon={UserPlus2}
        eyebrow={t("admissionPanel.hostWorkspace")}
        title={t("admissionPanel.title")}
        onRefresh={() => {
          void loadProfile();
          void loadCases();
        }}
        refreshing={loading || profileLoading}
      />

      {/* Host activation banner */}
      {!profileLoading && (!profile || profile.status !== "active") && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <IdCard className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{t("admissionPanel.activateHost")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hosts are provisioned through the enterprise (Okta) identity. Complete the
                operational fields and acknowledge the customer-data handling policy before
                you can create VIP admission requests.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <LabeledInput
                  label={`${t("admissionPanel.operatingTeam")} *`}
                  placeholder={t("admissionPanel.operatingTeamPlaceholder")}
                  value={activateForm.operatingTeam}
                  onChange={(e) => setActivateForm((p) => ({ ...p, operatingTeam: e.target.value }))}
                />
                <LabeledInput
                  label={`${t("admissionPanel.operatingLocation")} *`}
                  placeholder={t("admissionPanel.operatingLocationPlaceholder")}
                  value={activateForm.location}
                  onChange={(e) => setActivateForm((p) => ({ ...p, location: e.target.value }))}
                />
                <LabeledInput
                  label={t("admissionPanel.phone")}
                  placeholder="+853 ..."
                  value={activateForm.phone}
                  onChange={(e) => setActivateForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={activateForm.acknowledged}
                  onChange={(e) => setActivateForm((p) => ({ ...p, acknowledged: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>
                  I acknowledge the customer-data handling policy: I will only record the minimum
                  necessary internal data and will never share Host notes, raw KYC evidence or
                  internal risk assessments with the VIP.
                </span>
              </label>
              <div className="mt-3">
                <ActionBtn icon={IdCard} tone="warning" onClick={activateProfile} disabled={activating}>
                  {activating ? t("opsUi.loading") : t("admissionPanel.activateProfile")}
                </ActionBtn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create-request form (仅 form / all 视图显示) */}
      {(view === "all" || view === "form") && profile?.status === "active" && canManage && (
        <div className="rounded-lg border border-border/60 bg-card/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("admissionPanel.newCase")}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <LabeledInput
              label={`${t("admissionPanel.firstName")} *`}
              placeholder={t("admissionPanel.firstNamePlaceholder")}
              value={caseForm.firstName}
              onChange={(e) => setCaseForm((p) => ({ ...p, firstName: e.target.value }))}
            />
            <LabeledInput
              label={`${t("admissionPanel.lastName")} *`}
              placeholder={t("admissionPanel.lastNamePlaceholder")}
              value={caseForm.lastName}
              onChange={(e) => setCaseForm((p) => ({ ...p, lastName: e.target.value }))}
            />
            <LabeledInput
              label={`${t("admissionPanel.patronEmail")} *`}
              placeholder="vip@example.test"
              value={caseForm.patronEmail}
              onChange={(e) => setCaseForm((p) => ({ ...p, patronEmail: e.target.value }))}
            />
            <LabeledInput
              label={t("admissionPanel.intendedDepositUsd")}
              placeholder={t("admissionPanel.amountInUsd")}
              inputMode="numeric"
              value={caseForm.intendedAmount}
              onChange={(e) => setCaseForm((p) => ({ ...p, intendedAmount: formatUsdInput(e.target.value) }))}
            />
            <LabeledInput
              label={t("admissionPanel.memberReference")}
              placeholder={t("admissionPanel.memberRefPlaceholder")}
              value={caseForm.memberReference}
              onChange={(e) => setCaseForm((p) => ({ ...p, memberReference: e.target.value }))}
            />
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("admissionPanel.preferredLanguage")}
              </span>
              <select
                value={caseForm.preferredLanguage}
                onChange={(e) => setCaseForm((p) => ({ ...p, preferredLanguage: e.target.value }))}
                className="h-10 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Note: 大文本框, 放在表单下方 */}
          <div className="mt-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t("admissionPanel.note")}
              </span>
              <textarea
                value={caseForm.hostNotes}
                onChange={(e) => setCaseForm((p) => ({ ...p, hostNotes: e.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/50 resize-y"
              />
            </label>
          </div>

          {/* How the Invitation Works — 已定稿流程说明(与 mockup v4/v5 一致) */}
          <div className="mt-3 rounded-lg border border-dashed border-gold/45 bg-gold/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
              {t("admissionPanel.flowTitle")}
            </p>
            <ol className="mt-2 space-y-1.5">
              {[
                t("admissionPanel.flowStep1"),
                t("admissionPanel.flowStep2"),
                t("admissionPanel.flowStep3"),
                t("admissionPanel.flowStep4"),
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/10 text-[10px] font-bold text-gold">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-3 flex items-center justify-end gap-3">
            <button
              onClick={createCase}
              disabled={creating}
              className="btn-gold rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {creating ? t("opsUi.loading") : t("admissionPanel.sendForApproval")}
            </button>
          </div>
        </div>
      )}

      {/* 需跟进汇总(B2, 可点击展开): 让 Host 一眼看到哪些 case 需要动作 */}
      {(view === "all" || view === "attention") && (
        <HostFollowUpSummary cases={attentionCases} onSelect={toggleMany} />
      )}

      {/* 分区: Need Your Attention / Approved Submission / Archived Submission */}
      {view === "all" || view === "attention" || view === "approved" || view === "archived" ? (
        <>
          {view !== "approved" && view !== "archived" && (
            <div className="rounded-lg border border-border/60 bg-card/80 p-4">
              <div className="flex items-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admissionPanel.attentionTitle")}
                </p>
              </div>
              {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
              {loading ? (
                <div className="mt-3"><LoadingSkeleton rows={2} /></div>
              ) : attentionCases.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    icon={UserPlus2}
                    title={t("admissionPanel.noAttention")}
                    description={t("admissionPanel.noAttentionHint")}
                  />
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {attentionCases.map((c) => (
                    <CaseRow
                      key={c.id}
                      c={c}
                      expanded={expanded}
                      toggleExpand={toggleExpand}
                      busyId={busyId}
                      onSendEmail={sendEmailInvite}
                      onShowQr={showQrSession}
                      onRemind={remindCase}
                      onRevoke={revokeCase}
                      onReenable={reenableCase}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {view !== "attention" && view !== "archived" && (
            <div className="rounded-lg border border-border/60 bg-card/80 p-4">
              <div className="flex items-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admissionPanel.approveTitle")}
                </p>
              </div>
              {loading ? (
                <div className="mt-3"><LoadingSkeleton rows={2} /></div>
              ) : approvedCases.length === 0 ? (
                <div className="mt-3">
                  <EmptyState
                    icon={MailCheck}
                    title={t("admissionPanel.noApproved")}
                    description={t("admissionPanel.noApprovedHint")}
                  />
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {approvedCases.map((c) => (
                    <CaseRow
                      key={c.id}
                      c={c}
                      expanded={expanded}
                      toggleExpand={toggleExpand}
                      busyId={busyId}
                      onSendEmail={sendEmailInvite}
                      onShowQr={showQrSession}
                      onRemind={remindCase}
                      onRevoke={revokeCase}
                      onReenable={reenableCase}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {view === "archived" && (
            <div className="rounded-lg border border-border/60 bg-card/80 p-4">
              <div className="flex items-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admissionPanel.archivedTitle")}
                </p>
              </div>
              {loading ? (
                <div className="mt-3"><LoadingSkeleton rows={2} /></div>
              ) : archivedCases.length === 0 ? (
                <div className="mt-3">
                  <EmptyState icon={MailCheck} title={t("admissionPanel.archivedEmpty")} description="" />
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {archivedCases.map((c) => (
                    <CaseRow
                      key={c.id}
                      c={c}
                      expanded={expanded}
                      toggleExpand={toggleExpand}
                      busyId={busyId}
                      onSendEmail={sendEmailInvite}
                      onShowQr={showQrSession}
                      onRemind={remindCase}
                      onRevoke={revokeCase}
                      onReenable={reenableCase}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
