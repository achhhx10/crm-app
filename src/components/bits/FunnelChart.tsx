import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FunnelStep {
  key: string;
  label: string;
  value: number;
  /** Percentage of the previous step, or null for the first one. */
  conversionFromPrevious: number | null;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  note?: string;
}

/**
 * Funnel bars are scaled against the previous step, not the first.
 *
 * With tens of thousands of prospects and a handful of signatures, bars sized
 * relative to the top would render every later stage at a pixel wide and hide the
 * one number that matters: where the drop happens. Relative widths keep the
 * whole funnel readable, and the absolute values stay on screen.
 */
export function FunnelChart({ steps, note }: FunnelChartProps) {
  const max = Math.max(...steps.map(s => s.value), 1);

  return (
    <div className="space-y-1">
      {steps.map((step, index) => {
        const previous = index > 0 ? steps[index - 1].value : null;
        // Relative width: share of the previous step, with the absolute scale as
        // a fallback for the first step so it never renders as a sliver.
        const ratio = previous && previous > 0
          ? Math.max(0, Math.min(1, step.value / previous))
          : Math.max(0, Math.min(1, step.value / max));
        const shareOfMax = max > 0 ? Math.round((step.value / max) * 100) : 0;

        return (
          <div key={step.key}>
            {index > 0 && (
              <div className="flex items-center gap-2 py-1 pl-1 text-xs text-muted-foreground">
                <ChevronDown className="h-3 w-3" aria-hidden />
                {step.conversionFromPrevious !== null ? (
                  <span className="tabular-nums">
                    {/* 4 contacted out of 39254 is 0.01%: rounding it to "0 %"
                        reads as "nobody", so anything under 1 % is shown as such. */}
                    {step.conversionFromPrevious > 0 && step.conversionFromPrevious < 1
                      ? '<1 %'
                      : `${Math.round(step.conversionFromPrevious)} %`}{' '}
                    des {steps[index - 1].label.toLowerCase()}
                  </span>
                ) : (
                  <span>—</span>
                )}
                <span className="ml-auto tabular-nums text-muted-foreground/70">
                  {shareOfMax}% du total
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-sm">{step.label}</span>
              <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-muted/40">
                <div
                  className={cn(
                    'flex h-full items-center justify-end rounded-lg px-3 transition-[width] duration-700',
                    index === steps.length - 1 ? 'bg-success/80 neon' : 'bg-primary/70',
                  )}
                  style={{ width: `${Math.max(ratio * 100, step.value > 0 ? 6 : 0)}%` }}
                >
                  <span className="font-mono text-sm font-semibold tabular-nums text-primary-foreground">
                    {step.value.toLocaleString('fr-FR')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {note && <p className="pt-3 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
