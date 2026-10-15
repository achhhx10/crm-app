import React, { useMemo } from 'react';
import { cn } from '../../lib/utils';

export interface DateRange {
  from: string; // yyyy-mm-dd
  to: string;   // yyyy-mm-dd
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function rangeForPreset(preset: string, now = new Date()): DateRange {
  switch (preset) {
    case 'today':
      return { from: iso(now), to: iso(now) };
    case '7d':
      return { from: iso(addDays(now, -6)), to: iso(now) };
    case '30d':
      return { from: iso(addDays(now, -29)), to: iso(now) };
    case 'quarter': {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { from: iso(qStart), to: iso(now) };
    }
    case 'year':
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    case 'all':
      return { from: '', to: '' };
    case 'month':
    default:
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  }
}

export const RANGE_PRESETS: { id: string; label: string }[] = [
  { id: 'today', label: "Aujourd'hui" },
  { id: '7d', label: '7 jours' },
  { id: 'month', label: 'Ce mois' },
  { id: '30d', label: '30 jours' },
  { id: 'quarter', label: 'Ce trimestre' },
  { id: 'year', label: 'Cette année' },
  { id: 'all', label: 'Tout' },
];

interface DateRangePickerProps {
  value: DateRange;
  preset: string;
  onChange: (range: DateRange, preset: string) => void;
  className?: string;
}

/**
 * Reporting period control. Every aggregate used to be "all time" or a rolling
 * 30 days while the UI said "ce mois", so the picker makes the counted window
 * explicit and shareable through the URL.
 */
export function DateRangePicker({ value, preset, onChange, className = '' }: DateRangePickerProps) {
  const today = useMemo(() => iso(new Date()), []);

  const inputClass = cn('h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring');

  return (
    <div className={cn('flex flex-wrap items-end gap-2', className)}>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Période">
        {RANGE_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(rangeForPreset(p.id), p.id)}
            aria-pressed={preset === p.id}
            className={`min-h-[40px] rounded-md px-3 py-2 text-sm transition-colors ${
              preset === p.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="range-from" className="block text-xs text-muted-foreground">Du</label>
            <input
              id="range-from"
              type="date"
              value={value.from}
              max={value.to || today}
              onChange={e => onChange({ ...value, from: e.target.value }, 'custom')}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="range-to" className="block text-xs text-muted-foreground">Au</label>
            <input
              id="range-to"
              type="date"
              value={value.to}
              min={value.from || undefined}
              max={today}
              onChange={e => onChange({ ...value, to: e.target.value }, 'custom')}
              className={inputClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}
