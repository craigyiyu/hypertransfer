/**
 * DemoHome — Demo 首页 / 入口枢纽(路由 "/")。
 * 一屏同时放**客户端**和**工作人员端**两个入口 + **四角色一键演示入口**:
 * Host / Manager / HK Ops / VIP, 点击直接以该角色登录进入对应工作台(免输邮箱密码)。
 * 纯 demo 便利页; 真实产品的客户首页仍是 /welcome(Landing)。
 */
import { useState } from "react";
import { useLocation } from "@/lib/wouter";
import { motion } from "framer-motion";
import {
  Shield,
  ArrowRight,
  Users,
  Building2,
  ShieldCheck,
  UserPlus2,
  Gavel,
  Banknote,
  Sparkles,
  Loader2,
} from "lucide-react";
import { appBuildLabel } from "@/lib/app-version";
import { useI18n } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { authApi, apiError } from "@/lib/api";
import { toast } from "sonner";

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

/** 四角色一键演示入口: role → 图标 + 落点工作台。 */
const ROLE_ENTRIES: {
  role: "host" | "leader" | "ops" | "vip";
  icon: typeof Users;
  titleKey: string;
  descKey: string;
  go: string;
}[] = [
  { role: "host", icon: UserPlus2, titleKey: "demoHome.roleHost", descKey: "demoHome.roleHostDesc", go: "/casino-ops" },
  { role: "leader", icon: Gavel, titleKey: "demoHome.roleLeader", descKey: "demoHome.roleLeaderDesc", go: "/casino-ops" },
  { role: "ops", icon: Banknote, titleKey: "demoHome.roleOps", descKey: "demoHome.roleOpsDesc", go: "/casino-ops" },
  { role: "vip", icon: Sparkles, titleKey: "demoHome.roleVip", descKey: "demoHome.roleVipDesc", go: "/dashboard" },
];

export default function DemoHome() {
  const [, navigate] = useLocation();
  const { t } = useI18n();
  const { setSession } = useAuth();
  const [entering, setEntering] = useState<string | null>(null);

  const enterRole = async (role: "host" | "leader" | "ops" | "vip", go: string) => {
    setEntering(role);
    try {
      const { data } = await authApi.demoEnter(role);
      setSession(data.token, data.user);
      toast.success(`Signed in as ${data.user.name}`);
      navigate(go);
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setEntering(null);
    }
  };

  const ENTRIES: EntryCard[] = [
    {
      key: "customer",
      eyebrow: t("demoHome.customer"),
      title: t("demoHome.patronApp"),
      desc: "The player-facing HyperTransfer H5: invite sign-in, KYC, compliant crypto deposit, and withdrawals.",
      points: ["Invite-only sign-in + Email OTP", "KYC → source-wallet KYT → 1 USDT verify", "Deposit (fees / HKD) · Withdrawal to verified wallet"],
      cta: t("demoHome.openCustomerApp"),
      to: "/welcome",
      icon: Users,
    },
    {
      key: "staff",
      eyebrow: t("demoHome.operator"),
      title: t("demoHome.operationsPortal"),
      desc: "Casino staff back office: access-request approvals, deposit and withdrawal queues, and marker settlement.",
      points: ["Sign in with Okta (demo · no 2FA)", "Access requests · Deposits · Withdrawals", "Marker reference · WTA settlement"],
      cta: t("demoHome.openStaffPortal"),
      to: "/ops",
      icon: Building2,
    },
  ];

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-background">
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
            {t("demoHome.subtitle")}
          </p>
        </motion.div>

        {/* 四角色一键演示入口 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-8 w-full"
        >
          <p className="mb-3 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("demoHome.quickRoles")}
          </p>
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            {ROLE_ENTRIES.map((r) => {
              const Icon = r.icon;
              const busy = entering === r.role;
              return (
                <motion.button
                  key={r.role}
                  whileHover={{ y: -2 }}
                  onClick={() => void enterRole(r.role, r.go)}
                  disabled={entering !== null}
                  className="group flex flex-col items-center gap-2 rounded-2xl border border-gold/25 bg-gold/5 px-4 py-5 text-center transition-colors hover:border-gold/50 hover:bg-gold/10 disabled:opacity-60"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <span className="text-sm font-semibold text-foreground">{t(r.titleKey)}</span>
                  <span className="text-[10px] leading-relaxed text-muted-foreground">{t(r.descKey)}</span>
                </motion.button>
              );
            })}
          </div>
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
                transition={{ delay: 0.1 + i * 0.08 }}
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
        <p className="mt-2 font-mono text-[10px] text-muted-foreground/40">
          {appBuildLabel}
        </p>
      </div>
    </main>
  );
}
