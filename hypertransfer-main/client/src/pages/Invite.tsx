/**
 * Invite — 邀请制注册落地页（路由 /invite，公开）。
 *
 * 流程:
 *  1. 从 URL query 读 token（/invite?token=xxx）。
 *  2. 用户填邮箱 → 调 /api/invitations/verify 校验邀请(token+email)。
 *  3. 通过后进入邀请注册:邮箱锁定 + 发送邮箱验证码 + 填码 + 姓名 + 密码。
 *  4. 调 /api/register/invite → 拿 TOTP 绑定信息 → 暂存(viaEmail) → 跳 /setup-2fa。
 *
 * 第一因子在邀请制下是 Email OTP（手机短信留作 step-up / 找回，见 PR②-2 决策 2）。
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import FormField from "@/components/FormField";
import { useDemo } from "@/contexts/DemoContext";
import { Mail, Lock, Eye, EyeOff, User, MessageSquare, Loader2, ShieldCheck } from "lucide-react";
import { validateFullName, validateEmail, validatePassword, ValidationResult } from "@/lib/validation";
import { invitationApi, emailApi, inviteAuthApi, apiError } from "@/lib/api";
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

export default function Invite() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();

  const [token] = useState<string>(() => readTokenFromUrl());
  const [phase, setPhase] = useState<"verify" | "register">("verify");

  // verify phase
  const [email, setEmail] = useState("");
  const [verifying, setVerifying] = useState(false);

  // register phase
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

  const handleVerifyInvite = async () => {
    const v = validateEmail(email);
    setTouched({ ...touched, email: true });
    setErrors({ ...errors, email: v.error || "" });
    if (!token) {
      toast.error("Missing invitation token. Please use the link from your invitation email.");
      return;
    }
    if (!v.valid) return;
    setVerifying(true);
    try {
      const { data } = await invitationApi.verify(token, email);
      if (data.patronName) setName(data.patronName);
      setPhase("register");
      toast.success("Invitation verified. Please complete your account.");
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
        toast.success("Verification code sent. Please check your email.");
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
        expiresAt: data.expires_at, viaEmail: true,
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
  const strengthLabel = strengthLevel === "strong" ? "Strong" : strengthLevel === "fair" ? "Fair" : "Weak";

  return (
    <Shell showBack backTo="/" title="Accept Invitation" subtitle="Register your HyperTransfer account by invitation">
      {/* 邀请说明 */}
      <div className="card-wine rounded-lg p-3 mb-5 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-gold shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          HyperTransfer accounts are invitation-only. Enter the email your invitation was sent to and
          verify it with a one-time code emailed to you.
        </p>
      </div>

      {!token && (
        <div className="card-wine rounded-lg p-3 mb-5 text-xs text-destructive">
          No invitation token found in the link. Please open the exact link from your invitation email.
        </div>
      )}

      {phase === "verify" ? (
        <div className="space-y-5">
          <FormField
            label="Invitation Email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} onBlur={() => handleFieldBlur("email")}
            placeholder="The email your invitation was sent to" icon={<Mail className="w-4 h-4" />}
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
            <label className="text-sm font-medium text-foreground flex items-center gap-1">Invitation Email</label>
            <div className="relative">
              <input
                type="email" value={email} readOnly disabled
                className="w-full px-4 py-3 pl-10 rounded-lg bg-secondary/30 border border-border/50 text-sm text-muted-foreground"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            </div>
          </div>

          <FormField
            label="Full Legal Name" value={name}
            onChange={(e) => setName(e.target.value)} onBlur={() => handleFieldBlur("name")}
            placeholder="As shown on ID" icon={<User className="w-4 h-4" />}
            error={touched.name ? errors.name : undefined}
            success={touched.name && nameValidation.valid} required
          />

          {/* Email OTP */}
          <div className="space-y-2">
            <button type="button" onClick={handleSendCode} disabled={sending || cooldown > 0}
              className="w-full rounded-xl py-3 text-xs font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {cooldown > 0 ? `Resend in ${cooldown}s` : codeSent ? "Resend Email Code" : "Send Email Verification Code"}
            </button>

            {otpVisible && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  Verification Code <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    inputMode="numeric" autoComplete="one-time-code" name="otp" maxLength={6} value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit code"
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
                  <p className="text-xs text-muted-foreground/60">Verification code sent to {email}</p>
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
                placeholder="Create a secure password"
                className={`w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border transition-all text-sm
                  ${errors.password && touched.password ? "border-destructive/50 focus:border-destructive" : passwordValidation.valid && touched.password ? "border-success/50 focus:border-success" : "border-border/50 focus:border-gold/50"}
                  focus:outline-none focus:ring-1 focus:ring-gold/30 placeholder:text-muted-foreground/40`}
              />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold transition-colors">
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
                <p className="text-xs text-muted-foreground/60">Strength: <span className={strengthTextColor}>{strengthLabel}</span></p>
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

      <p className="text-[10px] text-muted-foreground/50 text-center mt-6">
        Your data is encrypted end-to-end and stored securely
      </p>
    </Shell>
  );
}
