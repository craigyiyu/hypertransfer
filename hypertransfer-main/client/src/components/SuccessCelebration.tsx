import { motion } from 'framer-motion';
import { CheckCircle, Sparkles } from 'lucide-react';

interface SuccessCelebrationProps {
  title: string;
  message: string;
  amount?: string;
  nextStep?: string;
}

export function SuccessCelebration({
  title,
  message,
  amount,
  nextStep,
}: SuccessCelebrationProps) {
  // Confetti particles
  const confetti = Array.from({ length: 12 }).map((_, i) => ({
    id: i,
    delay: Math.random() * 0.3,
    duration: 2 + Math.random() * 1,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 15, stiffness: 100 }}
      className="relative card-gold rounded-xl p-8 text-center space-y-4 overflow-hidden"
    >
      {/* Confetti Animation */}
      {confetti.map((c) => (
        <motion.div
          key={c.id}
          initial={{ opacity: 1, y: -20, x: 0 }}
          animate={{
            opacity: 0,
            y: 100,
            x: Math.cos(c.id) * 100,
            rotate: 360,
          }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            ease: 'easeOut',
          }}
          className="absolute w-2 h-2 bg-gold-400 rounded-full pointer-events-none"
          style={{
            left: `${Math.random() * 100}%`,
            top: '-10px',
          }}
        />
      ))}

      {/* Success Icon */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="flex justify-center"
      >
        <div className="relative">
          <CheckCircle className="w-16 h-16 text-gold-400" />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity, delay: 0.3 }}
            className="absolute inset-0 rounded-full border-2 border-gold-400 opacity-0"
          />
        </div>
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-2"
      >
        <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
          {title}
          <Sparkles className="w-5 h-5 text-gold-400" />
        </h2>
        <p className="text-slate-300">{message}</p>

        {amount && (
          <motion.p
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-3xl font-bold text-gold-400"
          >
            {amount}
          </motion.p>
        )}

        {nextStep && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-sm text-slate-400 pt-2"
          >
            {nextStep}
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
}
