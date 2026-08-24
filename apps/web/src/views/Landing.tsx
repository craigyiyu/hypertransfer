/**
 * Landing — The entry point. Premium dark canvas with the HyperTransfer brand.
 * 账号为邀请制(invitation-only): 不提供自助注册入口。返回用户走 Sign In;
 * 新用户通过邀请邮件里的 /invite 链接注册(见 Invite.tsx)。
 */
import { motion } from "framer-motion";
import { LogIn, Mail } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { useLocation } from "@/lib/wouter";
import ComplianceBadges from "@/components/ComplianceBadges";
import { useI18n } from "@/contexts/I18nContext";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/hero-bg-62bvwNpUn3XWmYV9fDibfk.webp";

export default function Landing() {
  const [, navigate] = useLocation();
  const { t } = useI18n();

  return (
    <main
      className="min-h-[100svh] flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: `url(${HERO_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-background/85 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-[420px] mx-auto px-6 py-8 flex flex-col items-center">
        {/* Logo & Brand */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          className="flex flex-col items-center mb-10"
        >
          <div className="mb-4 rounded-2xl border border-gold/25 bg-card/60 p-3 shadow-lg">
            <BrandMark size={44} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {t("landing.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide">
            {t("landing.subtitle")}
          </p>
        </motion.div>

        {/* Invitation-only notice */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="w-full mb-8"
        >
          <div className="card-wine rounded-xl px-4 py-3 flex items-start gap-3">
            <Mail className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              HyperTransfer is invitation-only. New members register through the secure link
              in their invitation email. Already onboarded? Sign in below.
            </p>
          </div>
        </motion.div>

        {/* Sign In — single primary CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="w-full"
        >
          <button
            onClick={() => navigate("/login")}
            className="w-full btn-gold rounded-xl py-4 px-6 flex items-center justify-center gap-3 text-sm font-semibold"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
          <button
            onClick={() => navigate("/ops")}
            className="w-full text-[11px] text-muted-foreground/70 hover:text-gold transition-colors py-3 mt-1"
          >
            Staff member? Operations portal sign-in →
          </button>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-10 w-full"
        >
          <ComplianceBadges variant="inline" />
        </motion.div>

        {/* Legal */}
        <div className="mt-6 text-[10px] text-muted-foreground/40 text-center">
          By continuing, you agree to our{" "}
          <span className="underline cursor-pointer">Terms</span> &{" "}
          <span className="underline cursor-pointer">Privacy Policy</span>
        </div>
      </div>
    </main>
  );
}
