/**
 * Setup2FA — User sets up two-factor authentication after registration.
 * Shows a mock QR code for authenticator app, then asks for verification code.
 * Includes "Skip for now" button for users without an authenticator app.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import Shell from "@/components/Shell";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Smartphone, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function Setup2FA() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const secretKey = "HYPR-4X7K-9M2P-QR6T";

  const handleCopy = () => {
    navigator.clipboard.writeText(secretKey);
    setCopied(true);
    toast.success("Secret key copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = () => {
    if (code.length === 6) {
      navigate("/kyc");
    }
  };

  const handleSkip = () => {
    navigate("/kyc");
  };

  return (
    <Shell showBack backTo="/register" title="Two-Factor Authentication" subtitle="Secure your account with an authenticator app">
      <div className="space-y-6">
        {/* QR Code placeholder */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card-gold rounded-xl p-6 flex flex-col items-center"
        >
          <div className="w-40 h-40 bg-white rounded-xl p-3 mb-4">
            <div className="w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMSAyMSI+PHJlY3Qgd2lkdGg9IjIxIiBoZWlnaHQ9IjIxIiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSI3IiBoZWlnaHQ9IjciIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjUiIGhlaWdodD0iNSIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSIyIiB5PSIyIiB3aWR0aD0iMyIgaGVpZ2h0PSIzIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjE0IiB5PSIwIiB3aWR0aD0iNyIgaGVpZ2h0PSI3IiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjE1IiB5PSIxIiB3aWR0aD0iNSIgaGVpZ2h0PSI1IiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9IjE2IiB5PSIyIiB3aWR0aD0iMyIgaGVpZ2h0PSIzIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjAiIHk9IjE0IiB3aWR0aD0iNyIgaGVpZ2h0PSI3IiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjEiIHk9IjE1IiB3aWR0aD0iNSIgaGVpZ2h0PSI1IiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9IjIiIHk9IjE2IiB3aWR0aD0iMyIgaGVpZ2h0PSIzIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjgiIHk9IjIiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMTAiIHk9IjIiIHdpZHRoPSIyIiBoZWlnaHQ9IjEiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iOCIgeT0iNCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iYmxhY2siLz48cmVjdCB4PSIxMCIgeT0iNCIgd2lkdGg9IjIiIGhlaWdodD0iMSIgZmlsbD0iYmxhY2siLz48cmVjdCB4PSI5IiB5PSI4IiB3aWR0aD0iMyIgaGVpZ2h0PSIxIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjgiIHk9IjEwIiB3aWR0aD0iMSIgaGVpZ2h0PSIzIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjEwIiB5PSIxMCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iYmxhY2siLz48cmVjdCB4PSIxMiIgeT0iMTAiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMTQiIHk9IjkiIHdpZHRoPSIzIiBoZWlnaHQ9IjEiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMTgiIHk9IjkiIHdpZHRoPSIyIiBoZWlnaHQ9IjEiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMTQiIHk9IjEyIiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjE2IiB5PSIxMiIgd2lkdGg9IjMiIGhlaWdodD0iMSIgZmlsbD0iYmxhY2siLz48cmVjdCB4PSIxNCIgeT0iMTQiIHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMTYiIHk9IjE0IiB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjE4IiB5PSIxNCIgd2lkdGg9IjIiIGhlaWdodD0iMSIgZmlsbD0iYmxhY2siLz48cmVjdCB4PSIxNCIgeT0iMTYiIHdpZHRoPSIzIiBoZWlnaHQ9IjEiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMTgiIHk9IjE2IiB3aWR0aD0iMiIgaGVpZ2h0PSIxIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjE0IiB5PSIxOCIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iYmxhY2siLz48cmVjdCB4PSIxNyIgeT0iMTgiIHdpZHRoPSIyIiBoZWlnaHQ9IjEiIGZpbGw9ImJsYWNrIi8+PC9zdmc+')] bg-contain bg-no-repeat bg-center" />
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Scan with Google Authenticator or Authy
          </p>

          {/* Manual key */}
          <div className="flex items-center gap-2 bg-input rounded-lg px-3 py-2">
            <code className="font-mono text-xs text-gold tracking-wider">{secretKey}</code>
            <button onClick={handleCopy} className="text-muted-foreground hover:text-gold transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </motion.div>

        {/* Verification */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Smartphone className="w-3.5 h-3.5" />
            Enter the 6-digit code from your app
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
      </div>

      <div className="mt-8 space-y-3">
        <button
          onClick={handleVerify}
          disabled={code.length < 6}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Verify & Continue
        </button>
        <button
          onClick={handleSkip}
          className="w-full rounded-xl py-3 text-xs text-muted-foreground hover:text-gold transition-colors"
        >
          Skip for now
        </button>
        <p className="text-[10px] text-muted-foreground/50 text-center">
          You can set up 2FA later from your profile settings
        </p>
      </div>
    </Shell>
  );
}
