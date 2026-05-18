import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const canSubmit = email.includes("@") && password.length >= 1;

  const handleSubmit = () => {
    updateState({ patronName: "John Doe", patronEmail: email });
    navigate("/verify-2fa");
  };

  return (
    <Shell showBack backTo="/" title="Welcome Back" subtitle="Sign in to your account">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Mail className="w-3 h-3" /> Email
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
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
        </div>
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
