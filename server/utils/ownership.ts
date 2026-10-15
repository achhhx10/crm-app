import { sql, and, type SQL } from 'drizzle-orm';
import { contacts } from '../db/schema.js';

/**
 * Shared row-level scopes for reporting.
 *
 * These live here rather than inside a router because the SQL smoke test needs
 * to render them without opening a database connection: importing a route
 * module pulls in the `db` singleton, which aborts on a missing DATABASE_URL.
 * They were previously duplicated as a local `sql` template in the test, which
 * drifted from production and hid the archived_at filter.
 */

export interface ScopedUser {
  role?: string;
  userId: number;
}

export function isAdmin(user: ScopedUser | undefined): boolean {
  return user?.role === 'admin';
}

/**
 * Base scope for every contact-based metric (prospects, qualified, funnel,
 * sources).
 *
 * Archived rows are excluded here rather than per query so a future aggregate
 * cannot silently count rows the prospect list already hides. Deals, calls and
 * referrals deliberately keep their history and are scoped separately.
 */
export function ownedContacts(user: ScopedUser | undefined, userId: number): SQL {
  const ownership = isAdmin(user)
    ? sql`1=1`
    : sql`(${contacts.assignedTo} = ${userId} OR ${contacts.assignedTo} IS NULL)`;
  return and(ownership, sql`${contacts.archivedAt} IS NULL`) as SQL;
}