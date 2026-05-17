/**
 * Register — Patron creates an account with form validation.
 * Fields: name, email, password with real-time validation feedback.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import FormField from "@/components/FormField";
import { User, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { validateFullName, validateEmail, validatePassword, ValidationResult } from "@/lib/validation";
import { motion } from "framer-motion";

export default function Register() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [touched, setTouched] = useState({ name: false, email: false, password: false });
  const [errors, setErrors] = useState({ name: "", email: "", password: "" });

  // Validation checks
  const nameValidation = touched.name ? validateFullName(name) : { valid: true };
  const emailValidation = touched.email ? validateEmail(email) : { valid: true };
  const passwordValidation = touched.password ? validatePassword(password) : { valid: true };

  const canSubmit =
    nameValidation.valid &&
    emailValidation.valid &&
    passwordValidation.valid &&
    name.length > 0 &&
    email.length > 0 &&
    password.length > 0;

  const handleFieldBlur = (field: "name" | "email" | "password") => {
    setTouched({ ...touched, [field]: true });
    
    let validation: ValidationResult = { valid: true };
    if (field === "name") validation = validateFullName(name);
    if (field === "email") validation = validateEmail(email);
    if (field === "password") validation = validatePassword(password);

    setErrors({ ...errors, [field]: validation.error || "" });
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    updateState({ patronName: name, patronEmail: email });
    navigate("/setup-2fa");
  };

  const passwordStrength = (() => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[!@#$%^&*]/.test(password)) strength++;
    return strength;
  })();

  return (
    <Shell showBack backTo="/" title="Create Account" subtitle="Set up your secure patron profile">
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
              placeholder="Min. 8 characters with uppercase, number, and special char"
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

          {/* Password strength indicator */}
          {password.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <motion.div
                    key={i}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 origin-left ${
                      passwordStrength >= i
                        ? i <= 2
                          ? "bg-warning"
                          : "bg-success"
                        : "bg-border"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60">
                Strength:{" "}
                <span className={
                  passwordStrength <= 1 ? "text-destructive" :
                  passwordStrength <= 2 ? "text-warning" :
                  "text-success"
                }>
                  {passwordStrength <= 1 ? "Weak" : passwordStrength <= 2 ? "Fair" : "Strong"}
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
              <li className={`flex items-center gap-2 ${password.length >= 8 ? "text-success" : "text-muted-foreground/60"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? "bg-success" : "bg-border"}`} />
                At least 8 characters
              </li>
              <li className={`flex items-center gap-2 ${/[A-Z]/.test(password) ? "text-success" : "text-muted-foreground/60"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(password) ? "bg-success" : "bg-border"}`} />
                One uppercase letter
              </li>
              <li className={`flex items-center gap-2 ${/[0-9]/.test(password) ? "text-success" : "text-muted-foreground/60"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? "bg-success" : "bg-border"}`} />
                One number
              </li>
              <li className={`flex items-center gap-2 ${/[!@#$%^&*]/.test(password) ? "text-success" : "text-muted-foreground/60"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${/[!@#$%^&*]/.test(password) ? "bg-success" : "bg-border"}`} />
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
          Continue to 2FA Setup
        </button>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-3">
          Your data is encrypted and stored with our licensed custodian partner
        </p>
      </div>
    </Shell>
  );
}
