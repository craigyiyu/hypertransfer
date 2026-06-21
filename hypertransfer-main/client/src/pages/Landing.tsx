/**
 * Landing — The entry point. Premium dark canvas with the HyperTransfer brand.
 * Two paths: Register (new user) or Sign In (returning user).
 * Referral code is implicit — the URL itself carries the referral code.
 */
import { motion } from "framer-motion";
import { useState } from "react";
import { Shield, QrCode, UserPlus, LogIn } from "lucide-react";
import { useLocation } from "wouter";
import ComplianceBadges from "@/components/ComplianceBadges";
import { useI18n } from "@/contexts/I18nContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/hero-bg-62bvwNpUn3XWmYV9fDibfk.webp";
const QR_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/qr-illustration-RPGHKcS3GRqKk2oQmNPeCn.webp";

function DemoReferralQr() {
  const size = 25;
  const modules = Array.from({ length: size * size }, (_, index) => {
    const x = index % size;
    const y = Math.floor(index / size);
    const finder =
      (x <= 6 && y <= 6) ||
      (x >= size - 7 && y <= 6) ||
      (x <= 6 && y >= size - 7);
    const finderInner =
      ((x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
        (x >= size - 5 && x <= size - 3 && y >= 2 && y <= 4) ||
        (x >= 2 && x <= 4 && y >= size - 5 && y <= size - 3));
    const finderGap =
      ((x === 1 || x === 5) && y <= 6) ||
      ((y === 1 || y === 5) && x <= 6) ||
      ((x === size - 6 || x === size - 2) && y <= 6) ||
      ((y === 1 || y === 5) && x >= size - 7) ||
      ((x === 1 || x === 5) && y >= size - 7) ||
      ((y === size - 6 || y === size - 2) && x <= 6);
    const data = ((x * 7 + y * 11 + x * y) % 5 === 0) || ((x + y * 3) % 7 === 0);
    return finder ? !finderGap || finderInner : data;
  });

  return (
    <div className="mx-auto w-56 h-56 rounded-2xl bg-white p-3 shadow-xl shadow-black/30">
      <div className="grid grid-cols-[repeat(25,1fr)] gap-0.5 w-full h-full">
        {modules.map((filled, index) => (
          <div
            key={index}
            className={filled ? "rounded-[1px] bg-zinc-950" : "rounded-[1px] bg-white"}
          />
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const [qrOpen, setQrOpen] = useState(false);

  return (
    <div
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
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[oklch(0.70_0.12_85)] to-[oklch(0.85_0.14_85)] flex items-center justify-center mb-4 shadow-lg shadow-[oklch(0.75_0.12_85/0.2)]">
            <Shield className="w-7 h-7 text-background" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("landing.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide">
            {t("landing.subtitle")}
          </p>
        </motion.div>

        {/* Referral badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="w-full mb-8"
        >
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="w-full card-wine rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-all duration-200 hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            aria-label="Open Michael Chen referral QR code"
          >
            <img
              src={QR_IMG}
              alt=""
              className="w-10 h-10 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Referred by</p>
              <p className="text-sm font-medium text-foreground truncate">
                Michael Chen &middot; <span className="text-gold font-mono text-xs">HC-8842</span>
              </p>
            </div>
            <QrCode className="w-5 h-5 text-gold-dim shrink-0" />
          </button>
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

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-[360px] border-border bg-card p-5 text-center">
          <DialogHeader className="text-center">
            <DialogTitle className="text-foreground">Demo Referral QR</DialogTitle>
            <DialogDescription>
              Scan this demo invitation for Michael Chen · HC-8842.
            </DialogDescription>
          </DialogHeader>
          <DemoReferralQr />
          <div className="rounded-xl bg-secondary/30 px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Referral Code
            </p>
            <p className="text-sm font-mono font-semibold text-gold">HC-8842</p>
          </div>
          <DialogFooter className="sm:flex-col sm:space-x-0">
            <button
              type="button"
              onClick={() => {
                setQrOpen(false);
                navigate("/register");
              }}
              className="w-full btn-gold rounded-xl py-3 text-sm font-semibold"
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => setQrOpen(false)}
              className="w-full rounded-xl py-3 text-xs text-muted-foreground hover:text-gold transition-colors"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
