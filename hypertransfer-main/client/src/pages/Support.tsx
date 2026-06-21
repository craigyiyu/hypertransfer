/**
 * Support — Help and contact page. User can reach HyperTransfer Support.
 */
import { useState } from "react";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { MessageCircle, Phone, HelpCircle } from "lucide-react";
import { toast } from "sonner";

export default function Support() {
  const { state } = useDemo();
  const [contactForm, setContactForm] = useState({ subject: "", message: "" });

  const handleAction = (label: string) => {
    toast.info(`${label} — Feature coming soon`);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Message sent! We'll respond within 24 hours.");
    setContactForm({ subject: "", message: "" });
  };

  return (
    <Shell showBack backTo="/dashboard" title="Support" subtitle="Get help with your account or deposits">
      <div className="space-y-4">
        {/* Support contact */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-gold rounded-xl p-4 space-y-3"
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">HyperTransfer Support</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center text-gold font-semibold text-sm">
              HT
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Support Team</p>
              <p className="text-xs text-muted-foreground">Available 9am–6pm HKT</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleAction("Chat Bot")}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border hover:border-gold/30 text-xs text-muted-foreground hover:text-gold transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Chat Bot
            </button>
            <button
              onClick={() => handleAction("Call")}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border hover:border-gold/30 text-xs text-muted-foreground hover:text-gold transition-all"
            >
              <Phone className="w-3.5 h-3.5" /> Call
            </button>
          </div>
        </motion.div>

        {/* FAQ */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Common Questions</p>
          {[
            { q: "How long does a deposit take?", a: "Most deposits are confirmed within 5-30 minutes depending on the network." },
            { q: "How long does KYC verification take?", a: "KYC review is usually completed within 24 hours. You can continue using your account while the review is in progress, but deposits may remain locked until approval." },
            { q: "What if my verification transfer fails?", a: "Verify the address and network, then retry. Contact HyperTransfer Support if the issue persists." },
            { q: "Which assets and networks are supported?", a: "Phase 1 supports USDT on ERC-20/TRC-20 and USDC on ERC-20. BTC and ETH assets are not supported." },
            { q: "How do refunds work?", a: "Open a refund request from a completed deposit, confirm a refund wallet on the same supported network, and wait for destination-wallet KYT plus treasury approval before payout." },
            { q: "Is my data secure?", a: "All data is encrypted with 256-bit SSL. Your personal information is used solely for regulatory compliance and is never shared for marketing purposes." },
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
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Send us a message</p>
          <form onSubmit={handleContactSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Subject</label>
              <input
                type="text"
                value={contactForm.subject}
                onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                placeholder="e.g., Issue with deposit"
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-gold-400/50"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Message</label>
              <textarea
                value={contactForm.message}
                onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                placeholder="Describe your issue..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-gold-400/50 resize-none"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full btn-gold rounded-xl py-3 text-sm font-semibold"
            >
              Send Message
            </button>
          </form>
        </motion.div>
      </div>
    </Shell>
  );
}
