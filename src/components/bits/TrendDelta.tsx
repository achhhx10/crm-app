import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TrendDeltaProps {
  /** Percentage change. Null means "no baseline to compare against". */
  value: number | null | undefined;
  /** Growth is good for revenue, bad for bounce rate: invert when needed. */
  invert?: boolean;
  suffix?: string;
  className?: string;
}

/**
 * Trend arrow. A null delta is shown as a dash rather than 0%: going from zero
 * to something is not a 0% change, and reporting it as one is a quiet lie.
 */
export function TrendDelta({ value, invert = false, suffix = '%', className }: TrendDeltaProps) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
        <Minus className="h-3 w-3" aria-hidden />
        <span title="Pas de base de comparaison sur la période précédente">n/d</span>
      </span>
    );
  }

  const rounded = Math.round(value);
  const flat = rounded === 0;
  const up = rounded > 0;
  const good = invert ? !up : up;

  const tone = flat
    ? 'text-muted-foreground'
    : good ? 'text-success neon' : 'text-destructive neon';

  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium tabular-nums', tone, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {rounded > 0 ? '+' : ''}{rounded}{suffix}
    </span>
  );
}
