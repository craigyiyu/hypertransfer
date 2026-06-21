/**
 * Verify2FA — 登录第二步:用 challenge + TOTP 6 位码调 /api/login/verify,
 * 成功建立会话并进入 /dashboard。
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authApi, apiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useDemo } from "@/contexts/DemoContext";
import { readLoginChallenge, LOGIN_CHALLENGE_KEY } from "@/lib/authFlow";

export default function Verify2FA() {
  const [, navigate] = useLocation();
  const { setSession } = useAuth();
  const { updateState } = useDemo();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const ch = readLoginChallenge();

  useEffect(() => {
    if (!ch) navigate("/login");
  }, []);

  if (!ch) return null;

  const handleVerify = async () => {
    if (code.length !== 6 || verifying) return;
    setVerifying(true);
    try {
      const { data } = await authApi.loginVerify(ch.challenge, code);
      setSession(data.token, data.user);
      // 同步到 DemoContext,供后续页面使用
      updateState({ patronName: data.user.name, patronEmail: data.user.email, patronPhone: data.user.phone });
      sessionStorage.removeItem(LOGIN_CHALLENGE_KEY);
      toast.success("Signed in successfully.");
      navigate("/dashboard");
    } catch (e) {
      toast.error(apiError(e));
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Shell showBack backTo="/login" title="Two-Factor Verification" subtitle="Enter the code from your authenticator app">
      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="w-3.5 h-3.5" />
          6-digit code · {ch.label}
        </div>
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="w-11 h-12 border-border bg-input text-foreground rounded-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      </div>

      <div className="mt-8">
        <button onClick={handleVerify} disabled={code.length < 6 || verifying}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
          Verify
        </button>
      </div>
    </Shell>
  );
}
