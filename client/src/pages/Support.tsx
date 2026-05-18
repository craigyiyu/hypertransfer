/**
 * Support — Help and contact page. Patron can reach their host or support team.
 */
import { useState } from "react";
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { MessageCircle, Phone, Mail, HelpCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function Support() {
  const { state } = useDemo();
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
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
        {/* Host contact */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-gold rounded-xl p-4 space-y-3"
        >
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Your Host</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center text-gold font-semibold text-sm">
              MC
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{state.hostName}</p>
              <p className="text-xs text-muted-foreground font-mono">{state.hostCode}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleAction("Chat")}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border hover:border-gold/30 text-xs text-muted-foreground hover:text-gold transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Chat
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
            { q: "What if my test payment fails?", a: "Verify the address and network, then retry. Contact your host if the issue persists." },
            { q: "Which networks are supported?", a: "We support all major networks including Ethereum, Tron, BSC, Polygon, Solana, and more." },
            { q: "Is my data secure?", a: "All data is encrypted with 256-bit SSL and stored with our licensed custodian partner." },
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

        {/* Contact Methods */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Contact Us</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <motion.button
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => handleAction("Live Chat")}
              className="card-gold rounded-xl px-4 py-3 flex flex-col items-center gap-2 hover:border-gold/30 transition-all"
            >
              <MessageCircle className="w-5 h-5 text-gold" />
              <span className="text-xs font-medium text-foreground">Live Chat</span>
              <span className="text-[10px] text-muted-foreground">9am-6pm HKT</span>
            </motion.button>
            <motion.button
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              onClick={() => (window.location.href = "tel:+85212345678")}
              className="card-gold rounded-xl px-4 py-3 flex flex-col items-center gap-2 hover:border-gold/30 transition-all"
            >
              <Phone className="w-5 h-5 text-gold" />
              <span className="text-xs font-medium text-foreground">Phone</span>
              <span className="text-[10px] text-muted-foreground">+852 1234 5678</span>
            </motion.button>
            <motion.button
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onClick={() => (window.location.href = "mailto:support@hypertransfer.io")}
              className="card-gold rounded-xl px-4 py-3 flex flex-col items-center gap-2 hover:border-gold/30 transition-all"
            >
              <Mail className="w-5 h-5 text-gold" />
              <span className="text-xs font-medium text-foreground">Email</span>
              <span className="text-[10px] text-muted-foreground">support@hypertransfer.io</span>
            </motion.button>
          </div>
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
              className="w-full bg-gold-500 hover:bg-gold-600 text-black text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Send Message
            </button>
          </form>
        </motion.div>
      </div>
    </Shell>
  );
}
