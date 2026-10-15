import { db } from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';
import {
  followUpsQuery, staleQuotesQuery, coldHotQuery,
  HOT_PHONE_AFTER_DAYS, STALE_QUOTE_AFTER_DAYS,
} from './actionQueries.js';

export { HOT_PHONE_AFTER_DAYS, STALE_QUOTE_AFTER_DAYS } from './actionQueries.js';

export type ActionKind = 'followup' | 'stale_quote' | 'cold_hot';

export interface ActionItem {
  kind: ActionKind;
  contactId: number;
  businessName: string | null;
  city: string | null;
  phone: string | null;
  /** Days overdue / waiting, or days since the last call for a cold hot lead. */
  ageDays: number;
  label: string;
  amount?: number | null;
  link: string;
}

export async function dueActions(req: AuthRequest): Promise<ActionItem[]> {
  const userId = req.user!.userId;
  const isAdmin = req.user?.role === 'admin';

  const safe = async (label: string, template: any) => {
    try {
      return await db.execute(template);
    } catch (err: any) {
      console.error(`actions: ${label} indisponibles:`, err.message, '| position', err.position, '| near', err.where);
      return { rows: [] as any[] };
    }
  };

  const followups = await safe('relances dues', followUpsQuery(userId, isAdmin));
  const staleQuotes = await safe('devis sans réponse', staleQuotesQuery(userId, isAdmin));
  const coldHot = await safe('prêts à appeler', coldHotQuery(userId, isAdmin));

  const items: ActionItem[] = [];

  for (const r of followups.rows as any[]) {
    if (!r.contactId) continue;
    items.push({
      kind: 'followup',
      contactId: r.contactId,
      businessName: r.businessName,
      city: r.city,
      phone: r.phone,
      ageDays: Math.round(Number(r.age) || 0),
      label: r.nextStep || 'Rappeler',
      link: `/contacts/${r.contactId}`,
    });
  }

  for (const r of staleQuotes.rows as any[]) {
    if (!r.contactId) continue;
    items.push({
      kind: 'stale_quote',
      contactId: r.contactId,
      businessName: r.businessName,
      city: r.city,
      phone: r.phone,
      ageDays: Math.round(Number(r.age) || 0),
      label: 'Devis sans réponse',
      amount: Number(r.amount) || 0,
      link: `/contacts/${r.contactId}`,
    });
  }

  for (const r of coldHot.rows as any[]) {
    if (!r.contactId) continue;
    items.push({
      kind: 'cold_hot',
      contactId: r.contactId,
      businessName: r.businessName,
      city: r.city,
      phone: r.phone,
      // For a cold lead "age" is how long it has been waiting untouched.
      ageDays: Math.round(Number(r.age) || 0),
      label: r.rating ? `Sans site · ${r.rating}★` : 'Sans site · joignable',
      link: `/contacts/${r.contactId}`,
    });
  }

  return items;
}