/**
 * DemoModeToggle — Floating button for enabling/disabling demo mode.
 * Appears in the bottom-right corner and shows current demo status.
 */
import { useDemoMode } from "@/contexts/DemoModeContext";
import { Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function DemoModeToggle() {
  const { isDemoMode, toggleDemoMode } = useDemoMode();

  return (
    <motion.button
      onClick={toggleDemoMode}
      className={`
        fixed bottom-6 right-6 z-40
        w-14 h-14 rounded-full
        flex items-center justify-center
        font-semibold text-sm
        transition-all duration-300
        shadow-lg hover:shadow-xl
        ${
          isDemoMode
            ? "bg-gold text-background hover:bg-gold-bright"
            : "bg-secondary text-foreground hover:bg-secondary/80"
        }
      `}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      title={isDemoMode ? "Demo Mode: ON" : "Demo Mode: OFF"}
    >
      <Zap className="w-5 h-5" />
    </motion.button>
  );
}
