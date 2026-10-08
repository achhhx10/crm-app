import { ReactNode, useEffect } from 'react';
import { twMerge } from 'tailwind-merge';

export function Button({ children, className, variant = 'primary', ...props }: any) {
  const styles =
    variant === 'primary'
      ? 'bg-primary text-primary-foreground active:opacity-90'
      : variant === 'danger'
        ? 'bg-destructive text-destructive-foreground active:opacity-90'
        : variant === 'ghost'
          ? 'text-muted-foreground active:bg-muted'
          : 'bg-card text-foreground border border-border active:bg-muted';
  return (
    <button
      className={twMerge(
        'min-h-[48px] px-5 rounded-xl text-[16px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50',
        styles,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: any) {
  return (
    <input
      {...props}
      className={twMerge(
        'w-full min-h-[48px] px-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary',
        props.className
      )}
    />
  );
}

export function Select({ children, ...props }: any) {
  return (
    <select
      {...props}
      className={twMerge(
        'w-full min-h-[48px] px-4 rounded-xl bg-card border border-border text-foreground outline-none focus:border-primary',
        props.className
      )}
    >
      {children}
    </select>
  );
}

export function Textarea(props: any) {
  return (
    <textarea
      {...props}
      className={twMerge(
        'w-full min-h-[96px] p-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary',
        props.className
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={twMerge('bg-card border border-border rounded-2xl p-4', className)}>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const STAGE_LABELS: Record<string, string> = {
  identifie: 'Identifié',
  contacte: 'Contacté',
  interesse: 'Intéressé',
  rdv_programme: 'RDV programmé',
  proposition_envoyee: 'Proposition envoyée',
  signe: 'Signé',
  perdu: 'Perdu',
};

export const STAGES = Object.keys(STAGE_LABELS);

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] || stage;
}

export function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    identifie: 'bg-muted text-muted-foreground',
    contacte: 'bg-primary/15 text-primary',
    interesse: 'bg-primary/15 text-primary',
    rdv_programme: 'bg-primary/15 text-primary',
    proposition_envoyee: 'bg-primary/15 text-primary',
    signe: 'bg-green-500/15 text-green-600 dark:text-green-400',
    perdu: 'bg-destructive/10 text-destructive',
  };
  return (
    <span className={twMerge('px-2.5 py-1 rounded-full text-[12px] font-semibold whitespace-nowrap', colors[stage] || colors.identifie)}>
      {stageLabel(stage)}
    </span>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-6">
      <div className="text-muted-foreground mb-3">{icon}</div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-[14px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-h-[88dvh] overflow-y-auto bg-background rounded-t-3xl p-5 pb-8 safe-bottom">
        <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
        <h2 className="text-[18px] font-bold mb-4 pr-8">{title}</h2>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-muted-foreground text-[20px]"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
