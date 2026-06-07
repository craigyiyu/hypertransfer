/**
 * ForgotPassword — 通过手机号短信验证码重置登录密码。
 * 三步:① 区号+手机号 → 发码  ② 验证码 + 新密码(带强度反馈) → 重置  ③ 成功 → 去登录。
 * 重置只换密码,TOTP 第二因子不变(重置密码 ≠ 绕过 2FA)。
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Phone, MessageSquare, Lock, Eye, EyeOff, Loader2, ShieldCheck, CheckCircle2, ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { authApi, apiError } from "@/lib/api";
import { validatePhoneNumber, validatePassword } from "@/lib/validation";

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
  const [step, setStep] = useState<Step>("phone");
  const [areaCode, setAreaCode] = useState("86");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
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
  const lvlLabel = level === "strong" ? "Strong" : level === "fair" ? "Fair" : "Weak";

  const handleSendCode = async () => {
    if (!phoneValid || sending || cooldown > 0) return;
    setSending(true);
    try {
      const { data } = await authApi.passwordSendOtp(areaCode, phone);
      setStep("reset");
      setCooldown(data.cooldown || 60);
      toast.success("若该手机号已注册,验证码已发送");
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
      toast.success("验证码已重新发送");
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
    <Shell showBack backTo="/login" title="Reset Password" subtitle="通过手机号验证身份并设置新密码">
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
                  {s === "phone" ? "验证手机号" : "设置新密码"}
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
              输入注册时的手机号,我们将发送验证码核验身份。重置仅更改密码,你的双重验证(TOTP)保持不变。
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> Mobile Number
            </Label>
            <div className="flex gap-2">
              <select value={areaCode} onChange={(e) => setAreaCode(e.target.value)}
                className="w-[104px] shrink-0 rounded-xl bg-input border border-border px-3 text-sm text-foreground focus:outline-none focus:border-gold/50">
                {AREA_CODES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
              </select>
              <Input type="tel" inputMode="numeric" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter" && phoneValid) handleSendCode(); }}
                placeholder="Mobile number"
                className="flex-1 bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl" />
            </div>
          </div>

          <button onClick={handleSendCode} disabled={!phoneValid || sending || cooldown > 0}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {sending && <Loader2 className="w-4 h-4 animate-spin" />}
            {cooldown > 0 ? `${cooldown}s 后重发` : "发送验证码"}
          </button>
        </motion.div>
      )}

      {/* Step 2: 验证码 + 新密码 */}
      {step === "reset" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <p className="text-xs text-muted-foreground">
            验证码已发送至 <span className="text-foreground font-medium">+{areaCode} {phone}</span>
          </p>

          {/* 验证码 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" /> 短信验证码
            </Label>
            <div className="flex gap-2">
              <Input inputMode="numeric" autoComplete="one-time-code" name="otp" maxLength={6} value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 位验证码"
                className="flex-1 bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl tracking-widest" />
              <button onClick={handleResend} disabled={cooldown > 0 || sending}
                className="w-[110px] shrink-0 rounded-xl text-xs border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                {cooldown > 0 ? `${cooldown}s` : "重新发送"}
              </button>
            </div>
          </div>

          {/* 新密码 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> 新密码
            </Label>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="设置新密码"
                className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl pr-10" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold transition-colors">
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
                <p className="text-xs text-muted-foreground/60">Strength: <span className={lvlText}>{lvlLabel}</span></p>
              </div>
            )}
            {password.length > 0 && !pwValidation.valid && (
              <p className="text-xs text-destructive">{pwValidation.error}</p>
            )}
          </div>

          <button onClick={handleReset} disabled={!otpValid || !pwValidation.valid || submitting}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            重置密码
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
          <h2 className="text-lg font-semibold text-foreground mb-1">密码已重置</h2>
          <p className="text-sm text-muted-foreground mb-2 max-w-[280px]">
            你的密码已更新,所有旧的登录会话已失效。
          </p>
          <p className="text-xs text-muted-foreground/60 mb-8 max-w-[280px]">
            请用新密码 + 验证器 6 位码重新登录。
          </p>
          <button onClick={() => navigate("/login")}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2">
            前往登录 <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </Shell>
  );
}
