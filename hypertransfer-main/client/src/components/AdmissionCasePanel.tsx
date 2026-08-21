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
} from "@/lib/admission-case";
import { ActionBtn, Field, LabeledInput, PanelHeader, Pill } from "@/components/ops-ui";

const EMPTY_CASE_FORM = {
  patronEmail: "",
  memberReference: "",
  servicePurpose: "",
  hostNotes: "",
  preferredLanguage: "",
  route: "complete_dossier" as "complete_dossier" | "kyc_first",
};

export default function AdmissionCasePanel() {
  const { user } = useAuth();
  const { isDemoMode, getDemoValue } = useDemoMode();

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
      toast.error("Operating team and location are required to activate your Host profile.");
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
        toast.success("Host profile activated. You can now manage VIP admission cases.");
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
      toast.error("Invitation email is required.");
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
      toast.success("VIP admission case created.");
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
      toast.success("Email invitation sent (6-hour validity).");
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
      toast.success("Dynamic QR session issued (rotates every 15 minutes).");
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
      toast.success("Admission case revoked.");
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
        eyebrow="Host workspace"
        title="VIP Admissions"
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
              <p className="text-sm font-semibold text-foreground">Activate your Host profile</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hosts are provisioned through the enterprise (Okta) identity. Complete the
                operational fields and acknowledge the customer-data handling policy before
                you can create VIP admission cases.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <LabeledInput
                  label="Operating team *"
                  placeholder="e.g. Macau Table Games"
                  value={activateForm.operatingTeam}
                  onChange={(e) => setActivateForm((p) => ({ ...p, operatingTeam: e.target.value }))}
                />
                <LabeledInput
                  label="Location *"
                  placeholder="e.g. Macau Peninsula"
                  value={activateForm.location}
                  onChange={(e) => setActivateForm((p) => ({ ...p, location: e.target.value }))}
                />
                <LabeledInput
                  label="Phone"
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
                  {activating ? "Saving…" : "Activate Host profile"}
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
            New VIP admission case
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <LabeledInput
              label="Invitation email *"
              placeholder="vip@example.test"
              value={caseForm.patronEmail}
              onChange={(e) => setCaseForm((p) => ({ ...p, patronEmail: e.target.value }))}
            />
            <LabeledInput
              label="Member reference"
              placeholder="M-VIP-001 (optional)"
              value={caseForm.memberReference}
              onChange={(e) => setCaseForm((p) => ({ ...p, memberReference: e.target.value }))}
            />
            <LabeledInput
              label="Preferred language"
              placeholder="zh-Hant (optional)"
              value={caseForm.preferredLanguage}
              onChange={(e) => setCaseForm((p) => ({ ...p, preferredLanguage: e.target.value }))}
            />
            <LabeledInput
              label="Intended service"
              placeholder="VIP table credit (optional)"
              containerClassName="sm:col-span-2 lg:col-span-1"
              value={caseForm.servicePurpose}
              onChange={(e) => setCaseForm((p) => ({ ...p, servicePurpose: e.target.value }))}
            />
            <LabeledInput
              label="Host notes (internal only — never shown to the VIP)"
              placeholder="Relationship context for the compliance/leader dossier"
              containerClassName="sm:col-span-2"
              value={caseForm.hostNotes}
              onChange={(e) => setCaseForm((p) => ({ ...p, hostNotes: e.target.value }))}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Route:</span>
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
                <option value="complete_dossier">Complete dossier before leader approval</option>
                <option value="kyc_first">KYC-first service approval</option>
              </select>
            </label>
            <ActionBtn icon={Plus} tone="success" onClick={createCase} disabled={creating}>
              {creating ? "Creating…" : "Create admission case"}
            </ActionBtn>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            No payment-source, ID or raw KYC fields are collected here. KYC runs after the VIP
            claims the invitation with an Email OTP.
          </p>
        </div>
      )}

      {/* Case list */}
      <div className="rounded-lg border border-border/60 bg-card/80 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            My admission cases
          </p>
          <Pill tone="neutral">{String(cases.length)}</Pill>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        {!loading && cases.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No VIP admission cases yet. Create one above to start the invitation flow.
          </p>
        )}

        <div className="mt-3 space-y-3">
          {cases.map((c) => {
            const tone = admissionStatusTone(c.status);
            const terminal = isTerminalAdmissionStatus(c.status);
            return (
              <div key={c.id} className="rounded-lg border border-border/40 bg-background/40 p-3">
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
                  <Field label="Member reference">{c.memberReference || "—"}</Field>
                  <Field label="Host KYC status">
                    {c.kycHostMessage || (c.status === "kyc_passed" ? "KYC passed" : "—")}
                  </Field>
                  <Field label="KYC valid until">
                    {c.kycValidUntil ? (
                      <>
                        {new Date(c.kycValidUntil * 1000).toLocaleDateString()}
                        {Date.now() / 1000 > c.kycValidUntil && (
                          <span className="ml-1 text-[10px] font-semibold text-destructive">
                            EXPIRED
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </Field>
                  <Field label="Invitation">
                    {c.invitation
                      ? `Email ${new Date(c.invitation.emailExpiresAt).toLocaleString()} · QR ${new Date(
                          c.invitation.qrExpiresAt,
                        ).toLocaleString()}`
                      : "Not sent yet"}
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {c.invitation && (
                    <span className="flex items-center gap-1 text-[11px] text-success">
                      <MailCheck className="h-3 w-3" />
                      Email link + dynamic QR issued for the same case
                    </span>
                  )}
                  {terminal && (
                    <span className="text-[11px] text-muted-foreground">
                      Terminal for the active invitation — a controlled resubmission starts a new attempt.
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
