/**
 * Support — Help and contact page. Patron can reach their host or support team.
 */
import { useDemo } from "@/contexts/DemoContext";
import Shell from "@/components/Shell";
import { motion } from "framer-motion";
import { MessageCircle, Phone, Mail, HelpCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function Support() {
  const { state } = useDemo();

  const handleAction = (label: string) => {
    toast.info(`${label} — Feature coming soon`);
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

        {/* Contact support */}
        <button
          onClick={() => handleAction("Email support")}
          className="w-full card-wine rounded-xl px-4 py-3 flex items-center gap-3 hover:border-gold/20 transition-all"
        >
          <Mail className="w-4 h-4 text-gold" />
          <div className="flex-1 text-left">
            <p className="text-sm text-foreground">Email Support</p>
            <p className="text-[10px] text-muted-foreground">support@hypertransfer.com</p>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </Shell>
  );
}
