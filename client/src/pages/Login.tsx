import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff, Phone, Info } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const [loginMethod, setLoginMethod] = useState<"email" | "mobile">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showResetHelp, setShowResetHelp] = useState(false);

  const canSubmit =
    loginMethod === "email"
      ? identifier.includes("@") && password.length >= 1
      : identifier.replace(/[\s\-()]/g, "").length >= 6 && password.length >= 1;

  const handleSubmit = () => {
    updateState({
      patronName: "John Doe",
      patronEmail: loginMethod === "email" ? identifier : "",
      patronPhone: loginMethod === "mobile" ? identifier : "",
    });
    navigate("/verify-2fa");
  };

  return (
    <Shell showBack backTo="/" title="Welcome Back" subtitle="Sign in to your account">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/30 p-1">
          <button
            type="button"
            onClick={() => {
              setLoginMethod("email");
              setIdentifier("");
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition-all ${
              loginMethod === "email"
                ? "bg-gold text-background"
                : "text-muted-foreground hover:text-gold"
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginMethod("mobile");
              setIdentifier("");
            }}
            className={`rounded-lg py-2 text-xs font-semibold transition-all ${
              loginMethod === "mobile"
                ? "bg-gold text-background"
                : "text-muted-foreground hover:text-gold"
            }`}
          >
            Mobile
          </button>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            {loginMethod === "email" ? (
              <Mail className="w-3 h-3" />
            ) : (
              <Phone className="w-3 h-3" />
            )}
            {loginMethod === "email" ? "Email" : "Mobile Number"}
          </Label>
          <Input
            type={loginMethod === "email" ? "email" : "tel"}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={loginMethod === "email" ? "your@email.com" : "+852 9876 5432"}
            className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Password
          </Label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gold transition-colors"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowResetHelp(!showResetHelp)}
            className="text-xs text-gold hover:text-gold-bright transition-colors"
          >
            Forgot password?
          </button>
        </div>

        {showResetHelp && (
          <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter your registered email or mobile number, then contact HyperTransfer Support to reset your password. For security, we will verify your identity before issuing a reset link or temporary code.
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 space-y-3">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Sign In
        </button>
        <button
          onClick={() => navigate("/register")}
          className="w-full text-xs text-muted-foreground hover:text-gold transition-colors py-2"
        >
          Don't have an account? Register
        </button>
      </div>
    </Shell>
  );
}
