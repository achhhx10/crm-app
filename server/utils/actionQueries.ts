import { sql } from 'drizzle-orm';
import { contacts, calls, deals } from '../db/schema.js';

/**
 * Query definitions for the "what should I do now" lists.
 *
 * Kept free of any database import on purpose. scripts/check-sql.mjs renders
 * these exact templates to validate them without a connection, and importing
 * db/index.js would open a pool and run the schema bootstrap as a side effect.
 * Duplicating these queries into the checker is what let a broken one through:
 * the copy was valid while the real one was not.
 *
 * The ownership scope is interpolated with a leading AND at every call site,
 * because "WHERE ... 1=1" is a syntax error.
 */

/** A lead is "hot" when it is reachable, has no site, and has not been dialled. */
export const HOT_PHONE_AFTER_DAYS = 14;
/** A quote with no answer for this long is worth chasing. */
export const STALE_QUOTE_AFTER_DAYS = 10;

export function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export function ownershipScope(userId: number, isAdmin: boolean) {
  return isAdmin
    ? sql`1=1`
    : sql`(${contacts.assignedTo} = ${userId} OR ${contacts.assignedTo} IS NULL)`;
}

/** Callbacks that came due. Only the most recent call per contact counts, so a
 *  reminder from three weeks ago does not resurface after every conversation. */
export function followUpsQuery(userId: number, isAdmin: boolean) {
  return sql`
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
    WHERE ${ownershipScope(userId, isAdmin)}
    ORDER BY last_call.next_step_at ASC
    LIMIT 20
  `;
}

/** Quotes sent and never answered. */
export function staleQuotesQuery(userId: number, isAdmin: boolean, quoteCutoff = daysAgo(STALE_QUOTE_AFTER_DAYS)) {
  return sql`
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
      AND ${ownershipScope(userId, isAdmin)}
    ORDER BY ${deals.createdAt} ASC
    LIMIT 20
  `;
}

/** Reachable leads without a site that nobody has dialled lately. */
export function coldHotQuery(userId: number, isAdmin: boolean, callCutoff = daysAgo(HOT_PHONE_AFTER_DAYS)) {
  return sql`
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
      AND ${ownershipScope(userId, isAdmin)}
    ORDER BY ${contacts.googleRating} DESC NULLS LAST
    LIMIT 20
  `;
}