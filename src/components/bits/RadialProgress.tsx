import React from 'react';
import { cn } from '../../lib/utils';

interface RadialProgressProps {
  /** 0-100. Values outside are clamped rather than trusted. */
  value: number;
  size?: number;
  thickness?: number;
  label?: React.ReactNode;
  caption?: React.ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'destructive';
  className?: string;
}

const TONE: Record<string, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

/**
 * Minimal luminous ring. The arc is the only bright element; the track stays
 * quiet so a row of gauges does not read as a wall of colour.
 */
export function RadialProgress({
  value,
  size = 108,
  thickness = 2.5,
  label,
  caption,
  tone = 'primary',
  className,
}: RadialProgressProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={typeof label === 'string' ? label : `${pct}%`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            className="stroke-border"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
            className={cn('stroke-current transition-[stroke-dashoffset] duration-700 neon', TONE[tone])}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-semibold tabular-nums">{Math.round(pct)}%</span>
          {caption && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{caption}</span>}
        </div>
      </div>
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}
