/**
 * DemoHome — Demo 首页 / 入口枢纽(路由 "/")。
 * 一屏同时放**客户端**和**工作人员端**两个入口, 方便演示时快速切换两侧。
 * 客户端 → /welcome(patron Landing → Sign In / 邀请注册); 工作人员端 → /ops(Okta demo 登录)。
 * 纯 demo 便利页; 真实产品的客户首页仍是 /welcome(Landing)。
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, ArrowRight, Users, Building2, ShieldCheck } from "lucide-react";

const HERO_BG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663574945903/iTEdVVzV69Mbx6YDNWtLkk/hero-bg-62bvwNpUn3XWmYV9fDibfk.webp";

interface EntryCard {
  key: string;
  eyebrow: string;
  title: string;
  desc: string;
  points: string[];
  cta: string;
  to: string;
  icon: typeof Users;
}

const ENTRIES: EntryCard[] = [
  {
    key: "customer",
    eyebrow: "Customer",
    title: "Patron App",
    desc: "The player-facing HyperTransfer H5: invite sign-in, KYC, compliant crypto deposit, and refunds.",
    points: ["Invite-only sign-in + Email OTP", "KYC → source-wallet KYT → 1 USDT verify", "Deposit (fees / HKD) · Refund to verified wallet"],
    cta: "Open customer app",
    to: "/welcome",
    icon: Users,
  },
  {
    key: "staff",
    eyebrow: "Operator",
    title: "Operations Portal",
    desc: "Casino staff back office: access-request approvals, deposit & refund queues, custody, and settlement.",
    points: ["Sign in with Okta (demo · no 2FA)", "Access requests · Deposits · Refunds", "Hex Safe custody · Treasury & compliance"],
    cta: "Open staff portal",
    to: "/ops",
    icon: Building2,
  },
];

export default function DemoHome() {
  const [, navigate] = useLocation();

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-background">
      {/* 背景 */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: `url(${HERO_BG})` }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />

      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-4xl flex-col items-center justify-center px-4 py-12">
        {/* 品牌头 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-col items-center text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">HyperTransfer</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Compliant virtual-asset deposit orchestration. Pick a side to explore the demo.
          </p>
          <span className="mt-3 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold">
            Demo entry
          </span>
        </motion.div>

        {/* 两个入口卡片 */}
        <div className="grid w-full gap-4 sm:grid-cols-2">
          {ENTRIES.map((e, i) => {
            const Icon = e.icon;
            return (
              <motion.button
                key={e.key}
                initial={{ y: 16 }}
                animate={{ y: 0 }}
                transition={{ delay: 0.05 + i * 0.08 }}
                onClick={() => navigate(e.to)}
                className="group flex flex-col rounded-2xl border border-border/60 bg-card/70 p-6 text-left transition-all hover:border-gold/40 hover:bg-card"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/10 text-gold">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {e.eyebrow}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-foreground">{e.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{e.desc}</p>

                <ul className="mt-4 space-y-1.5">
                  {e.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-gold/70" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>

                <span className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-gold transition-colors group-hover:text-gold-bright">
                  {e.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </motion.button>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[10px] text-muted-foreground/50">
          Demo hub · both entries shown for convenience — a real deployment separates customer and staff access.
        </p>
      </div>
    </div>
  );
}
