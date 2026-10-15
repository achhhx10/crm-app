/**
 * Shared reporting period.
 *
 * Every aggregate used to be hardcoded to "all time" or "last 30 days" while the
 * UI labelled it "ce mois". Reports now take an explicit from/to, default to the
 * current calendar month, and echo the effective range back so the screen can
 * show exactly what was counted.
 */
export interface ReportRange {
  from: Date;
  to: Date;
  /** ISO yyyy-mm-dd, for echoing to the client. */
  fromISO: string;
  toISO: string;
  label: string;
  days: number;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** Parse "yyyy-mm-dd" as a local calendar date, not a UTC instant. */
function parseDateInput(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isValid(date) ? date : null;
}

export function resolveRange(query: Record<string, unknown>, now = new Date()): ReportRange {
  const fromInput = parseDateInput(query.from);
  const toInput = parseDateInput(query.to);

  // Default: the current calendar month, which is what "Ce mois" claims to be.
  const from = fromInput ?? new Date(now.getFullYear(), now.getMonth(), 1);
  // Inclusive end of the requested day.
  const to = toInput ? new Date(toInput.getFullYear(), toInput.getMonth(), toInput.getDate(), 23, 59, 59, 999) : now;

  if (from > to) {
    const swapped = new Date(from);
    from.setTime(to.getTime());
    to.setTime(swapped.getTime());
  }

  const days = Math.max(1, Math.round((to.getTime() - startOfDay(from).getTime()) / 86400000) + 1);
  return {
    from,
    to,
    fromISO: toISODate(from),
    toISO: toISODate(to),
    days,
    label: `${toISODate(from)} → ${toISODate(to)}`,
  };
}

/**
 * The period immediately before `range`, of the same length. Comparing a month
 * to "the last 30 days" is how the dashboard ended up labelling a rolling
 * window as "ce mois" in the first place.
 */
export function previousRange(range: ReportRange): ReportRange {
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - (range.days - 1) * 86400000);
  return {
    from,
    to,
    fromISO: toISODate(from),
    toISO: toISODate(to),
    days: range.days,
    label: `${toISODate(from)} → ${toISODate(to)}`,
  };
}

/**
 * Percentage change between two values, or null when there is no baseline.
 * A growth out of zero is not an infinite percentage, so it is reported as null
 * rather than a fabricated number.
 */
export function trend(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
