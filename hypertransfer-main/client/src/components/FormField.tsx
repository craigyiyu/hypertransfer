/**
 * FormField — Reusable form field component with validation feedback.
 * Handles input, error display, and success states.
 */
import { InputHTMLAttributes, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  success?: boolean;
  hint?: string;
  icon?: ReactNode;
  required?: boolean;
}

export default function FormField({
  label,
  error,
  success,
  hint,
  icon,
  required,
  className = "",
  ...props
}: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>

      <div className="relative">
        <input
          {...props}
          className={`w-full px-4 py-3 rounded-lg bg-secondary/50 border transition-all text-sm
            ${error ? "border-destructive/50 focus:border-destructive" : success ? "border-success/50 focus:border-success" : "border-border/50 focus:border-gold/50"}
            ${icon ? "pl-10" : ""}
            focus:outline-none focus:ring-1 focus:ring-offset-0
            ${error ? "focus:ring-destructive/30" : success ? "focus:ring-success/30" : "focus:ring-gold/30"}
            placeholder:text-muted-foreground/40
            ${className}
          `}
        />

        {/* Icon */}
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50">
            {icon}
          </div>
        )}

        {/* Success indicator */}
        {success && !error && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircle2 className="w-4 h-4 text-success" />
          </div>
        )}

        {/* Error indicator */}
        {error && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <AlertCircle className="w-4 h-4 text-destructive" />
          </div>
        )}
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-destructive flex items-center gap-1"
          >
            <AlertCircle className="w-3 h-3" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Hint message */}
      {hint && !error && (
        <p className="text-xs text-muted-foreground/60">{hint}</p>
      )}
    </div>
  );
}
