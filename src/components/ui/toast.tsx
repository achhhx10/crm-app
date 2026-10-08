import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const typeConfig: Record<ToastType, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  success: { className: 'bg-success', icon: CheckCircle2 },
  error: { className: 'bg-destructive', icon: XCircle },
  info: { className: 'bg-primary', icon: Info },
};

let nextId = 0;
const TOAST_DURATION = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    setProgress((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId++;
      setToasts((prev) => {
        const next = [...prev, { id, message, type }];
        return next.length > 3 ? next.slice(-3) : next;
      });

      const interval = setInterval(() => {
        setProgress((prev) => {
          const current = prev[id] ?? 0;
          const increment = 5;
          if (current >= 100) {
            clearInterval(interval);
            dismiss(id);
            return prev;
          }
          return { ...prev, [id]: current + increment };
        });
      }, TOAST_DURATION / 20);

      setTimeout(() => {
        clearInterval(interval);
        dismiss(id);
      }, TOAST_DURATION);

      return () => clearInterval(interval);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((t) => {
            const config = typeConfig[t.type];
            const Icon = config.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg px-4 py-3 text-sm text-white shadow-lg ${config.className}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  className="rounded p-0.5 text-white/80 transition-colors hover:text-white"
                  aria-label="Fermer la notification"
                >
                  <X className="h-4 w-4" />
                </button>
                <motion.div
                  className="absolute bottom-0 left-0 h-0.5 bg-white/40"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress[t.id] ?? 0}%` }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}