/**
 * Login — 登录第一步:邮箱 + 密码 -> /api/login/start 取得 challenge,
 * 暂存后跳 /verify-2fa 完成第二因子(TOTP)。
 * 注:process v1 注册已是 Email-OTP only(无手机号), 故登录仅保留邮箱方式;
 * 手机号 step-up/找回仍在后端保留, 但不在 patron 登录页暴露。
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authApi, apiError, isStaffUser } from "@/lib/api";
import { LOGIN_CHALLENGE_KEY } from "@/lib/authFlow";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import {
  DEMO_AUTH_PASSWORD,
  DEMO_AUTH_TOKEN,
  DEMO_AUTH_USER,
  isDemoCredential,
} from "@/lib/demo-auth";

export default function Login() {
  const [, navigate] = useLocation();
  const { isDemoMode, getDemoValue } = useDemoMode();
  const { setSession } = useAuth();
  const { updateState } = useDemo();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isDemoMode) {
      setIdentifier(getDemoValue("email"));
      setPassword(getDemoValue("password"));
    }
  }, [isDemoMode]);

  const canSubmit = !submitting && password.length >= 1 && identifier.includes("@");

  const completeDemoSignIn = () => {
    setSession(DEMO_AUTH_TOKEN, DEMO_AUTH_USER);
    updateState({
      patronName: DEMO_AUTH_USER.name,
      patronEmail: DEMO_AUTH_USER.email,
      patronPhone: DEMO_AUTH_USER.phone,
    });
    sessionStorage.removeItem(LOGIN_CHALLENGE_KEY);
    toast.success("Signed in with the demo account.");
    navigate("/dashboard");
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (isDemoCredential(identifier, password)) {
      completeDemoSignIn();
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await authApi.loginStart({ method: "email", email: identifier, password });
      // 2FA 关(patron)→ 后端直接带回 token+user, 无需第二步; 否则进 /verify-2fa。
      if (data.next === "done" && data.token && data.user) {
        setSession(data.token, data.user);
        updateState({ patronName: data.user.name, patronEmail: data.user.email, patronPhone: data.user.phone });
        sessionStorage.removeItem(LOGIN_CHALLENGE_KEY);
        toast.success("Signed in successfully.");
        navigate(isStaffUser(data.user) ? "/casino-ops" : "/dashboard");
        return;
      }
      sessionStorage.setItem(LOGIN_CHALLENGE_KEY, JSON.stringify({
        challenge: data.challenge,
        label: identifier,
      }));
      navigate("/verify-2fa");
    } catch (e) {
      const message = apiError(e);
      if (import.meta.env.DEV && message === "Incorrect email or password.") {
        toast.info("No active local account found. Opening the demo session.");
        completeDemoSignIn();
        return;
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell showBack backTo="/" title="Welcome Back" subtitle="Sign in to your account">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Mail className="w-3 h-3" /> Email
          </Label>
          <Input type="email" value={identifier} onChange={(e) => setIdentifier(e.target.value.replace(/\s/g, ""))}
            placeholder="your@email.com"
            className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl" />
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
        <button
          type="button"
          onClick={() => {
            setIdentifier(DEMO_AUTH_USER.email);
            setPassword(DEMO_AUTH_PASSWORD);
            completeDemoSignIn();
          }}
          className="w-full rounded-xl py-3 text-xs font-semibold border border-gold/25 bg-gold/10 text-gold hover:bg-gold/15 transition-all"
        >
          Use Demo Account
        </button>
        <p className="w-full text-center text-[11px] text-muted-foreground/70 py-2">
          Invitation-only — open the link from your invitation email to register.
        </p>
        <button onClick={() => navigate("/ops")}
          className="w-full text-[11px] text-muted-foreground/70 hover:text-gold transition-colors py-1">
          Staff member? Operations portal sign-in →
        </button>
      </div>
    </Shell>
  );
}
