/**
 * PendingApproval — 邀请认领后的"待批准"中间页(认领 → 待批准 → 开始 KYC)。
 * 演示叙事: VIP 通过邀请链接 + 邮箱 OTP 拿到账号后, 先看到干净的待批准状态,
 * 再从本页开始 KYC。纯前端步骤, 不改变后端状态机。
 */
import { useLocation } from "@/lib/wouter";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { ShieldCheck, ArrowRight, Clock, MailCheck } from "lucide-react";

export default function PendingApproval() {
  const [, navigate] = useLocation();

  return (
    <Shell
      title="Account created"
      subtitle="Approval pending"
      showBack={false}
    >
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-gold rounded-xl p-6 flex flex-col items-center text-center space-y-4"
        >
          <div className="w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center">
            <MailCheck className="w-7 h-7 text-gold" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Your account has been created
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            Welcome aboard. Your account is pending approval — our team is reviewing
            your details before services are enabled.
          </p>
          <div className="w-full rounded-lg bg-secondary/20 px-4 py-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning shrink-0" />
            <p className="text-[11px] text-muted-foreground text-left">
              Approval status: <span className="text-warning font-semibold">pending</span>. You
              will be notified once your account is approved.
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-wine rounded-xl p-5 space-y-3 border-success/30"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Get a head start with KYC
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                You can complete your identity verification now so your account is
                ready the moment approval comes through.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/kyc")}
            className="w-full btn-gold rounded-xl py-4 text-sm font-semibold flex items-center justify-center gap-2"
          >
            Start KYC
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-center text-[10px] text-muted-foreground/70">
            Identity checks take only a few minutes.
          </p>
        </motion.div>
      </div>
    </Shell>
  );
}
