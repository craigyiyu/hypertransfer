/**
 * Invite — 邀请制注册落地页（路由 /invite，公开）。支持两种入口:
 *
 * A) Legacy 邀请链接(`/invite?token=xxx`): RM 提交 → Marketing 审批后签发的 single-use 链接。
 * B) Host-led VIP admission 双通道认领(2026-08-21):
 *      `/invite?emailSession=xxx` (邮件链接, 6h)
 *      `/invite?qrSession=xxx`    (动态 QR, 15min)
 *    两者都指向同一个 admission case: VIP 输入/确认邀请邮箱 → Email OTP(仅发到该邮箱)
 *    → 建 patron 账号 + 绑定 case(vip_claimed)。QR 扫描本身不认领 case。
 *
 * 第一因子在邀请制下是 Email OTP(手机短信留作 step-up / 找回, 见 PR②-2 决策 2)。
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import FormField from "@/components/FormField";
import { useDemo } from "@/contexts/DemoContext";
import { useI18n } from "@/contexts/I18nContext";
import { Mail, Lock, Eye, EyeOff, User, MessageSquare, Loader2, ShieldCheck } from "lucide-react";
import { validateFullName, validateEmail, validatePassword, ValidationResult } from "@/lib/validation";
import { invitationApi, emailApi, inviteAuthApi, admissionClaimApi, apiError } from "@/lib/api";
import { PENDING_REGISTER_KEY, PendingRegister } from "@/lib/authFlow";
import { motion } from "framer-motion";
import { toast } from "sonner";

function readTokenFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get("token")?.trim() || "";
  } catch {
    return "";
  }
}

function readClaimSessionFromUrl(): { sessionToken: string; channel: "email" | "qr" } | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const emailSession = params.get("emailSession")?.trim() || "";
    const qrSession = params.get("qrSession")?.trim() || "";
    if (emailSession) return { sessionToken: emailSession, channel: "email" };
    if (qrSession) return { sessionToken: qrSession, channel: "qr" };
    return null;
  } catch {
    return null;
  }
}

export default function Invite() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const { t } = useI18n();

  const [token] = useState<string>(() => readTokenFromUrl());
  const [claimSession] = useState<{ sessionToken: string; channel: "email" | "qr" } | null>(() =>
    readClaimSessionFromUrl(),
  );
  const claimMode = claimSession !== null;
  const [phase, setPhase] = useState<"verify" | "register">("verify");

  // ---- legacy (token) 流程状态 ----
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);

  // ---- claim 流程状态 ----
  const [claimStep, setClaimStep] = useState<"email" | "otp" | "account">("email");
  const [claimEmail, setClaimEmail] = useState("");
  const [claimMasked, setClaimMasked] = useState("");
  const [claimOtp, setClaimOtp] = useState("");
  const [claimSending, setClaimSending] = useState(false);
  const [claimRegistering, setClaimRegistering] = useState(false);

  // register phase (两种模式共用注册字段)
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [touched, setTouched] = useState({ email: false, name: false, password: false });
  const [errors, setErrors] = useState({ email: "", name: "", password: "" });

  // 重发倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const emailValidation = touched.email ? validateEmail(email) : { valid: true };
  const nameValidation = touched.name ? validateFullName(name) : { valid: true };
  const passwordValidation = touched.password ? validatePassword(password) : { valid: true };
  const isDev = import.meta.env.DEV;
  // 演示(DEV): OTP 输入框直接可见, 任意 6 位码即可(后端 DEMO_BYPASS_2FA 放行), 免依赖邮件投递。
  const otpVisible = codeSent || isDev;
  const otpEntered = otpVisible && /^\d{6}$/.test(verificationCode);

  const handleFieldBlur = (field: "email" | "name" | "password") => {
    setTouched({ ...touched, [field]: true });
    let validation: ValidationResult = { valid: true };
    if (field === "email") validation = validateEmail(email);
    if (field === "name") validation = validateFullName(name);
    if (field === "password") validation = validatePassword(password);
    setErrors({ ...errors, [field]: validation.error || "" });
  };

  // ---- claim: 发送 Email 码(verify-email 同时校验 session+邮箱, 只向该邮箱发码) ----
  const handleClaimSendCode = async () => {
    const v = validateEmail(claimEmail);
    if (!claimSession) return;
    if (!v.valid) {
      toast.error(v.error || "Please enter a valid email address.");
      return;
    }
    setClaimSending(true);
    try {
      const { data } = await admissionClaimApi.verifyEmail(claimSession.sessionToken, claimEmail);
      setClaimMasked(data.patronEmailMasked);
      setClaimStep("otp");
      setCodeSent(true);
      toast.success(t("invite.codeSentToInvite"));
      if (data.demo) {
        setClaimOtp("000000");
        toast.success("Demo: verification code auto-filled — complete the 6 digits to continue.");
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setClaimSending(false);
    }
  };

  // claim: OTP 输满 6 位 → 进入 "Set up your account"(OTP 在提交注册时验真)
  useEffect(() => {
    if (claimMode && claimStep === "otp" && /^\d{6}$/.test(claimOtp)) {
      setClaimStep("account");
    }
  }, [claimMode, claimStep, claimOtp]);

  // ---- claim: 创建账号并绑定 case ----
  const handleClaimRegister = async () => {
    if (!claimSession) return;
    const vName = validateFullName(name);
    const vPw = validatePassword(password);
    setTouched({ ...touched, name: true, password: true });
    setErrors({ ...errors, name: vName.error || "", password: vPw.error || "" });
    if (!vName.valid || !vPw.valid || !/^\d{6}$/.test(claimOtp)) return;
    setClaimRegistering(true);
    try {
      const { data } = await admissionClaimApi.register({
        sessionToken: claimSession.sessionToken,
        email: claimEmail,
        emailOtp: claimOtp,
        name,
        password,
      });
      const pending: PendingRegister = {
        areaCode: "", phoneNumber: "", name, email: claimEmail,
        qr: data.qr_png_base64, secret: data.secret, otpauth: data.otpauth_uri,
        expiresAt: data.expires_at, viaEmail: true, demo: data.demo,
      };
      sessionStorage.setItem(PENDING_REGISTER_KEY, JSON.stringify(pending));
      updateState({ patronName: name, patronEmail: claimEmail });
      navigate("/setup-2fa");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setClaimRegistering(false);
    }
  };

  const handleVerifyInvite = async () => {
    const v = validateEmail(email);
    setTouched({ ...touched, email: true });
    setErrors({ ...errors, email: v.error || "" });
    if (!token) {
      toast.error(t("invite.missingToken"));
      return;
    }
    if (!v.valid) return;
    setVerifying(true);
    try {
      const { data } = await invitationApi.verify(token, email);
      if (data.patronName) setName(data.patronName);
      setPhase("register");
      toast.success(t("invite.verified"));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setVerifying(false);
    }
  };

  const handleSendCode = async () => {
    setSending(true);
    try {
      const { data } = await emailApi.sendOtp(email);
      setCodeSent(true);
      setCooldown(data.cooldown || 60);
      // demo: 自动填入验证码(后端 DEMO_BYPASS_2FA 下任意 6 位通过), 免去查邮件。
      if (data.demo) {
        setVerificationCode("000000");
        toast.success("Demo: verification code auto-filled — just click Continue.");
      } else {
        toast.success(t("invite.codeSent"));
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  const canSubmit =
    !submitting &&
    nameValidation.valid && passwordValidation.valid && otpEntered &&
    name.length > 0 && password.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await inviteAuthApi.registerInvite({
        token, email, emailOtp: verificationCode, name, password,
      });
      const pending: PendingRegister = {
        areaCode: "", phoneNumber: "", name, email,
        qr: data.qr_png_base64, secret: data.secret, otpauth: data.otpauth_uri,
        expiresAt: data.expires_at, viaEmail: true, demo: data.demo,
      };
      sessionStorage.setItem(PENDING_REGISTER_KEY, JSON.stringify(pending));
      updateState({ patronName: name, patronEmail: email });
      navigate("/setup-2fa");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };
  const passedCount = Object.values(requirements).filter(Boolean).length;
  const strengthLevel: "weak" | "fair" | "strong" = passedCount === 4 ? "strong" : passedCount >= 2 ? "fair" : "weak";
  const strengthColor = strengthLevel === "strong" ? "bg-success" : strengthLevel === "fair" ? "bg-warning" : "bg-destructive";
  const strengthTextColor = strengthLevel === "strong" ? "text-success" : strengthLevel === "fair" ? "text-warning" : "text-destructive";
  const strengthLabel = strengthLevel === "strong" ? t("invite.strong") : strengthLevel === "fair" ? t("invite.fair") : t("invite.weak");

  return (
    <Shell showBack backTo="/" title={t("invite.accept")} subtitle={t("invite.title")}>
      {/* 邀请说明 */}
      <div className="card-wine rounded-lg p-3 mb-5 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-gold shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          HyperTransfer accounts are invitation-only. Enter the email your invitation was sent to and
          verify it with a one-time code emailed to you.
        </p>
      </div>

      {claimMode ? (
        /* ================= Host-led VIP admission 双通道认领 ================= */
        claimStep === "email" ? (
          <div className="space-y-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
                {t("invite.invitationEmail")}
              </span>
              <div className="relative">
                <input
                  type="email"
                  value={claimEmail}
                  onChange={(e) => setClaimEmail(e.target.value)}
                  placeholder={t("invite.invitationEmailHint")}
                  className="w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:border-gold/50 focus:outline-none placeholder:text-muted-foreground/40"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              </div>
            </label>
            <button
              onClick={handleClaimSendCode}
              disabled={claimSending || !claimEmail}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {claimSending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("invite.sendCode")}
            </button>
            <p className="text-xs text-muted-foreground/60">
              {claimSession.channel === "qr"
                ? "This invitation came from a QR code shown by your Host. Entering the invitation email is still required — the code is only sent to that address."
                : t("invite.qrNote")}
            </p>
          </div>
        ) : claimStep === "otp" ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                {t("invite.invitationEmail")} <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={claimMasked}
                  readOnly
                  disabled
                  className="w-full px-4 py-3 pl-10 rounded-lg bg-secondary/30 border border-border/50 text-sm text-muted-foreground"
                />
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">
                {t("invite.verificationCode")}
              </span>
              <div className="relative">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="otp"
                  maxLength={6}
                  value={claimOtp}
                  onChange={(e) => setClaimOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={t("invite.codeHint")}
                  className="w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border border-border/50 text-sm focus:border-gold/50 focus:outline-none placeholder:text-muted-foreground/40"
                />
                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              </div>
            </label>
            <p className="text-xs text-muted-foreground/60">
              {t("invite.codeSentToInvite")} {claimMasked}
            </p>
            <button
              onClick={() => void handleClaimSendCode()}
              disabled={claimSending}
              className="w-full rounded-xl py-3 text-xs font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {claimSending ? "Sending…" : t("invite.resendCodeLower")}
            </button>
          </div>
        ) : (
          /* account step: heading "Set up your account" */
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("invite.subtitle")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Email verified: {claimMasked}. Create your credentials to finish claiming your VIP invitation.
              </p>
            </div>

            <FormField
              label={t("invite.fullLegalName")} value={name}
              onChange={(e) => setName(e.target.value)} onBlur={() => handleFieldBlur("name")}
              placeholder={t("invite.asShownOnId")} icon={<User className="w-4 h-4" />}
              error={touched.name ? errors.name : undefined}
              success={touched.name && nameValidation.valid} required
            />

            {/* Password */}
            <div className="space-y-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">Password</span>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} onBlur={() => handleFieldBlur("password")}
                    placeholder={t("invite.createSecurePassword")}
                    className={`w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border transition-all text-sm
                      ${errors.password && touched.password ? "border-destructive/50 focus:border-destructive" : passwordValidation.valid && touched.password ? "border-success/50 focus:border-success" : "border-border/50 focus:border-gold/50"}
                      focus:outline-none focus:ring-1 focus:ring-gold/30 placeholder:text-muted-foreground/40`}
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? t("login.enterPassword") : t("common.password")}
                    title={showPw ? t("login.enterPassword") : t("common.password")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-gold transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>
              {password.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map((i) => {
                      const filled = (strengthLevel === "weak" && i <= 1) || (strengthLevel === "fair" && i <= 2) || (strengthLevel === "strong" && i <= 3);
                      return <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${filled ? strengthColor : "bg-border"}`} />;
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground/60">{t("invite.strength")} <span className={strengthTextColor}>{strengthLabel}</span></p>
                </motion.div>
              )}
              {touched.password && errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <button
              onClick={handleClaimRegister}
              disabled={claimRegistering || !name || !password}
              className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {claimRegistering && <Loader2 className="w-4 h-4 animate-spin" />}
              Create account
            </button>
          </div>
        )
      ) : (
        /* ================= Legacy 邀请链接流程 ================= */
        <>
          {!token && (
            <div className="card-wine rounded-lg p-3 mb-5 text-xs text-destructive">
              No invitation token found in the link. Please open the exact link from your invitation email.
            </div>
          )}

          {phase === "verify" ? (
            <div className="space-y-5">
              <FormField
                label={t("invite.invitationEmail")} type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} onBlur={() => handleFieldBlur("email")}
                placeholder={t("invite.invitationEmailHint")} icon={<Mail className="w-4 h-4" />}
                error={touched.email ? errors.email : undefined}
                success={touched.email && emailValidation.valid} required
              />
              <button onClick={handleVerifyInvite} disabled={verifying || !email || !token}
                className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify Invitation
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 邮箱锁定 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">{t("invite.invitationEmail")}</label>
                <div className="relative">
                  <input
                    type="email" value={email} readOnly disabled
                    className="w-full px-4 py-3 pl-10 rounded-lg bg-secondary/30 border border-border/50 text-sm text-muted-foreground"
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                </div>
              </div>

              <FormField
                label={t("invite.fullLegalName")} value={name}
                onChange={(e) => setName(e.target.value)} onBlur={() => handleFieldBlur("name")}
                placeholder={t("invite.asShownOnId")} icon={<User className="w-4 h-4" />}
                error={touched.name ? errors.name : undefined}
                success={touched.name && nameValidation.valid} required
              />

              {/* Email OTP */}
              <div className="space-y-2">
                <button type="button" onClick={handleSendCode} disabled={sending || cooldown > 0}
                  className="w-full rounded-xl py-3 text-xs font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {cooldown > 0 ? `Resend in ${cooldown}s` : codeSent ? t("invite.resendCode") : t("invite.sendCode")}
                </button>

                {otpVisible && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1">
                      {t("invite.verificationCode")} <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <input
                        inputMode="numeric" autoComplete="one-time-code" name="otp" maxLength={6} value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder={t("invite.codeHint")}
                        className={`w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border transition-all text-sm
                          ${otpEntered ? "border-success/50 focus:border-success" : "border-border/50 focus:border-gold/50"}
                          focus:outline-none focus:ring-1 focus:ring-gold/30 placeholder:text-muted-foreground/40`}
                      />
                      <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      {otpEntered && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-success">Ready</span>
                      )}
                    </div>
                    {codeSent ? (
                      <p className="text-xs text-muted-foreground/60">{t("invite.codeSent")} {email}</p>
                    ) : isDev ? (
                      <p className="text-xs text-gold/70">Demo: enter any 6 digits (e.g. 000000) — no email needed.</p>
                    ) : null}
                  </motion.div>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  Password <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} onBlur={() => handleFieldBlur("password")}
                    placeholder={t("invite.createSecurePassword")}
                    className={`w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border transition-all text-sm
                      ${errors.password && touched.password ? "border-destructive/50 focus:border-destructive" : passwordValidation.valid && touched.password ? "border-success/50 focus:border-success" : "border-border/50 focus:border-gold/50"}
                      focus:outline-none focus:ring-1 focus:ring-gold/30 placeholder:text-muted-foreground/40`}
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? t("login.enterPassword") : t("common.password")}
                    title={showPw ? t("login.enterPassword") : t("common.password")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-gold transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((i) => {
                        const filled = (strengthLevel === "weak" && i <= 1) || (strengthLevel === "fair" && i <= 2) || (strengthLevel === "strong" && i <= 3);
                        return <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${filled ? strengthColor : "bg-border"}`} />;
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground/60">{t("invite.strength")} <span className={strengthTextColor}>{strengthLabel}</span></p>
                  </motion.div>
                )}
                {touched.password && errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              <button onClick={handleSubmit} disabled={!canSubmit}
                className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Continue
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground/50 text-center mt-6">
        {t("invite.encrypted")}
      </p>
    </Shell>
  );
}
