import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contacts, calls, deals } from '../db/schema.js';
import { AuthRequest } from '../middleware/auth.js';

/**
 * Shared shapes for "what should I do now".
 *
 * The dashboard answered "how are we doing" but never "what do I do today".
 * These three lists are the actionable half of that, and they are deliberately
 * scoped per rep for non-admins so the panel is the same work list the calling
 * screen produces.
 */

/** A lead is "hot" when it is reachable, has no site, and has not been dialled. */
export const HOT_PHONE_AFTER_DAYS = 14;
/** A quote with no answer for this long is worth chasing. */
export const STALE_QUOTE_AFTER_DAYS = 10;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

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
  const scope = isAdmin
    ? sql`1=1`
    : sql`(${contacts.assignedTo} = ${userId} OR ${contacts.assignedTo} IS NULL)`;

  // 1. Callbacks that came due. Only the most recent call per contact counts,
  //    so a reminder from three weeks ago does not resurface after every call.
  const followups = await db.execute(sql`
    WITH last_call AS (
      SELECT DISTINCT ON (c.contact_id)
        c.contact_id, c.next_step, c.next_step_at
      FROM calls c
      WHERE c.contact_id IS NOT NULL
        AND c.next_step_at IS NOT NULL
        AND c.next_step_at <= NOW()
        ${isAdmin ? sql`` : sql`AND c.user_id = ${userId}`}
      ORDER BY c.contact_id, c.date DESC
    )
    SELECT last_call.contact_id AS "contactId",
           last_call.next_step AS "nextStep",
           contacts.business_name AS "businessName",
           contacts.city, contacts.phone,
           EXTRACT(EPOCH FROM (NOW() - last_call.next_step_at)) / 86400 AS age
    FROM last_call
    LEFT JOIN contacts ON contacts.id = last_call.contact_id
    WHERE ${scope}
    ORDER BY last_call.next_step_at ASC
    LIMIT 20
  `).catch((err) => {
    console.error('actions: relances dues indisponibles:', err.message, '| position', err.position, '| near', err.where, '| detail', err.detail);
    return { rows: [] as any[] };
  });

  // 2. Quotes sent and never answered.
  const quoteCutoff = daysAgo(STALE_QUOTE_AFTER_DAYS);
  const staleQuotes = await db.execute(sql`
    SELECT ${deals.id} AS dealId,
           ${deals.contactId} AS "contactId",
           ${deals.amount} AS amount,
           ${contacts.businessName} AS "businessName",
           ${contacts.city}, ${contacts.phone},
           EXTRACT(EPOCH FROM (NOW() - ${deals.createdAt})) / 86400 AS age
    FROM ${deals}
    LEFT JOIN ${contacts} ON ${contacts.id} = ${deals.contactId}
    WHERE ${deals.status} = 'en_cours'
      AND ${deals.createdAt} <= ${quoteCutoff}
      ${scope}
    ORDER BY ${deals.createdAt} ASC
    LIMIT 20
  `).catch((err) => {
    console.error('actions: devis sans réponse indisponibles:', err.message, '| position', err.position, '| near', err.where, '| detail', err.detail);
    return { rows: [] as any[] };
  });

  // 3. Reachable leads without a site that nobody has dialled lately.
  const callCutoff = daysAgo(HOT_PHONE_AFTER_DAYS);
  const coldHot = await db.execute(sql`
    SELECT ${contacts.id} AS "contactId",
           ${contacts.businessName} AS "businessName",
           ${contacts.city}, ${contacts.phone},
           ${contacts.googleRating} AS rating,
           EXTRACT(EPOCH FROM (NOW() - ${contacts.createdAt})) / 86400 AS age
    FROM ${contacts}
    WHERE ${contacts.hasSite} IN ('pas_de_site', 'non')
      AND ${contacts.phone} IS NOT NULL AND ${contacts.phone} != ''
      AND coalesce(${contacts.dnc}, 0) = 0
      AND ${contacts.stage} IN ('identifie', 'contacte')
      AND NOT EXISTS (
        SELECT 1 FROM ${calls} cl
        WHERE cl.contact_id = ${contacts.id} AND cl.date >= ${callCutoff}
      )
      ${scope}
    ORDER BY ${contacts.googleRating} DESC NULLS LAST
    LIMIT 20
  `).catch((err) => {
    console.error('actions: prêts à appeler indisponibles:', err.message, '| position', err.position, '| near', err.where, '| detail', err.detail);
    return { rows: [] as any[] };
  });

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