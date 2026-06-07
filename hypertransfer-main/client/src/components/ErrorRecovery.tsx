import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Mail } from 'lucide-react';

interface ErrorRecoveryProps {
  title: string;
  message: string;
  errorCode?: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  }>;
  supportLink?: boolean;
}

export function ErrorRecovery({
  title,
  message,
  errorCode,
  actions,
  supportLink = true,
}: ErrorRecoveryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card-wine rounded-xl p-6 space-y-4"
    >
      <div className="flex items-start gap-4">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-12 h-12 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0"
        >
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </motion.div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
          <p className="text-sm text-slate-300 mb-3">{message}</p>

          {errorCode && (
            <p className="text-xs text-slate-500 font-mono mb-4">
              Error Code: {errorCode}
            </p>
          )}

          {/* Action Buttons */}
          {actions && actions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {actions.map((action, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  onClick={action.onClick}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    action.variant === 'primary'
                      ? 'bg-gold-500 hover:bg-gold-600 text-black'
                      : 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 border border-slate-700/50'
                  }`}
                >
                  {action.label}
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              ))}
            </div>
          )}

          {/* Support Links */}
          {supportLink && (
            <div className="pt-4 border-t border-slate-700/50 space-y-2">
              <p className="text-xs text-slate-400 mb-2">Need help?</p>
              <div className="flex gap-2">
                <a
                  href="mailto:support@hypertransfer.io"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 text-xs transition-colors"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Contact Support
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
