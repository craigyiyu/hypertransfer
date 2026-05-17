import { useState } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Smartphone } from "lucide-react";

export default function Verify2FA() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");

  const handleVerify = () => {
    if (code.length === 6) {
      navigate("/dashboard");
    }
  };

  return (
    <Shell showBack backTo="/login" title="Two-Factor Verification" subtitle="Enter the code from your authenticator app">
      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Smartphone className="w-3.5 h-3.5" />
          6-digit code from your authenticator
        </div>
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="w-11 h-12 border-border bg-input text-foreground rounded-lg"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <p className="text-[10px] text-muted-foreground/60 text-center">
          Demo: enter any 6 digits
        </p>
      </div>

      <div className="mt-8">
        <button
          onClick={handleVerify}
          disabled={code.length < 6}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Verify
        </button>
      </div>
    </Shell>
  );
}
