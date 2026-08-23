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
  ADMISSION_STATUS_LABELS,
  admissionStatusTone,
  isTerminalAdmissionStatus,
  type AdmissionCaseStatus,
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

/** 千分位格式化输入: 保留数字与小数点, 整数部分加千分位逗号。 */
function formatThousandSeparators(raw: string): string {
  // 只保留数字和小数点(去掉已输入的逗号)
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dotIdx = cleaned.indexOf(".");
  if (dotIdx === -1) {
    return cleaned.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  const intPart = cleaned.slice(0, dotIdx).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intPart}.${cleaned.slice(dotIdx + 1).slice(0, 2)}`;
}

const LANGUAGE_OPTIONS = [
  { value: "zh", labelKey: "admissionPanel.langZh" },
  { value: "zh-Hant", labelKey: "admissionPanel.langZhHant" },
  { value: "en", labelKey: "admissionPanel.langEn" },
  { value: "other", labelKey: "admissionPanel.langOther" },
] as const;

const ADMISSION_MILESTONES: { key: AdmissionCaseStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "invitation_open", label: "Invited" },
  { key: "vip_claimed", label: "Claimed" },
  { key: "kyc_in_progress", label: "KYC" },
  { key: "kyc_passed", label: "KYC OK" },
  { key: "payment_precheck", label: "Pre-check" },
  { key: "leader_pending", label: "Approver" },
  { key: "service_enabled", label: "Enabled" },
];

/** Host 跟进汇总(B2, 可点击): 按状态聚合"需要动作"的 case; 点击展开对应行。 */
function HostFollowUpSummary({
  cases,
  onSelect,
}: {
  cases: AdmissionCase[];
  onSelect: (caseIds: string[]) => void;
}) {
  const { t } = useI18n();
  const awaitingApproval = cases.filter((c) => c.status === "leader_pending");
  const kycAction = cases.filter(
    (c) => c.status === "kyc_failed" || c.status === "compliance_review",
  );
  const rejected = cases.filter((c) => c.status === "rejected");
  const cagePending = cases.filter((c) =>
    (c.payments ?? []).some((p) => p.transferLeg === "main" && p.finalizedAt && !p.cageConfirmationId),
  );

  const items = [
    { label: t("admissionPanel.awaitingApprover"), ids: awaitingApproval.map((c) => c.id), tone: "warning" as const },
    { label: t("admissionPanel.kycActionNeeded"), ids: kycAction.map((c) => c.id), tone: "danger" as const },
    { label: t("common.rejected"), ids: rejected.map((c) => c.id), tone: "danger" as const },
    { label: t("admissionPanel.cagePending"), ids: cagePending.map((c) => c.id), tone: "warning" as const },
  ].filter((i) => i.ids.length > 0);

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

function CaseTimeline({ status }: { status: AdmissionCaseStatus }) {
  const { t } = useI18n();
  const order = ADMISSION_MILESTONES.map((m) => m.key);
  const idx = order.indexOf(status);
  const current = idx >= 0 ? idx : order.length - 1;
  const terminal = isTerminalAdmissionStatus(status);
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t("admissionPanel.admissionStatus")}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {ADMISSION_MILESTONES.map((m, i) => {
          const done = terminal ? i <= current : i < current;
          const isCurrent = i === current && !terminal;
          return (
            <div key={m.key} className="flex items-center gap-1">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  done
                    ? "border-success/30 bg-success/10 text-success"
                    : isCurrent
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-border/40 bg-secondary/20 text-muted-foreground/60"
                }`}
              >
                {m.label}
              </span>
              {i < ADMISSION_MILESTONES.length - 1 && (
                <span className="text-[9px] text-border">→</span>
              )}
            </div>
          );
        })}
        {terminal && (
          <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            {ADMISSION_STATUS_LABELS[status]}
          </span>
        )}
      </div>
    </div>
  );
}

