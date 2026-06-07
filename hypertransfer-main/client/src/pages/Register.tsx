/**
 * Register — 创建账户(第一因子:手机号 + 真实短信 OTP)。
 * 字段:姓名、邮箱、区号+手机号、短信验证码、密码(实时强度反馈)。
 * 提交 -> 调 /api/register 拿到 TOTP 绑定信息 -> 暂存 sessionStorage -> 跳 /setup-2fa。
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import { useDemoMode } from "@/contexts/DemoModeContext";
import Shell from "@/components/Shell";
import FormField from "@/components/FormField";
import { User, Mail, Lock, Eye, EyeOff, Phone, MessageSquare, Loader2 } from "lucide-react";
import { validateFullName, validateEmail, validatePassword, validatePhoneNumber, ValidationResult } from "@/lib/validation";
import { authApi, apiError } from "@/lib/api";
import { PENDING_REGISTER_KEY } from "@/lib/authFlow";
import { motion } from "framer-motion";
import { toast } from "sonner";

const AREA_CODES = [
  { code: "86", label: "🇨🇳 +86" },
  { code: "852", label: "🇭🇰 +852" },
  { code: "853", label: "🇲🇴 +853" },
  { code: "886", label: "🇹🇼 +886" },
  { code: "1", label: "🇺🇸 +1" },
];

export default function Register() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const { isDemoMode, getDemoValue } = useDemoMode();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [areaCode, setAreaCode] = useState("86");
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({ name: false, email: false, phone: false, password: false });
  const [errors, setErrors] = useState({ name: "", email: "", phone: "", password: "" });

  // Demo 模式:仅自动填充文本字段(短信验证码必须真实获取)
  useEffect(() => {
    if (isDemoMode) {
      setName(getDemoValue("firstName") + " " + getDemoValue("lastName"));
      setEmail(getDemoValue("email"));
      setPassword(getDemoValue("password"));
      setTouched({ name: true, email: true, phone: false, password: true });
    }
  }, [isDemoMode]);

  // 重发倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const nameValidation = touched.name ? validateFullName(name) : { valid: true };
  const emailValidation = touched.email ? validateEmail(email) : { valid: true };
  const phoneValidation = touched.phone ? validatePhoneNumber(areaCode + phone) : { valid: true };
  const passwordValidation = touched.password ? validatePassword(password) : { valid: true };
  const otpEntered = codeSent && /^\d{6}$/.test(verificationCode);

  const canSubmit =
    nameValidation.valid && emailValidation.valid && phoneValidation.valid &&
    passwordValidation.valid && otpEntered &&
    name.length > 0 && email.length > 0 && phone.length > 0 && password.length > 0 &&
    !submitting;

  const handleFieldBlur = (field: "name" | "email" | "phone" | "password") => {
    setTouched({ ...touched, [field]: true });
    let validation: ValidationResult = { valid: true };
    if (field === "name") validation = validateFullName(name);
    if (field === "email") validation = validateEmail(email);
    if (field === "phone") validation = validatePhoneNumber(areaCode + phone);
    if (field === "password") validation = validatePassword(password);
    setErrors({ ...errors, [field]: validation.error || "" });
  };

  const handleSendCode = async () => {
    const validation = validatePhoneNumber(areaCode + phone);
    setTouched({ ...touched, phone: true });
    setErrors({ ...errors, phone: validation.error || "" });
    if (!validation.valid) return;
    setSending(true);
    try {
      const { data } = await authApi.sendOtp(areaCode, phone);
      setCodeSent(true);
      setCooldown(data.cooldown || 60);
      toast.success("验证码已发送，请查收短信");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await authApi.register({
        areaCode, phoneNumber: phone, otp: verificationCode, name, email, password,
      });
      // 暂存绑定信息给 Setup2FA 页面使用
      sessionStorage.setItem(PENDING_REGISTER_KEY, JSON.stringify({
        areaCode, phoneNumber: phone, name, email,
        qr: data.qr_png_base64, secret: data.secret, otpauth: data.otpauth_uri,
        expiresAt: data.expires_at,
      }));
      // 同步到 DemoContext,供后续 KYC / Dashboard 等页面使用
      updateState({ patronName: name, patronEmail: email, patronPhone: `+${areaCode} ${phone}` });
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
  const allPassed = passedCount === 4;
  const strengthLevel: "weak" | "fair" | "strong" = allPassed ? "strong" : passedCount >= 2 ? "fair" : "weak";
  const strengthColor = strengthLevel === "strong" ? "bg-success" : strengthLevel === "fair" ? "bg-warning" : "bg-destructive";
  const strengthTextColor = strengthLevel === "strong" ? "text-success" : strengthLevel === "fair" ? "text-warning" : "text-destructive";
  const strengthLabel = strengthLevel === "strong" ? "Strong" : strengthLevel === "fair" ? "Fair" : "Weak";

  return (
    <Shell showBack backTo="/" title="Create Account" subtitle="Set up your secure account profile">
      <div className="space-y-5">
        <FormField
          label="Full Legal Name" value={name}
          onChange={(e) => setName(e.target.value)} onBlur={() => handleFieldBlur("name")}
          placeholder="As shown on ID" icon={<User className="w-4 h-4" />}
          error={touched.name ? errors.name : undefined}
          success={touched.name && nameValidation.valid} required
        />

        <FormField
          label="Email Address" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} onBlur={() => handleFieldBlur("email")}
          placeholder="your@email.com" icon={<Mail className="w-4 h-4" />}
          error={touched.email ? errors.email : undefined}
          success={touched.email && emailValidation.valid} required
        />

        {/* 区号 + 手机号 */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-1">
            Mobile Number <span className="text-destructive">*</span>
          </label>
          <div className="flex gap-2">
            <select
              value={areaCode}
              onChange={(e) => { setAreaCode(e.target.value); setCodeSent(false); setVerificationCode(""); }}
              className="w-[104px] shrink-0 rounded-lg bg-secondary/50 border border-border/50 px-3 text-sm text-foreground focus:outline-none focus:border-gold/50"
            >
              {AREA_CODES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
            </select>
            <div className="relative flex-1">
              <input
                type="tel" inputMode="numeric" value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/[^\d]/g, "")); setCodeSent(false); setVerificationCode(""); }}
                onBlur={() => handleFieldBlur("phone")}
                placeholder="Mobile number"
                className={`w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border transition-all text-sm
                  ${touched.phone && errors.phone ? "border-destructive/50 focus:border-destructive" : "border-border/50 focus:border-gold/50"}
                  focus:outline-none focus:ring-1 focus:ring-gold/30 placeholder:text-muted-foreground/40`}
              />
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            </div>
          </div>
          {touched.phone && errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
        </div>

        <div className="space-y-2">
          <button
            type="button" onClick={handleSendCode}
            disabled={!phone || sending || cooldown > 0}
            className="w-full rounded-xl py-3 text-xs font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {cooldown > 0 ? `${cooldown}s 后重发` : codeSent ? "Resend Verification Code" : "Send Verification Code"}
          </button>

          {codeSent && (
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
              <p className="text-xs text-muted-foreground/60">验证码已发送至 +{areaCode} {phone}</p>
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

        {touched.password && password.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="card-wine rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-foreground">Password requirements:</p>
            <ul className="space-y-1 text-xs">
              <li className={`flex items-center gap-2 ${requirements.length ? "text-success" : "text-muted-foreground/60"}`}><span className={`w-1.5 h-1.5 rounded-full ${requirements.length ? "bg-success" : "bg-border"}`} />At least 8 characters</li>
              <li className={`flex items-center gap-2 ${requirements.uppercase ? "text-success" : "text-muted-foreground/60"}`}><span className={`w-1.5 h-1.5 rounded-full ${requirements.uppercase ? "bg-success" : "bg-border"}`} />One uppercase letter</li>
              <li className={`flex items-center gap-2 ${requirements.number ? "text-success" : "text-muted-foreground/60"}`}><span className={`w-1.5 h-1.5 rounded-full ${requirements.number ? "bg-success" : "bg-border"}`} />One number</li>
              <li className={`flex items-center gap-2 ${requirements.special ? "text-success" : "text-muted-foreground/60"}`}><span className={`w-1.5 h-1.5 rounded-full ${requirements.special ? "bg-success" : "bg-border"}`} />One special character (!@#$%^&*)</li>
            </ul>
          </motion.div>
        )}
      </div>

      <div className="mt-8">
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all flex items-center justify-center gap-2">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Continue
        </button>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-3">
          Your data is encrypted end-to-end and stored securely
        </p>
      </div>
    </Shell>
  );
}
