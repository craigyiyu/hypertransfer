/**
 * Support — Help and contact page. User can reach HyperTransfer Support.
 */
import { useState } from "react";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { MessageCircle, Phone, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";

export default function Support() {
  const { t } = useI18n();
  const { state } = useDemo();
  const [contactForm, setContactForm] = useState({ subject: "", message: "" });

  const handleAction = (label: string) => {
    toast.info(`${label} — Feature coming soon`);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(t("support.messageSent"));
    setContactForm({ subject: "", message: "" });
  };

  return (
    <Shell showBack backTo="/dashboard" title={t("support.title")} subtitle={t("support.subtitle")}>
      <div className="space-y-4">
        {/* Support contact */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-gold rounded-xl p-4 space-y-3"
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("support.title")}</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center text-gold font-semibold text-sm">
              HT
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t("support.supportTeam")}</p>
              <p className="text-xs text-muted-foreground">Available 9am–6pm HKT</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleAction(t("support.chatBot"))}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border hover:border-gold/30 text-xs text-muted-foreground hover:text-gold transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" /> {t("support.chatBot")}
            </button>
            <button
              onClick={() => handleAction(t("support.call"))}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border hover:border-gold/30 text-xs text-muted-foreground hover:text-gold transition-all"
            >
              <Phone className="w-3.5 h-3.5" /> {t("support.call")}
            </button>
          </div>
        </motion.div>

        {/* FAQ */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("support.commonQuestions")}</p>
          {[
            {
              q: t("support.faq.depositTime"),
              a: t("support.faq.depositTimeAnswer"),
            },
            {
              q: t("support.faq.kycTime"),
              a: t("support.faq.kycTimeAnswer"),
            },
            {
              q: t("support.faq.verificationFail"),
              a: "Verify the address and network, then retry. Contact HyperTransfer Support if the issue persists.",
            },
            {
              q: t("support.faq.assetsNetworks"),
              a: "Phase 1 supports USDT on ERC-20/TRC-20 only. USDC, BTC and ETH are not supported in this phase.",
            },
            {
              q: t("support.faq.withdrawals"),
              a: "Open a withdrawal request, choose a previously verified wallet on the same supported network, and wait for wallet KYT plus treasury approval before payout.",
            },
            {
              q: t("support.faq.dataSecure"),
              a: "All data is encrypted with 256-bit SSL. Your personal information is used solely for regulatory compliance and is never shared for marketing purposes.",
            },
          ].map((faq, i) => (
            <motion.details
              key={i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card-gold rounded-xl group"
            >
              <summary className="px-4 py-3 flex items-center gap-3 text-sm text-foreground cursor-pointer list-none">
                <HelpCircle className="w-4 h-4 text-gold shrink-0" />
                <span className="flex-1">{faq.q}</span>
              </summary>
              <div className="px-4 pb-3 pl-11">
                <p className="text-xs text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            </motion.details>
          ))}
        </div>

        {/* Contact Form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card-wine rounded-xl p-4 space-y-3"
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{t("support.sendMessage")}</p>
          <form onSubmit={handleContactSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">{t("support.subject")}</label>
              <input
                type="text"
                value={contactForm.subject}
                onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                placeholder={t("support.subjectPlaceholder")}
                className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-gold-400/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">{t("support.message")}</label>
              <textarea
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                placeholder={t("support.describeIssue")}
                rows={3}
                className="w-full px-3 py-2 bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-gold-400/50 resize-none"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full btn-gold rounded-xl py-3 text-sm font-semibold"
            >
              {t("support.send")}
            </button>
          </form>
        </motion.div>
      </div>
    </Shell>
  );
}
