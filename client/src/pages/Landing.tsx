/**
 * Landing — The entry point. Premium dark canvas with the HyperTransfer brand.
 * Two paths: Register (new patron) or Sign In (returning patron).
 * Host QR code entry is implicit — the URL itself carries the host code.
 */
import { motion } from "framer-motion";
import { Shield, QrCode, UserPlus, LogIn } from "lucide-react";
import { useLocation } from "wouter";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/hero-bg-62bvwNpUn3XWmYV9fDibfk.webp";
const QR_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/qr-illustration-RPGHKcS3GRqKk2oQmNPeCn.webp";

export default function Landing() {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden"
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
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[oklch(0.70_0.12_85)] to-[oklch(0.85_0.14_85)] flex items-center justify-center mb-4 shadow-lg shadow-[oklch(0.75_0.12_85/0.2)]">
            <Shield className="w-7 h-7 text-background" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            HyperTransfer
          </h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide">
            Secure Crypto Transfers
          </p>
        </motion.div>

        {/* Host referral badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="w-full card-wine rounded-xl px-4 py-3 flex items-center gap-3 mb-8"
        >
          <img
            src={QR_IMG}
            alt="QR"
            className="w-10 h-10 rounded-lg object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Invited by your host</p>
            <p className="text-sm font-medium text-foreground truncate">
              Michael Chen &middot; <span className="text-gold font-mono text-xs">HC-8842</span>
            </p>
          </div>
          <QrCode className="w-5 h-5 text-gold-dim shrink-0" />
        </motion.div>

        {/* Main CTA card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="w-full space-y-3"
        >
          {/* Register */}
          <button
            onClick={() => navigate("/register")}
            className="w-full btn-gold rounded-xl py-4 px-6 flex items-center justify-center gap-3 text-sm font-semibold"
          >
            <UserPlus className="w-4 h-4" />
            Create Account
          </button>

          {/* Sign In */}
          <button
            onClick={() => navigate("/login")}
            className="w-full rounded-xl py-4 px-6 flex items-center justify-center gap-3 text-sm font-medium border border-border hover:border-gold/30 text-foreground hover:text-gold transition-all duration-200"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-10 flex items-center gap-4 text-[10px] text-muted-foreground/60"
        >
          <div className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full bg-success" />
            256-bit SSL
          </div>
          <span>&middot;</span>
          <span>Licensed Custodian</span>
          <span>&middot;</span>
          <span>Hong Kong</span>
        </motion.div>

        {/* Legal */}
        <div className="mt-6 text-[10px] text-muted-foreground/40 text-center">
          By continuing, you agree to our{" "}
          <span className="underline cursor-pointer">Terms</span> &{" "}
          <span className="underline cursor-pointer">Privacy Policy</span>
        </div>
      </div>
    </div>
  );
}
