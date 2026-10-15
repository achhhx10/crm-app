import React from 'react';
import { cn } from '../../lib/utils';

interface MicroBarProps {
  /** 0-100 relative to `max` (or an absolute percentage when max is omitted). */
  value: number;
  max?: number;
  tone?: 'primary' | 'info' | 'success' | 'warning' | 'destructive' | 'muted';
  className?: string;
  showLabel?: boolean;
}

const TONE: Record<string, string> = {
  primary: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  muted: 'bg-muted-foreground/40',
};

/**
 * Inline magnitude bar for table cells. A minimum width keeps a non-zero value
 * visible at this size instead of rounding to nothing.
 */
export function MicroBar({ value, max, tone = 'primary', className, showLabel = false }: MicroBarProps) {
  const raw = Number.isFinite(value) ? value : 0;
  const ratio = max && max > 0 ? Math.max(0, Math.min(1, raw / max)) : Math.max(0, Math.min(1, raw / 100));
  const pct = ratio * 100;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 min-w-[40px] flex-1 overflow-hidden rounded-full bg-muted/60"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', TONE[tone])}
          style={{ width: raw > 0 ? `${Math.max(pct, 3)}%` : '0%' }}
        />
      </div>
      {showLabel && <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{raw}</span>}
    </div>
  );
}
