/**
 * ForgotPassword — 通过手机号短信验证码重置登录密码。
 * 三步:① 区号+手机号 → 发码  ② 验证码 + 新密码(带强度反馈) → 重置  ③ 成功 → 去登录。
 * 重置只换密码,TOTP 第二因子不变(重置密码 ≠ 绕过 2FA)。
 */
import { useState, useEffect } from "react";
import { useLocation } from "@/lib/wouter";
import Shell from "@/components/Shell";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Phone, MessageSquare, Lock, Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2, ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { authApi, apiError } from "@/lib/api";
import { validatePhoneNumber, validatePassword } from "@/lib/validation";
import { useI18n } from "@/contexts/I18nContext";

const AREA_CODES = [
  { code: "86", label: "🇨🇳 +86" },
  { code: "852", label: "🇭🇰 +852" },
  { code: "853", label: "🇲🇴 +853" },
  { code: "886", label: "🇹🇼 +886" },
  { code: "1", label: "🇺🇸 +1" },
];

type Step = "phone" | "reset" | "done";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("phone");
  const [areaCode, setAreaCode] = useState("86");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [demo, setDemo] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const phoneValid = validatePhoneNumber(areaCode + phone).valid;
  const pwValidation = validatePassword(password);
  const otpValid = /^\d{6}$/.test(otp);

  // 密码强度(与注册页一致的 3 段)
  const req = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };
  const passed = Object.values(req).filter(Boolean).length;
  const level: "weak" | "fair" | "strong" = passed === 4 ? "strong" : passed >= 2 ? "fair" : "weak";
  const barColor = level === "strong" ? "bg-success" : level === "fair" ? "bg-warning" : "bg-destructive";
  const lvlText = level === "strong" ? "text-success" : level === "fair" ? "text-warning" : "text-destructive";
  const lvlLabel = level === "strong" ? t("forgotPassword.strong") : level === "fair" ? t("forgotPassword.fair") : t("forgotPassword.weak");

  const handleSendCode = async () => {
    if (!phoneValid || sending || cooldown > 0) return;
    setSending(true);
    try {
      const { data } = await authApi.passwordSendOtp(areaCode, phone);
      setStep("reset");
      setCooldown(data.cooldown || 60);
      // demo: 自动填重置码(后端 DEMO_BYPASS_2FA 下 verify_otp 接受任意 6 位)。
      if (data.demo) { setDemo(true); setOtp("000000"); }
      toast.success(t("forgotPassword.ifRegistered"));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || sending) return;
    setSending(true);
    try {
      const { data } = await authApi.passwordSendOtp(areaCode, phone);
      setCooldown(data.cooldown || 60);
      toast.success(t("forgotPassword.codeResent"));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    if (!otpValid || !pwValidation.valid || submitting) return;
    setSubmitting(true);
    try {
      await authApi.passwordReset({ areaCode, phoneNumber: phone, otp, newPassword: password });
      setStep("done");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell showBack backTo="/login" title={t("forgotPassword.resetPassword")} subtitle={t("forgotPassword.subtitle")}>
      {/* 步骤指示 */}
      {step !== "done" && (
        <div className="flex items-center gap-2 mb-6">
          {(["phone", "reset"] as const).map((s, i) => {
            const active = step === s;
            const doneStep = step === "reset" && s === "phone";
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0
                  ${doneStep ? "bg-success text-background" : active ? "bg-gold text-background" : "bg-secondary text-muted-foreground"}`}>
                  {doneStep ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}>
                  {s === "phone" ? t("forgotPassword.verifyMobile") : t("forgotPassword.setNewPassword")}
                </span>
                {i === 0 && <div className="flex-1 h-px bg-border" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Step 1: 手机号 */}
      {step === "phone" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter the mobile number you used to register. Password reset only changes your password; your authenticator app remains required.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> {t("forgotPassword.mobileNumber")}
            </Label>
            <div className="flex gap-2">
              <select value={areaCode} onChange={(e) => setAreaCode(e.target.value)}
                aria-label={t("forgotPassword.mobileNumber")}
                className="w-[104px] shrink-0 rounded-xl bg-input border border-border px-3 text-sm text-foreground focus:outline-none focus:border-gold/50">
                {AREA_CODES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
              </select>
              <Input type="tel" inputMode="numeric" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter" && phoneValid) handleSendCode(); }}
                placeholder={t("forgotPassword.mobileNumber")}
                className="flex-1 bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl" />
            </div>
          </div>

          <button onClick={handleSendCode} disabled={!phoneValid || sending || cooldown > 0}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {sending && <Loader2 className="w-4 h-4 animate-spin" />}
            {cooldown > 0 ? `Resend in ${cooldown}s` : t("forgotPassword.sendVerificationCode")}
          </button>
        </motion.div>
      )}

      {/* Step 2: 验证码 + 新密码 */}
      {step === "reset" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <p className="text-xs text-muted-foreground">
            {t("forgotPassword.codeSent")} <span className="text-foreground font-medium">+{areaCode} {phone}</span>
          </p>

          {/* 验证码 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" /> {t("forgotPassword.smsVerificationCode")}
            </Label>
            <div className="flex gap-2">
              <Input inputMode="numeric" autoComplete="one-time-code" name="otp" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                className="flex-1 bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl tracking-widest" />
              <button onClick={handleResend} disabled={cooldown > 0 || sending}
                className="w-[110px] shrink-0 rounded-xl text-xs border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                {cooldown > 0 ? `${cooldown}s` : t("forgotPassword.resend")}
              </button>
            </div>
            {demo && <p className="text-[11px] text-gold/70">{t("forgotPassword.demoAutofill")}</p>}
          </div>

          {/* 新密码 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> {t("forgotPassword.newPassword")}
            </Label>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("forgotPassword.setNewPassword")}
                className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl pr-10" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? t("login.enterPassword") : t("common.password")}
                title={showPw ? t("login.enterPassword") : t("common.password")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-gold transition-colors">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((i) => {
                    const filled = (level === "weak" && i <= 1) || (level === "fair" && i <= 2) || (level === "strong" && i <= 3);
                    return <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${filled ? barColor : "bg-border"}`} />;
                  })}
                </div>
                <p className="text-xs text-muted-foreground/60">{t("forgotPassword.strength")} <span className={lvlText}>{lvlLabel}</span></p>
              </div>
            )}
            {password.length > 0 && !pwValidation.valid && (
              <p className="text-xs text-destructive">{pwValidation.error}</p>
            )}
          </div>

          <button onClick={handleReset} disabled={!otpValid || !pwValidation.valid || submitting}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("forgotPassword.resetPassword")}
          </button>
        </motion.div>
      )}

      {/* Step 3: 成功 */}
      {step === "done" && (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          className="flex-1 flex flex-col items-center justify-center text-center py-10">
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">{t("forgotPassword.resetPassword")}</h2>
          <p className="text-sm text-muted-foreground mb-2 max-w-[280px]">
            Your password has been updated and all previous sessions have been signed out.
          </p>
          <p className="text-xs text-muted-foreground/60 mb-8 max-w-[280px]">
            Sign in again with your new password and 6-digit authenticator code.
          </p>
          <button onClick={() => navigate("/login")}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2">
            {t("forgotPassword.goToSignIn")} <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </Shell>
  );
}
