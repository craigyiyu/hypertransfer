/**
 * StaffLogin — 工作人员(staff)专用登录入口, 路由 /ops。
 * 与客户端 Landing/Login 分开: 无 "Referred by"/邀请等 patron 元素; 面向 VA 运营/合规/托管员工。
 * 响应式: 默认桌面(居中卡片), 手机也可用(全宽 + 内边距)。两步登录: 邮箱+密码 → (强制 2FA)TOTP。
 * 登录成功 → /casino-ops。后端 require_role 才是真守卫, 本页只是入口 UX。
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Loader2, LogIn, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { authApi, apiError, isStaffUser, type AuthUser } from "@/lib/api";
import { DEMO_STAFF_TOKEN, DEMO_STAFF_USER } from "@/lib/demo-auth";

export default function StaffLogin() {
  const [, navigate] = useLocation();
  const { setSession } = useAuth();
  const { t } = useI18n();
  const [step, setStep] = useState<"cred" | "2fa">("cred");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [demo, setDemo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const finish = (token: string, user: AuthUser) => {
    setSession(token, user);
    if (isStaffUser(user)) {
      toast.success(t("staffLogin.signedIn"));
      navigate("/casino-ops");
    } else {
      toast.message("This is a customer account — opening the customer app.");
      navigate("/dashboard");
    }
  };

  const submitCred = async () => {
    if (!email.includes("@") || password.length < 1 || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await authApi.loginStart({ method: "email", email: email.trim(), password });
      if (data.next === "done" && data.token && data.user) {
        finish(data.token, data.user);
        return;
      }
      setChallenge(data.challenge || "");
      // demo: 自动填 2FA 码(login/verify 接受任意 6 位), 点 Verify 即通过。
      if (data.demo) { setDemo(true); setCode("000000"); }
      setStep("2fa");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submit2fa = async () => {
    if (code.length !== 6 || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await authApi.loginVerify(challenge, code);
      finish(data.token, data.user);
    } catch (e) {
      toast.error(apiError(e));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "w-full rounded-xl bg-secondary/40 border border-border/60 px-4 py-3 text-sm text-foreground " +
    "placeholder:text-muted-foreground/40 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30";

  return (
    <main className="min-h-[100svh] bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* 品牌头 */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold mb-3">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{t("staffLogin.title")}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Staff sign-in · authorized personnel only</p>
        </div>

        {/* 登录卡片 */}
        <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm sm:p-7">
          <div className="mb-3">
            <button
              onClick={() => navigate("/staff-onboard")}
              className="w-full rounded-xl border border-gold/40 py-2.5 text-xs font-semibold text-gold hover:bg-gold/10 transition-colors"
            >
              {t("staffLogin.newStaff")}
            </button>
          </div>
          {step === "cred" ? (
            <div className="space-y-4">
              {/* 工作人员端主登录 = Okta SSO(免 2FA)。demo: 不真实接 Okta, 直接进后台(admin 全权限)。 */}
              <button
                onClick={() => finish(DEMO_STAFF_TOKEN, DEMO_STAFF_USER)}
                className="w-full btn-gold rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                {t("staffLogin.okta")}
              </button>
              <p className="text-center text-[10px] text-muted-foreground">
                Single sign-on · no 2FA · demo (Okta not wired)
              </p>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50" /></div>
                <div className="relative flex justify-center"><span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("staffLogin.orWorkEmail")}</span></div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t("staffLogin.workEmail")}</label>
                <input
                  type="email" value={email} autoComplete="username"
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submitCred()}
                  placeholder="name@hypervelocity.hk" className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t("staffLogin.password")}</label>
                <input
                  type="password" value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submitCred()}
                  placeholder="••••••••" className={inputCls}
                />
              </div>
              <button
                onClick={() => void submitCred()}
                disabled={!email.includes("@") || password.length < 1 || submitting}
                className="w-full rounded-xl py-3 text-xs font-semibold border border-border/60 text-muted-foreground hover:border-gold/30 hover:text-gold transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {t("staffLogin.enter")}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gold">
                <KeyRound className="h-4 w-4" />
                <p className="text-sm font-semibold">{t("staffLogin.twoFactorVerification")}</p>
              </div>
              <p className="text-xs text-muted-foreground">{t("staffLogin.enterCodeFromApp")}</p>
              <input
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(e) => e.key === "Enter" && void submit2fa()}
                placeholder="000000"
                className={`${inputCls} text-center tracking-[0.5em] text-lg`}
                autoFocus
              />
              {demo && (
                <p className="text-center text-[11px] text-gold/70">
                  Demo: code auto-filled — just click Verify (any 6 digits pass).
                </p>
              )}
              <button
                onClick={() => void submit2fa()}
                disabled={code.length !== 6 || submitting}
                className="w-full btn-gold rounded-xl py-3.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify &amp; enter portal
              </button>
              <button
                onClick={() => { setStep("cred"); setCode(""); }}
                className="w-full text-xs text-muted-foreground hover:text-gold transition-colors py-1"
              >
                ← Use a different account
              </button>
            </div>
          )}
        </div>

        {/* 页脚 */}
        <p className="mt-6 text-center text-[10px] text-muted-foreground">
          Role-based access · all actions are audited
        </p>
      </div>
    </main>
  );
}
