import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * The API serialises Postgres timestamps as ISO strings, while some legacy rows
 * and payloads use epoch seconds. Accept both so dates never render as
 * "Invalid Date".
 */
type DateLike = number | string | Date | null | undefined;

function toDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // Heuristic: values below ~1e11 are epoch seconds, above are milliseconds.
    const ms = value < 1e11 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: DateLike): string {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(value: DateLike): string {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}min ${secs}s`;
}

export function formatCurrency(amount: number | null): string {
  if (!amount) return '0 €';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export const STAGES: Record<string, { label: string; color: string }> = {
  identifie: { label: 'Identifié', color: 'bg-stage-1 text-stage-1-foreground' },
  contacte: { label: 'Contacté', color: 'bg-stage-2 text-stage-2-foreground' },
  interesse: { label: 'Intéressé', color: 'bg-stage-3 text-stage-3-foreground' },
  rdv_programme: { label: 'RDV Programmé', color: 'bg-stage-4 text-stage-4-foreground' },
  proposition_envoyee: { label: 'Proposition Envoyée', color: 'bg-stage-5 text-stage-5-foreground' },
  signe: { label: 'Signé', color: 'bg-stage-6 text-stage-6-foreground' },
  perdu: { label: 'Perdu', color: 'bg-stage-7 text-stage-7-foreground' },
};

export const CALL_RESULTS: Record<string, string> = {
  pas_decroche: 'Pas décroché',
  messagerie: 'Messagerie',
  pas_interesse: 'Pas intéressé',
  interesse: 'Intéressé',
  rdv_obtenu: 'RDV obtenu',
};

export const SITE_STATUSES: Record<string, string> = {
  pas_de_site: 'Pas de site',
  site_vetuste: 'Site vétuste',
  site_fonctionnel: 'Site fonctionnel',
};

export const OBJECTIONS: Record<string, string> = {
  pas_de_temps: 'Pas le temps',
  deja_equippe: 'Déjà équipé',
  trop_cher: 'Trop cher',
  envoyer_email: 'Envoyer un email',
  faut_en_parler: 'Faut en parler à un associé',
  pas_interesse: 'Pas intéressé',
  autre: 'Autre',
};

/** Detected business language. Heuristic: what the company publishes, not what it speaks. */
export const LANGUAGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  de: { label: 'Allemand', variant: 'default' },
  fr: { label: 'Français', variant: 'secondary' },
  it: { label: 'Italien', variant: 'secondary' },
  en: { label: 'Anglais', variant: 'outline' },
};

export function opportunityScore(c: { hasSite?: string | null; phone?: string | null; googleRating?: number | null; googleReviews?: number | null }): number {
  let score = 0;
  if (c.hasSite === 'pas_de_site' || c.hasSite === 'non') score += 2;
  if (c.phone) score += 2;
  if (c.googleRating != null && c.googleRating >= 4.5) score += 1;
  if (c.googleReviews != null && c.googleReviews >= 20) score += 1;
  return score;
}

export function opportunityMeta(score: number): { label: string; variant: 'destructive' | 'warning' | 'secondary' | 'outline' } {
  if (score >= 6) return { label: 'Prioritaire', variant: 'destructive' };
  if (score >= 4) return { label: 'Bonne cible', variant: 'warning' };
  if (score >= 2) return { label: 'Moyenne', variant: 'secondary' };
  return { label: 'Faible', variant: 'outline' };
}
