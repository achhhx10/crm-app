import React from 'react';
import { Link } from 'react-router-dom';
import { BellRing, FileClock, Flame, Phone, ArrowRight } from 'lucide-react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatCurrency } from '../../lib/utils';

export interface ActionItem {
  kind: 'followup' | 'stale_quote' | 'cold_hot';
  contactId: number;
  businessName: string | null;
  city: string | null;
  phone: string | null;
  ageDays: number;
  label: string;
  amount?: number | null;
  link: string;
}

interface ActionsPanelProps {
  items: ActionItem[];
  thresholds?: { staleQuoteAfterDays: number; coldHotAfterDays: number };
}

const GROUPS = [
  {
    kind: 'followup' as const,
    title: 'Relances dues',
    icon: BellRing,
    tone: 'text-destructive',
    age: (i: ActionItem) => `${i.ageDays} j de retard`,
    empty: 'Aucune relance en attente',
  },
  {
    kind: 'stale_quote' as const,
    title: 'Devis sans réponse',
    icon: FileClock,
    tone: 'text-warning',
    age: (i: ActionItem) => `${i.ageDays} j d'attente`,
    empty: 'Aucun devis en attente',
  },
  {
    kind: 'cold_hot' as const,
    title: 'Prêts à appeler',
    icon: Flame,
    tone: 'text-primary',
    age: (i: ActionItem) => `jamais appelé`,
    empty: 'Tous les prospects chauds ont été contactés',
  },
];

/**
 * What to do now. The dashboard used to open on aggregates, which tell you how
 * the month is going but not what to pick up next. This sits above them.
 */
export function ActionsPanel({ items, thresholds }: ActionsPanelProps) {
  const total = items.length;
  if (total === 0) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2 p-5 pb-3">
        <div>
          <h2 className="text-lg font-semibold">À faire aujourd&apos;hui</h2>
          <p className="text-sm text-muted-foreground">
            {total} action{total > 1 ? 's' : ''} qui rentrent dans tes critères
            {thresholds && ` (rappel après ${thresholds.coldHotAfterDays} j sans contact, devis après ${thresholds.staleQuoteAfterDays} j)`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-border bg-border md:grid-cols-3">
        {GROUPS.map(group => {
          const groupItems = items.filter(i => i.kind === group.kind).slice(0, 5);
          const Icon = group.icon;
          return (
            <div key={group.kind} className="bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${group.tone}`} />
                <span className="text-sm font-medium">{group.title}</span>
                <Badge variant="secondary" className="ml-auto">{groupItems.length}</Badge>
              </div>

              {groupItems.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">{group.empty}</p>
              ) : (
                <ul className="space-y-1">
                  {groupItems.map(item => (
                    <li key={`${item.kind}-${item.contactId}`}>
                      <Link
                        to={item.link}
                        className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            {item.businessName || `#${item.contactId}`}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {group.age(item)}
                            {item.amount ? ` · ${formatCurrency(item.amount)}` : ''}
                            {item.city ? ` · ${item.city}` : ''}
                          </p>
                        </div>
                        {item.phone && (
                          <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                        )}
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}