/** 单个 VIP 请求行: 行头(可展开 + 操作按钮) + 展开详情。 */
function CaseRow({
  c,
  expanded,
  toggleExpand,
  busyId,
  onSendEmail,
  onShowQr,
  onRemind,
  onRevoke,
}: {
  c: AdmissionCase;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  busyId: string;
  onSendEmail: (id: string) => void;
  onShowQr: (id: string) => void;
  onRemind: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  const { t } = useI18n();
  const tone = admissionStatusTone(c.status);
  const terminal = isTerminalAdmissionStatus(c.status);
  const isOpen = expanded.has(c.id);
  const isApproved = c.status === "service_enabled";
  const displayName = c.patronName || c.patronEmailMasked;
  return (
    <div
      className={`rounded-lg border bg-background/40 transition-colors ${
        isOpen ? "border-gold/40" : "border-border/40 card-interactive"
      }`}
    >
      {/* Row header — click to expand */}
      <button
        onClick={() => toggleExpand(c.id)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left focus:outline-none focus:ring-1 focus:ring-gold/40 rounded-lg"
        aria-expanded={isOpen}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">{displayName}</span>
          {c.patronName && (
            <span className="hidden text-xs text-muted-foreground sm:inline">{c.patronEmailMasked}</span>
          )}
          {isApproved ? (
            <Pill tone="success">{t("admissionPanel.serviceEnabledTag")}</Pill>
          ) : (
            <Pill tone={tone}>{ADMISSION_STATUS_LABELS[c.status]}</Pill>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!isApproved && !terminal && (
            <>
              <ActionBtn icon={Mail} onClick={() => void onSendEmail(c.id)} disabled={busyId === c.id}>
                {t("admissionPanel.sendEmail")}
              </ActionBtn>
              <ActionBtn icon={QrCode} onClick={() => void onShowQr(c.id)} disabled={busyId === c.id}>
                {t("admissionPanel.showQr")}
              </ActionBtn>
            </>
          )}
          {!isApproved && (
            <ActionBtn icon={MailCheck} onClick={() => void onRemind(c.id)} disabled={busyId === c.id}>
              {t("admissionPanel.remind")}
            </ActionBtn>
          )}
          {!isApproved && !terminal && (
            <ActionBtn icon={Ban} tone="danger" onClick={() => void onRevoke(c.id)} disabled={busyId === c.id}>
              {t("admissionPanel.revoke")}
            </ActionBtn>
          )}
        </div>
      </button>

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

          {/* KYC 记录(仅已启用/有 KYC 数据的 case; 按通过时间倒序) */}
          {(c.kycRecords ?? []).length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("admissionPanel.kycRecords")}
              </p>
              <div className="mt-1 space-y-1.5">
                {[...(c.kycRecords ?? [])]
                  .sort((a, b) => (b.approvedAt ?? b.submittedAt ?? 0) - (a.approvedAt ?? a.submittedAt ?? 0))
                  .map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[11px]">
                      <Pill tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "neutral"}>
                        {r.status === "approved" ? t("admissionPanel.kycPassed") : r.status === "rejected" ? t("admissionPanel.kycFailed") : t("admissionPanel.kycPending")}
                      </Pill>
                      {r.approvedAt && (
                        <span className="text-muted-foreground">
                          {t("admissionPanel.kycApprovedOn")} {new Date(r.approvedAt * 1000).toLocaleDateString()}
                        </span>
                      )}
                      {r.validUntil && (
                        <span className="text-muted-foreground">
                          · {t("admissionPanel.kycValidUntil")} {new Date(r.validUntil * 1000).toLocaleDateString()}
                        </span>
                      )}
                      {r.submittedAt && !r.approvedAt && (
                        <span className="text-muted-foreground">
                          {t("admissionPanel.kycSubmittedOn")} {new Date(r.submittedAt * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 概要字段 */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("admissionPanel.intendedDeposit")}>{c.servicePurpose || "—"}</Field>
            <Field label={t("admissionPanel.memberReference")}>{c.memberReference || "—"}</Field>
            <Field label={t("admissionPanel.kycStatus")}>
              {c.kycHostMessage || (c.status === "kyc_passed" ? t("admissionPanel.kycPassed") : "—")}
            </Field>
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
            <Field label={t("admissionPanel.note")}>{c.hostNotes || "—"}</Field>
            <Field label={t("admissionPanel.invitation")}>
              {c.invitation
                ? `Email ${new Date(c.invitation.emailExpiresAt).toLocaleString()} · QR ${new Date(
                    c.invitation.qrExpiresAt,
                  ).toLocaleString()}`
                : t("admissionPanel.notSentYet")}
            </Field>
          </div>

          {/* Payments & settlement 状态 — 按到账日期倒序 */}
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("admissionPanel.payments")}
            </p>
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
                      <div key={p.packId} className="rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            {p.transferLeg === "verification" ? t("admissionPanel.verificationLeg") : t("admissionPanel.mainTransfer")}
                          </span>
                          <span className="flex items-center gap-2">
                            {p.finalizedAt && (
                              <span className="text-muted-foreground">
                                {new Date(p.finalizedAt * 1000).toLocaleDateString()}
                              </span>
                            )}
                            <Pill tone={confirmed ? "success" : "warning"}>
                              {confirmed ? t("admissionPanel.received") : p.cageConfirmationId ? t("admissionPanel.cageRecorded") : t("admissionPanel.pending")}
                            </Pill>
                          </span>
                        </div>
                      <p className="mt-1 text-muted-foreground">
                        {p.actualAmount} USDT · {p.travelRuleDepth} Travel Rule · KYT {p.kytStatus}
                      </p>
                      {p.txHash && (
                        <p className="mt-0.5 max-w-[220px] truncate font-mono text-gold">{p.txHash}</p>
                      )}
                      <p className="mt-1 text-muted-foreground">
                        {p.cageConfirmationId
                          ? `Cage: ${p.cageConfirmationId}`
                          : t("admissionPanel.cageNotRecorded")}
                        {p.reconciliationRef ? ` · Recon: ${p.reconciliationRef}` : " · Recon: pending"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {c.invitation && (
              <span className="flex items-center gap-1 text-[11px] text-success">
                <MailCheck className="h-3 w-3" />
                {t("admissionPanel.dualChannelIssued")}
              </span>
            )}
            {terminal && (
              <span className="text-[11px] text-muted-foreground">
                {t("admissionPanel.terminalNote")}
              </span>
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
  /** 左侧三菜单复用: form=创建表单 / attention=待办列表 / approved=已启用列表 / all=完整工作台 */
  view?: "form" | "attention" | "approved" | "all";
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

  // 两区划分: service_enabled -> Approve VIP Request(已启用); 其余 -> Need Your Attention
  const attentionCases = useMemo(
    () => cases.filter((c) => c.status !== "service_enabled"),
    [cases],
  );
  const approvedCases = useMemo(
    () => cases.filter((c) => c.status === "service_enabled"),
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

  const expandMany = useCallback((ids: string[]) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
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
      // Intended deposit: amount + USDT (servicePurpose 存展示串, 供 leader dossier/邮件使用)
      // 金额先去千分位逗号再入库
      const amount = caseForm.intendedAmount.replace(/,/g, "").trim();
      const servicePurpose = amount
        ? `${amount} USDT`
        : undefined;
      await admissionApi.create({
        patronEmail: caseForm.patronEmail.trim(),
        firstName: caseForm.firstName.trim() || undefined,
        lastName: caseForm.lastName.trim() || undefined,
        memberReference: caseForm.memberReference.trim() || undefined,
        servicePurpose,
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
              onChange={(e) => setCaseForm((p) => ({ ...p, intendedAmount: formatThousandSeparators(e.target.value) }))}
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
                className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
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
                placeholder={t("admissionPanel.notePlaceholder")}
                rows={4}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/50 resize-y"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              {t("admissionPanel.formNote")}
            </p>
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
        <HostFollowUpSummary cases={cases} onSelect={expandMany} />
      )}

      {/* 分两区: Need Your Attention(未启用) + Approve VIP Request(已启用) */}
      {view === "all" || view === "attention" || view === "approved" ? (
        <>
          {view !== "approved" && (
            <div className="rounded-lg border border-border/60 bg-card/80 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admissionPanel.attentionTitle")}
                </p>
                <Pill tone="warning">{String(attentionCases.length)}</Pill>
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
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {view !== "attention" && (
            <div className="rounded-lg border border-border/60 bg-card/80 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admissionPanel.approveTitle")}
                </p>
                <Pill tone="success">{String(approvedCases.length)}</Pill>
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
