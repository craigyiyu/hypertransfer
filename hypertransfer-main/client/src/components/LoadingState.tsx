import { motion } from 'framer-motion';

interface LoadingStateProps {
  message?: string;
  type?: 'spinner' | 'skeleton' | 'pulse';
}

export function LoadingState({
  message = 'Loading...',
  type = 'spinner',
}: LoadingStateProps) {
  if (type === 'skeleton') {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="h-12 bg-secondary/50 rounded-lg"
          />
        ))}
      </div>
    );
  }

  if (type === 'pulse') {
    return (
      <div className="flex items-center justify-center py-8">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-12 h-12 rounded-full border-2 border-gold/30 border-t-gold"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className="w-10 h-10 border-[3px] border-gold/20 border-t-gold rounded-full"
      />
      {message && (
        <motion.p
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-sm text-muted-foreground"
        >
          {message}
        </motion.p>
      )}
    </div>
  );
}
