/**
 * Login — 登录第一步:邮箱或手机号 + 密码 -> /api/login/start 取得 challenge,
 * 暂存后跳 /verify-2fa 完成第二因子(TOTP)。
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authApi, apiError } from "@/lib/api";
import { LOGIN_CHALLENGE_KEY } from "@/lib/authFlow";
import { useDemoMode } from "@/contexts/DemoModeContext";

const AREA_CODES = [
  { code: "86", label: "🇨🇳 +86" },
  { code: "852", label: "🇭🇰 +852" },
  { code: "853", label: "🇲🇴 +853" },
  { code: "886", label: "🇹🇼 +886" },
  { code: "1", label: "🇺🇸 +1" },
];

export default function Login() {
  const [, navigate] = useLocation();
  const { isDemoMode, getDemoValue } = useDemoMode();
  const [loginMethod, setLoginMethod] = useState<"email" | "mobile">("email");
  const [identifier, setIdentifier] = useState("");
  const [areaCode, setAreaCode] = useState("86");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      setLoginMethod("email");
      setIdentifier(getDemoValue("email"));
      setPassword(getDemoValue("password"));
    }
  }, [isDemoMode]);

  const canSubmit =
    !submitting &&
    password.length >= 1 &&
    (loginMethod === "email"
      ? identifier.includes("@")
      : identifier.replace(/[\s\-()]/g, "").length >= 5);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await authApi.loginStart(
        loginMethod === "email"
          ? { method: "email", email: identifier, password }
          : { method: "mobile", areaCode, phoneNumber: identifier, password }
      );
      sessionStorage.setItem(LOGIN_CHALLENGE_KEY, JSON.stringify({
        challenge: data.challenge,
        label: loginMethod === "email" ? identifier : `+${areaCode} ${identifier}`,
      }));
      navigate("/verify-2fa");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell showBack backTo="/" title="Welcome Back" subtitle="Sign in to your account">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/30 p-1">
          <button type="button" onClick={() => { setLoginMethod("email"); setIdentifier(""); }}
            className={`rounded-lg py-2 text-xs font-semibold transition-all ${loginMethod === "email" ? "bg-gold text-background" : "text-muted-foreground hover:text-gold"}`}>
            Email
          </button>
          <button type="button" onClick={() => { setLoginMethod("mobile"); setIdentifier(""); }}
            className={`rounded-lg py-2 text-xs font-semibold transition-all ${loginMethod === "mobile" ? "bg-gold text-background" : "text-muted-foreground hover:text-gold"}`}>
            Mobile
          </button>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            {loginMethod === "email" ? <Mail className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
            {loginMethod === "email" ? "Email" : "Mobile Number"}
          </Label>
          {loginMethod === "email" ? (
            <Input type="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
              placeholder="your@email.com"
              className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl" />
          ) : (
            <div className="flex gap-2">
              <select value={areaCode} onChange={(e) => setAreaCode(e.target.value)}
                className="w-[104px] shrink-0 rounded-xl bg-input border border-border px-3 text-sm text-foreground focus:outline-none focus:border-gold/50">
                {AREA_CODES.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
              </select>
              <Input type="tel" inputMode="numeric" value={identifier}
                onChange={(e) => setIdentifier(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Mobile number"
                className="flex-1 bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Password
          </Label>
          <div className="relative">
            <Input type={showPw ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) handleSubmit(); }}
              placeholder="Enter password"
              className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl pr-10" />
            <button type="button" onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold transition-colors">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button type="button" onClick={() => navigate("/forgot-password")}
            className="text-xs text-gold hover:text-gold-bright transition-colors">
            Forgot password?
          </button>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign In
        </button>
        <button onClick={() => navigate("/register")}
          className="w-full text-xs text-muted-foreground hover:text-gold transition-colors py-2">
          Don't have an account? Register
        </button>
      </div>
    </Shell>
  );
}
