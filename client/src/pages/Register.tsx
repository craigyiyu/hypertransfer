/**
 * Register — Patron creates an account. Minimal fields: name, email, password.
 * Design: Single card, dark canvas, gold CTA.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function Register() {
  const [, navigate] = useLocation();
  const { updateState } = useDemo();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const canSubmit = name.length > 1 && email.includes("@") && password.length >= 6;

  const handleSubmit = () => {
    updateState({ patronName: name, patronEmail: email });
    navigate("/setup-2fa");
  };

  return (
    <Shell showBack backTo="/" title="Create Account" subtitle="Set up your secure patron profile">
      <div className="space-y-5">
        {/* Name */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <User className="w-3 h-3" /> Full Legal Name
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As shown on ID"
            className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl"
          />
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Mail className="w-3 h-3" /> Email Address
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="bg-input border-border focus:border-gold/50 focus:ring-gold/20 h-12 rounded-xl"
          />
        </div>

        {/* Password */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Lock className="w-3 h-3" /> Password
          </Label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
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

        {/* Password strength indicator */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                password.length >= i * 2
                  ? i <= 2
                    ? "bg-destructive"
                    : "bg-success"
                  : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="mt-8">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full btn-gold rounded-xl py-4 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none"
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
