/**
 * Register — User creates an account with form validation.
 * Fields: name, email, password with real-time validation feedback.
 * Password meter: 3 clear states — red, yellow, green.
 * "Strong" only appears when ALL requirements pass.
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import { useDemoMode } from "@/contexts/DemoModeContext";
import Shell from "@/components/Shell";
import FormField from "@/components/FormField";
import { User, Mail, Lock, Eye, EyeOff, Phone, MessageSquare } from "lucide-react";
import { validateFullName, validateEmail, validatePassword, validatePhoneNumber, ValidationResult } from "@/lib/validation";
import { motion } from "framer-motion";

export default function Register() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const { isDemoMode, getDemoValue } = useDemoMode();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({ name: false, email: false, phone: false, password: false });
  const [errors, setErrors] = useState({ name: "", email: "", phone: "", password: "" });

  // Auto-fill demo mode
  useEffect(() => {
    if (isDemoMode) {
      setName(getDemoValue("firstName") + " " + getDemoValue("lastName"));
      setEmail(getDemoValue("email"));
      setPhone(getDemoValue("phone"));
      setVerificationCode(getDemoValue("twoFACode"));
      setCodeSent(true);
      setPassword(getDemoValue("password"));
      setTouched({ name: true, email: true, phone: true, password: true });
    }
  }, [isDemoMode]);

  // Validation checks
  const nameValidation = touched.name ? validateFullName(name) : { valid: true };
  const emailValidation = touched.email ? validateEmail(email) : { valid: true };
  const phoneValidation = touched.phone ? validatePhoneNumber(phone) : { valid: true };
  const passwordValidation = touched.password ? validatePassword(password) : { valid: true };
  const mobileVerified = codeSent && /^\d{6}$/.test(verificationCode);

  const canSubmit =
    nameValidation.valid &&
    emailValidation.valid &&
    phoneValidation.valid &&
    passwordValidation.valid &&
    mobileVerified &&
    name.length > 0 &&
    email.length > 0 &&
    phone.length > 0 &&
    password.length > 0;

  const handleFieldBlur = (field: "name" | "email" | "phone" | "password") => {
    setTouched({ ...touched, [field]: true });
    
    let validation: ValidationResult = { valid: true };
    if (field === "name") validation = validateFullName(name);
    if (field === "email") validation = validateEmail(email);
    if (field === "phone") validation = validatePhoneNumber(phone);
    if (field === "password") validation = validatePassword(password);

    setErrors({ ...errors, [field]: validation.error || "" });
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    updateState({ patronName: name, patronEmail: email, patronPhone: phone });
    navigate("/setup-2fa");
  };

  // Password strength: count how many requirements pass
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };
  const passedCount = Object.values(requirements).filter(Boolean).length;
  const allPassed = passedCount === 4;

  // 3 clear states: red (weak), yellow (fair), green (strong)
  const strengthLevel: "weak" | "fair" | "strong" = allPassed ? "strong" : passedCount >= 2 ? "fair" : "weak";
  const strengthColor = strengthLevel === "strong" ? "bg-success" : strengthLevel === "fair" ? "bg-warning" : "bg-destructive";
  const strengthTextColor = strengthLevel === "strong" ? "text-success" : strengthLevel === "fair" ? "text-warning" : "text-destructive";
  const strengthLabel = strengthLevel === "strong" ? "Strong" : strengthLevel === "fair" ? "Fair" : "Weak";

  return (
    <Shell showBack backTo="/" title="Create Account" subtitle="Set up your secure account profile">
      <div className="space-y-5">
        {/* Name */}
        <FormField
          label="Full Legal Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => handleFieldBlur("name")}
          placeholder="As shown on ID"
          icon={<User className="w-4 h-4" />}
          error={touched.name ? errors.name : undefined}
          success={touched.name && nameValidation.valid}
          required
        />

        {/* Email */}
        <FormField
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => handleFieldBlur("email")}
          placeholder="your@email.com"
          icon={<Mail className="w-4 h-4" />}
          error={touched.email ? errors.email : undefined}
          success={touched.email && emailValidation.valid}
          required
        />

        {/* Mobile number */}
        <FormField
          label="Mobile Number"
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setCodeSent(false);
            setVerificationCode("");
          }}
          onBlur={() => handleFieldBlur("phone")}
          placeholder="+852 9876 5432"
          icon={<Phone className="w-4 h-4" />}
          error={touched.phone ? errors.phone : undefined}
          success={touched.phone && phoneValidation.valid && mobileVerified}
          hint={codeSent ? "Demo: enter any 6 digits" : "A verification code will be sent to this number"}
          required
        />

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              const validation = validatePhoneNumber(phone);
              setTouched({ ...touched, phone: true });
              setErrors({ ...errors, phone: validation.error || "" });
              if (validation.valid) setCodeSent(true);
            }}
            disabled={!phone || (touched.phone && !phoneValidation.valid)}
            className="w-full rounded-xl py-3 text-xs font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {codeSent ? "Resend Verification Code" : "Send Verification Code"}
          </button>

          {codeSent && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                Verification Code <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className={`w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border transition-all text-sm
                    ${mobileVerified ? "border-success/50 focus:border-success" : "border-border/50 focus:border-gold/50"}
                    focus:outline-none focus:ring-1 focus:ring-offset-0
                    ${mobileVerified ? "focus:ring-success/30" : "focus:ring-gold/30"}
                    placeholder:text-muted-foreground/40`}
                />
                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                {mobileVerified && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-success">
                    Verified
                  </span>
                )}
              </div>
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
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => handleFieldBlur("password")}
              placeholder="Create a secure password"
              className={`w-full px-4 py-3 pl-10 rounded-lg bg-secondary/50 border transition-all text-sm
                ${errors.password && touched.password ? "border-destructive/50 focus:border-destructive" : passwordValidation.valid && touched.password ? "border-success/50 focus:border-success" : "border-border/50 focus:border-gold/50"}
                focus:outline-none focus:ring-1 focus:ring-offset-0
                ${errors.password && touched.password ? "focus:ring-destructive/30" : passwordValidation.valid && touched.password ? "focus:ring-success/30" : "focus:ring-gold/30"}
                placeholder:text-muted-foreground/40
              `}
            />
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold transition-colors"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Password strength indicator — 3 bars */}
          {password.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <div className="flex gap-1.5">
                {[1, 2, 3].map((i) => {
                  const filled =
                    (strengthLevel === "weak" && i <= 1) ||
                    (strengthLevel === "fair" && i <= 2) ||
                    (strengthLevel === "strong" && i <= 3);
                  return (
                    <motion.div
                      key={i}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-300 origin-left ${
                        filled ? strengthColor : "bg-border"
                      }`}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground/60">
                Strength:{" "}
                <span className={strengthTextColor}>
                  {strengthLabel}
                </span>
              </p>
            </motion.div>
          )}

          {/* Password error */}
          {touched.password && errors.password && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-destructive"
            >
              {errors.password}
            </motion.p>
          )}
        </div>

        {/* Requirements checklist */}
        {touched.password && password.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-wine rounded-lg p-3 space-y-2"
          >
            <p className="text-xs font-medium text-foreground">Password requirements:</p>
            <ul className="space-y-1 text-xs">
              <li className={`flex items-center gap-2 ${requirements.length ? "text-success" : "text-muted-foreground/60"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${requirements.length ? "bg-success" : "bg-border"}`} />
                At least 8 characters
              </li>
              <li className={`flex items-center gap-2 ${requirements.uppercase ? "text-success" : "text-muted-foreground/60"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${requirements.uppercase ? "bg-success" : "bg-border"}`} />
                One uppercase letter
              </li>
              <li className={`flex items-center gap-2 ${requirements.number ? "text-success" : "text-muted-foreground/60"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${requirements.number ? "bg-success" : "bg-border"}`} />
                One number
              </li>
              <li className={`flex items-center gap-2 ${requirements.special ? "text-success" : "text-muted-foreground/60"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${requirements.special ? "bg-success" : "bg-border"}`} />
                One special character (!@#$%^&*)
              </li>
            </ul>
          </motion.div>
        )}
      </div>

      {/* Submit */}
      <div className="mt-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all"
        >
          Continue
        </button>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-3">
          Your data is encrypted end-to-end and stored securely
        </p>
      </div>
    </Shell>
  );
}
