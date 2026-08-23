/**
 * AdmissionCasePanel — Host workspace for the Host-led VIP admission flow
 * (2026-08-21). Replaces the legacy Access-Request tab for RM/Host roles.
 *
 * Contents:
 *  - Host activation banner (operational fields + customer-data policy ack);
 *  - create-case form (no payment-source / ID / raw KYC fields);
 *  - the Host's own case list with a status timeline;
 *  - dual-channel invitation delivery (email link + dynamic QR) and revoke.
 *
 * Hosts only ever see their own cases and the safe KYC category message
 * (`kycHostMessage`) — never raw KYC evidence, provider reports or Host notes
 * of other users.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  IdCard,
  Mail,
  MailCheck,
  Plus,
  QrCode,
  Send,
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
  patronEmail: "",
  memberReference: "",
  servicePurpose: "",
  hostNotes: "",
  preferredLanguage: "",
  route: "complete_dossier" as "complete_dossier" | "kyc_first",
};

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

/** Host 跟进汇总(B2): 按状态聚合"需要动作"的 case, 便于 follow up。 */
function HostFollowUpSummary({ cases }: { cases: AdmissionCase[] }) {
  const { t } = useI18n();
  const awaitingApproval = cases.filter((c) => c.status === "leader_pending").length;
  const kycAction = cases.filter(
    (c) => c.status === "kyc_failed" || c.status === "compliance_review",
  ).length;
  const rejected = cases.filter((c) => c.status === "rejected").length;
  const cagePending = cases.filter((c) =>
    (c.payments ?? []).some((p) => p.transferLeg === "main" && p.finalizedAt && !p.cageConfirmationId),
  ).length;

  const items = [
    { label: t("admissionPanel.awaitingApprover"), count: awaitingApproval, tone: "warning" as const },
    { label: t("admissionPanel.kycActionNeeded"), count: kycAction, tone: "danger" as const },
    { label: t("common.rejected"), count: rejected, tone: "danger" as const },
    { label: t("admissionPanel.cagePending"), count: cagePending, tone: "warning" as const },
  ].filter((i) => i.count > 0);

  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("admissionPanel.needsAttention")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((i) => (
          <Pill key={i.label} tone={i.tone}>
            {`${i.label} · ${i.count}`}
          </Pill>
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

export default function AdmissionCasePanel() {
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

  const canManage = useMemo(() => {
    const roles = new Set(user?.roles ?? []);
    return roles.has("admin") || roles.has("host");
  }, [user]);

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
      await admissionApi.create({
        patronEmail: caseForm.patronEmail.trim(),
        memberReference: caseForm.memberReference.trim() || undefined,
        servicePurpose: caseForm.servicePurpose.trim() || undefined,
        hostNotes: caseForm.hostNotes.trim() || undefined,
        preferredLanguage: caseForm.preferredLanguage.trim() || undefined,
        route: caseForm.route,
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
                you can create VIP admission cases.
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

      {/* Create-case form */}
      {profile?.status === "active" && canManage && (
        <div className="rounded-lg border border-border/60 bg-card/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("admissionPanel.newCase")}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <LabeledInput
              label={`${t("admissionPanel.patronEmail")} *`}
              placeholder="vip@example.test"
              value={caseForm.patronEmail}
              onChange={(e) => setCaseForm((p) => ({ ...p, patronEmail: e.target.value }))}
            />
            <LabeledInput
              label={t("admissionPanel.memberReference")}
              placeholder={t("admissionPanel.memberRefPlaceholder")}
              value={caseForm.memberReference}
              onChange={(e) => setCaseForm((p) => ({ ...p, memberReference: e.target.value }))}
            />
            <LabeledInput
              label={t("admissionPanel.preferredLanguage")}
              placeholder={t("admissionPanel.preferredLanguagePlaceholder")}
              value={caseForm.preferredLanguage}
              onChange={(e) => setCaseForm((p) => ({ ...p, preferredLanguage: e.target.value }))}
            />
            <LabeledInput
              label={t("admissionPanel.intendedService")}
              placeholder={t("admissionPanel.intendedService")}
              containerClassName="sm:col-span-2 lg:col-span-1"
              value={caseForm.servicePurpose}
              onChange={(e) => setCaseForm((p) => ({ ...p, servicePurpose: e.target.value }))}
            />
            <LabeledInput
              label={t("admissionPanel.hostNotes")}
              placeholder={t("admissionPanel.hostNotes")}
              containerClassName="sm:col-span-2"
              value={caseForm.hostNotes}
              onChange={(e) => setCaseForm((p) => ({ ...p, hostNotes: e.target.value }))}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t("admissionPanel.route")}</span>
              <select
                value={caseForm.route}
                onChange={(e) =>
                  setCaseForm((p) => ({
                    ...p,
                    route: e.target.value as "complete_dossier" | "kyc_first",
                  }))
                }
                className="rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs outline-none"
              >
                <option value="complete_dossier">{t("admissionPanel.completeDossier")}</option>
                <option value="kyc_first">{t("admissionPanel.kycFirstApproval")}</option>
              </select>
            </label>
            <ActionBtn icon={Plus} tone="success" onClick={createCase} disabled={creating}>
              {creating ? t("opsUi.loading") : t("admissionPanel.createCase")}
            </ActionBtn>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            No payment-source, ID or raw KYC fields are collected here. KYC runs after the VIP
            claims the invitation with an Email OTP.
          </p>
        </div>
      )}

      {/* 需跟进汇总(B2): 让 Host 一眼看到哪些 case 需要动作 */}
      <HostFollowUpSummary cases={cases} />

      {/* Case list */}
      <div className="rounded-lg border border-border/60 bg-card/80 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("admissionPanel.myCases")}
          </p>
          <Pill tone="neutral">{String(cases.length)}</Pill>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        {loading ? (
          <div className="mt-3"><LoadingSkeleton rows={2} /></div>
        ) : cases.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={UserPlus2}
              title={t("admissionPanel.noCases")}
              description={t("admissionPanel.createFirst")}
            />
          </div>
        ) : null}

        <div className="mt-3 space-y-3">
          {cases.map((c) => {
            const tone = admissionStatusTone(c.status);
            const terminal = isTerminalAdmissionStatus(c.status);
            return (
              <div key={c.id} className="card-interactive rounded-lg border border-border/40 bg-background/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gold">{c.id.slice(0, 8)}</span>
                    <span className="text-sm font-semibold text-foreground">{c.patronEmailMasked}</span>
                    <Pill tone={tone}>{ADMISSION_STATUS_LABELS[c.status]}</Pill>
                  </div>
                  <div className="flex items-center gap-2">
                    {!terminal && c.status !== "service_enabled" && (
                      <>
                        <ActionBtn
                          icon={Mail}
                          onClick={() => void sendEmailInvite(c.id)}
                          disabled={busyId === c.id}
                        >
                          Send email
                        </ActionBtn>
                        <ActionBtn
                          icon={QrCode}
                          onClick={() => void showQrSession(c.id)}
                          disabled={busyId === c.id}
                        >
                          Show QR
                        </ActionBtn>
                        <ActionBtn
                          icon={Ban}
                          tone="danger"
                          onClick={() => void revokeCase(c.id)}
                          disabled={busyId === c.id}
                        >
                          Revoke
                        </ActionBtn>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
                  <Field label={t("admissionPanel.invitation")}>
                    {c.invitation
                      ? `Email ${new Date(c.invitation.emailExpiresAt).toLocaleString()} · QR ${new Date(
                          c.invitation.qrExpiresAt,
                        ).toLocaleString()}`
                      : t("admissionPanel.notSentYet")}
                  </Field>
                </div>

                {/* 审批决策 + 原因(leader 落库后 Host 可见, 便于 follow up) */}
                {c.leaderDecision === "rejected" && (
                  <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
                    <span className="font-semibold text-destructive">{t("admissionPanel.rejectedByApprover")}</span>
                    {c.leaderReason && (
                      <span className="ml-2 text-muted-foreground">{t("common.reason")}: {c.leaderReason}</span>
                    )}
                  </div>
                )}
                {c.status === "service_enabled" && c.leaderDecision === "approved" && (
                  <div className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs font-semibold text-success">
                    {t("admissionPanel.approver")} — {t("admissionPanel.enabled")}
                  </div>
                )}

                {/* 状态 timeline */}
                <CaseTimeline status={c.status} />

                {/* Payments & settlement 状态 */}
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("admissionPanel.payments")}
                  </p>
                  {(c.payments ?? []).length === 0 ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("admissionPanel.noTransfersYet")}
                    </p>
                  ) : (
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      {(c.payments ?? []).map((p) => {
                        const confirmed = Boolean(p.finalizedAt);
                        return (
                          <div key={p.packId} className="rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground">
                                {p.transferLeg === "verification" ? t("admissionPanel.verificationLeg") : t("admissionPanel.mainTransfer")}
                              </span>
                              <Pill tone={confirmed ? "success" : "warning"}>
                                {confirmed ? t("admissionPanel.received") : p.cageConfirmationId ? t("admissionPanel.cageRecorded") : t("admissionPanel.pending")}
                              </Pill>
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
            );
          })}
        </div>
      </div>
    </section>
  );
}
