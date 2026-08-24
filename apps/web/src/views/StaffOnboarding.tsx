/**
 * StaffOnboarding — 员工多角色自助 onboarding(路由 /staff-onboard, 公开)。
 *
 * Host / 单一 Manager(leader) / HK Operations(ops) 用**公司邮箱**自助注册:
 * 1) 公司邮箱 + 姓名 + 密码 + 角色  → 2) TOTP 绑定(QR + 6 位码激活) → 3) 直达工作台。
 * 后续可在后台「绑定 Okta」接入企业 SSO(本原型为 demo 占位, 非真实 OIDC)。
 */
import { useState } from "react";
import { useLocation } from "@/lib/wouter";
import { ShieldCheck, Loader2, UserPlus2, KeyRound, Building2 } from "lucide-react";
import { toast } from "sonner";
import Shell from "@/components/Shell";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import {
  apiError,
  authApi,
  isStaffUser,
  staffApi,
  type StaffOnboardingResult,
  type StaffOnboardingRole,
} from "@/lib/api";

type Step = "form" | "totp";

export default function StaffOnboarding() {
  const [, navigate] = useLocation();
  const { setSession } = useAuth();
  const { t } = useI18n();
  const ROLE_OPTIONS: { value: StaffOnboardingRole; label: string; hint: string }[] = [
    { value: "host", label: t("staffOnboard.hostRole"), hint: t("staffOnboard.hostRoleDesc") },
    { value: "leader", label: t("staffOnboard.managerRole"), hint: t("staffOnboard.managerRoleDesc") },
    { value: "ops", label: t("staffOnboard.opsRole"), hint: t("staffOnboard.opsRoleDesc") },
  ];
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffOnboardingRole>("host");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<StaffOnboardingResult | null>(null);
  const [code, setCode] = useState("");
  const [activating, setActivating] = useState(false);

  const canSubmit =
    name.trim().length > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) &&
    password.length >= 8 &&
    !submitting;

  const handleStart = async () => {
    if (!canSubmit) {
      toast.error(t("staffOnboard.formNote"));
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await staffApi.onboardingStart({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      setResult(data);
      setStep("totp");
      toast.success(t("staffOnboard.accountCreatedFor"));
      if (data.demo) {
        setCode("000000");
      }
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async () => {
    if (code.length !== 6 || activating || !result) return;
    setActivating(true);
    try {
      const { data } = await authApi.confirmTotpByEmail(result.email, code);
      setSession(data.token, data.user);
      toast.success(`Welcome, ${data.user.name}. You are signed in as ${data.user.roles?.join(", ")}.`);
      navigate(isStaffUser(data.user) ? "/casino-ops" : "/dashboard");
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setActivating(false);
    }
  };

  return (
    <Shell showBack backTo="/ops" title={t("staffOnboard.title")} subtitle={t("staffOnboard.subtitle")}>
      {step === "form" ? (
        <div className="space-y-5">
          <div className="card-wine rounded-lg p-3 flex items-start gap-2.5">
            <Building2 className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Employees (Host, Manager, HK Operations) register with their company email, set a
              password and bind a TOTP authenticator. You can connect Okta single sign-on later
              from the operations portal.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1">{t("staffOnboard.companyEmail")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@operator.example"
              className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:border-gold/50 focus:outline-none placeholder:text-muted-foreground/40"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1">{t("staffOnboard.fullName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("staffOnboard.asShownOnCompanyId")}
              className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:border-gold/50 focus:outline-none placeholder:text-muted-foreground/40"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1">{t("staffOnboard.password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("staffOnboard.minLength")}
              className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:border-gold/50 focus:outline-none placeholder:text-muted-foreground/40"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t("staffOnboard.yourRole")}</label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRole(opt.value)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    role === opt.value
                      ? "border-gold/50 bg-gold/10"
                      : "border-border/60 bg-secondary/20 hover:border-gold/30"
                  }`}
                >
                  <span className="block text-sm font-semibold text-foreground">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={!canSubmit}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus2 className="w-4 h-4" />}
            Create account &amp; bind authenticator
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success/5 p-3">
            <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p>
                {t("staffOnboard.accountCreatedFor")} <span className="font-semibold text-foreground">{result?.email}</span>{' '}
                as <span className="font-semibold text-foreground">{result?.role}</span>. Scan the QR with
                your authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center space-y-2 rounded-lg border border-border/60 bg-card/80 p-4">
            {result?.qr_png_base64 && (
              <img
                src={result.qr_png_base64}
                alt={t("staffOnboard.totpQr")}
                className="h-44 w-44 rounded-lg"
              />
            )}
            <p className="font-mono text-[11px] text-muted-foreground">Secret: {result?.secret}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1">
              {t("staffOnboard.enterCode")} <span className="text-destructive">*</span>
            </label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={t("staffOnboard.enterCode")}
              className="w-full px-4 py-3 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:border-gold/50 focus:outline-none placeholder:text-muted-foreground/40"
            />
            {result?.demo && (
              <p className="text-xs text-gold/70">{t("staffOnboard.demoAutofill")}</p>
            )}
          </div>

          <button
            onClick={handleActivate}
            disabled={code.length !== 6 || activating}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Activate &amp; enter portal
          </button>
        </div>
      )}
    </Shell>
  );
}
