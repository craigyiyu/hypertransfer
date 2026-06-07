/**
 * MobileBottomSheet — Mobile-optimized bottom sheet for actions and menus.
 * Slides up from bottom with drag-to-dismiss and safe area support.
 */
import { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "destructive";
  }>;
}

export default function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  actions,
}: MobileBottomSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl max-h-[90vh] overflow-y-auto"
            style={{
              paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
            }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 rounded-full bg-border/50" />
            </div>

            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-secondary rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="px-6 py-4">{children}</div>

            {/* Actions */}
            {actions && actions.length > 0 && (
              <div className="px-6 py-4 border-t border-border/30 space-y-2">
                {actions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      action.onClick();
                      onClose();
                    }}
                    className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
                      action.variant === "destructive"
                        ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                        : "bg-gold/10 text-gold hover:bg-gold/20"
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
