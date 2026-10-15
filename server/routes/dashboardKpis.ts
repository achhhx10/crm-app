import { Router, Response } from 'express';
import { sql, count, countDistinct, sum, eq, and, gte, lte, inArray, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contacts, calls, deals } from '../db/schema.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { resolveRange, previousRange, trend } from '../utils/dateRange.js';

/**
 * Reporting endpoints for the dashboard.
 *
 * Additive by design: every route here is new. The pre-existing /summary,
 * /pipeline, /performance and /activity contracts are consumed by the mobile PWA
 * and were left untouched, which is exactly the mistake that broke the mobile
 * dashboard once already.
 */

const router = Router();

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

const SIGNED = 'signe';
const IN_PROGRESS = 'en_cours';
// A lead is "qualified" once it reaches a stage where a commercial conversation
// started, whatever the outcome afterwards.
const QUALIFIED_STAGES = ['interesse', 'rdv_programme', 'proposition_envoyee', 'signe'];

/** Contacts the caller is allowed to see, as a drizzle condition. */
function ownedContacts(req: AuthRequest, userId: number) {
  return isAdmin(req)
    ? sql`1=1`
    : sql`(${contacts.assignedTo} = ${userId} OR ${contacts.assignedTo} IS NULL)`;
}

function ownedDeals(req: AuthRequest, userId: number) {
  return isAdmin(req) ? sql`1=1` : sql`${deals.assignedTo} = ${userId}`;
}

function inPeriod(column: any, from: Date, to: Date) {
  return and(gte(column, from), lte(column, to));
}

/**
 * Level 1 — the vital metrics: signed revenue, open quotes and closing rate,
 * each with its change against the previous period of equal length.
 */
router.get('/kpis', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const range = resolveRange(req.query as Record<string, unknown>);
    const prev = previousRange(range);
    const userId = req.user!.userId;

    const revenueFor = async (from: Date, to: Date) => {
      const row = (await db
        .select({ value: sum(deals.amount) })
        .from(deals)
        .where(and(
          ownedDeals(req, userId),
          eq(deals.status, SIGNED),
          inPeriod(deals.signedAt, from, to),
        )))[0]?.value;
      return Number(row ?? 0);
    };

    const countsFor = async (from: Date, to: Date) => {
      const row = (await db
        .select({
          created: count(),
          signed: sql<number>`count(*) FILTER (WHERE ${deals.status} = ${SIGNED})`,
        })
        .from(deals)
        .where(and(ownedDeals(req, userId), inPeriod(deals.createdAt, from, to))))[0];
      const created = Number(row?.created ?? 0);
      const signed = Number(row?.signed ?? 0);
      return { created, signed, closingRate: created > 0 ? Math.round((signed / created) * 100) : null };
    };

    // Open quotes are a stock, not a flow: they are not filtered by period.
    const openRow = (await db
      .select({ value: count(), amount: sum(deals.amount) })
      .from(deals)
      .where(and(ownedDeals(req, userId), eq(deals.status, IN_PROGRESS))))[0];

    const [revenue, prevRevenue, current, previous] = await Promise.all([
      revenueFor(range.from, range.to),
      revenueFor(prev.from, prev.to),
      countsFor(range.from, range.to),
      countsFor(prev.from, prev.to),
    ]);

    res.json({
      range,
      previousRange: prev,
      revenueSigned: revenue,
      revenueTrend: trend(revenue, prevRevenue),
      openQuotes: {
        count: Number(openRow?.value ?? 0),
        amount: Number(openRow?.amount ?? 0),
      },
      closingRate: current.closingRate,
      closingRateTrend: trend(current.closingRate ?? 0, previous.closingRate ?? 0),
      dealsCreated: current.created,
      dealsSigned: current.signed,
    });
  } catch (error) {
    console.error('Dashboard kpis error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Level 2 — the sales funnel, over the stages the CRM actually records:
 * prospects, contacted, qualified, quotes sent, contracts signed.
 *
 * Visit and inbound-request counts are deliberately absent: nothing in this
 * database records website traffic, so those two rungs would only ever read zero.
 *
 * Widths are meant to be read relative to the previous step, not to the first:
 * with tens of thousands of prospects and a handful of signatures, bars scaled to
 * the top would flatten every other step to nothing.
 */
router.get('/funnel', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const range = resolveRange(req.query as Record<string, unknown>);
    const userId = req.user!.userId;

    const [prospectsRow, contactedRow, qualifiedRow, quotesRow, signedRow] = await Promise.all([
      db.select({ value: count() }).from(contacts).where(ownedContacts(req, userId)),
      db.select({ value: countDistinct(calls.contactId) }).from(calls).where(
        isAdmin(req) ? sql`1=1` : eq(calls.userId, userId),
      ),
      db.select({ value: count() }).from(contacts).where(and(
        ownedContacts(req, userId),
        inArray(contacts.stage, QUALIFIED_STAGES),
      )),
      db.select({ value: count() }).from(deals).where(and(
        ownedDeals(req, userId),
        inPeriod(deals.createdAt, range.from, range.to),
      )),
      db.select({ value: count() }).from(deals).where(and(
        ownedDeals(req, userId),
        eq(deals.status, SIGNED),
        inPeriod(deals.createdAt, range.from, range.to),
      )),
    ]);

    const value = (r: any) => Number(r?.value ?? 0);
    const stages = [
      { key: 'prospects', label: 'Prospects', value: value(prospectsRow[0]) },
      { key: 'contactes', label: 'Contactés', value: value(contactedRow[0]) },
      { key: 'qualifies', label: 'Qualifiés', value: value(qualifiedRow[0]) },
      { key: 'devis', label: 'Devis envoyés', value: value(quotesRow[0]) },
      { key: 'signes', label: 'Contrats signés', value: value(signedRow[0]) },
    ];

    // Conversion against the previous step: the reading that exposes friction.
    const steps = stages.map((stage, index) => {
      const previous = index > 0 ? stages[index - 1].value : null;
      return {
        ...stage,
        // Left unrounded on purpose: 4 contacted out of 39,254 is 0.01%, and
        // rounding it to 0% reads as "nobody". The client formats it.
        conversionFromPrevious: previous && previous > 0
          ? (stage.value / previous) * 100
          : null,
      };
    });

    // The leaky step is the one that loses the most, not the smallest bar: with
    // 39k prospects and a handful of calls, every absolute number is dominated
    // by the first stage.
    let friction: { from: string; to: string; label: string; conversion: number } | null = null;
    for (let i = 1; i < steps.length; i += 1) {
      const c = steps[i].conversionFromPrevious;
      if (c === null || steps[i].value === 0) continue;
      if (!friction || c < friction.conversion) {
        friction = {
          from: steps[i - 1].key,
          to: steps[i].key,
          label: steps[i].label,
          conversion: c,
        };
      }
    }

    res.json({
      range,
      steps,
      friction,
      note: 'Les visites et demandes entrantes ne sont pas suivies par ce CRM.',
    });
  } catch (error) {
    console.error('Dashboard funnel error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Level 3 — tactical view, one row per lead origin.
 *
 * "Origin" is contacts.source (where the lead came from), not web traffic
 * channels: no visit or spend data exists here, so ROI is not computable and is
 * deliberately not shown.
 */
router.get('/sources', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const range = resolveRange(req.query as Record<string, unknown>);
    const userId = req.user!.userId;
    const scope = ownedContacts(req, userId);

    const contactRows = await db
      .select({
        source: contacts.source,
        prospects: count(),
        qualified: sql<number>`count(*) FILTER (WHERE ${inArray(contacts.stage, QUALIFIED_STAGES)})`,
      })
      .from(contacts)
      .where(scope)
      .groupBy(contacts.source)
      .orderBy(desc(count()));

    const dealRows = await db
      .select({
        source: contacts.source,
        quotes: count(),
        quotesAmount: sum(deals.amount),
        signed: sql<number>`count(*) FILTER (WHERE ${deals.status} = ${SIGNED})`,
        signedAmount: sql<number>`COALESCE(SUM(${deals.amount}) FILTER (WHERE ${deals.status} = ${SIGNED}), 0)`,
      })
      .from(deals)
      .innerJoin(contacts, eq(deals.contactId, contacts.id))
      .where(inPeriod(deals.createdAt, range.from, range.to))
      .groupBy(contacts.source);

    const dealsBySource = new Map(dealRows.map((r: any) => [r.source ?? 'inconnu', r]));

    const rows = contactRows.map((r: any) => {
      const key = r.source ?? 'inconnu';
      const d: any = dealsBySource.get(key);
      const signed = Number(d?.signed ?? 0);
      const quotes = Number(d?.quotes ?? 0);
      return {
        source: key,
        prospects: Number(r.prospects ?? 0),
        qualified: Number(r.qualified ?? 0),
        quotes,
        quotesAmount: Number(d?.quotesAmount ?? 0),
        signed,
        signedAmount: Number(d?.signedAmount ?? 0),
        closingRate: quotes > 0 ? Math.round((signed / quotes) * 100) : null,
      };
    });

    res.json({ range, rows, note: 'Origine du prospect. Le ROI n\'est pas calculable : aucune donnée de dépense.' });
  } catch (error) {
    console.error('Dashboard sources error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Level 2 diagnostic: how long the cycle takes, and what is stalling.
 *
 * Three things are honestly measurable here:
 *  - days between a quote being written and being signed
 *  - how long open quotes have been waiting
 *  - where the funnel leaks (returned by /funnel)
 *
 * Time in stage for a prospect is NOT available: contacts.stage holds only the
 * current value and no stage history is recorded anywhere. Anything claiming a
 * number here would be invented.
 */
router.get('/diagnostics', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const range = resolveRange(req.query as Record<string, unknown>);
    const userId = req.user!.userId;


    const openRows = await db.execute(sql`
      SELECT id, amount, EXTRACT(EPOCH FROM (NOW() - ${deals.createdAt})) / 86400 AS age
      FROM ${deals}
      WHERE ${deals.status} = ${IN_PROGRESS}
      ORDER BY ${deals.createdAt} ASC
      LIMIT 200
    `).catch(() => ({ rows: [] as any[] }));

    const signedRows = await db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (${deals.signedAt} - ${deals.createdAt})) / 86400 AS days
      FROM ${deals}
      WHERE ${deals.status} = ${SIGNED}
        AND ${deals.signedAt} >= ${range.from} AND ${deals.signedAt} <= ${range.to}
        AND ${deals.createdAt} IS NOT NULL
    `).catch(() => ({ rows: [] as any[] }));

    const clean = (v: any) => Number(v) || 0;
    const durations = (signedRows.rows as any[])
      .map(r => clean(r.days))
      .filter(d => d >= 0)
      .sort((a, b) => a - b);

    const median = durations.length
      ? (durations.length % 2
          ? durations[(durations.length - 1) / 2]
          : (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2)
      : null;

    const ages = (openRows.rows as any[]).map(r => clean(r.age)).filter(a => a >= 0);
    const oldest = (openRows.rows as any[])[0];

    res.json({
      range,
      cycle: {
        signedCount: durations.length,
        averageDays: durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
        medianDays: median === null ? null : Math.round(median),
      },
      openQuotes: {
        count: ages.length,
        averageAgeDays: ages.length
          ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
          : null,
        oldestAgeDays: ages.length ? Math.round(ages[ages.length - 1]) : null,
        oldestAmount: oldest ? Number(oldest.amount) : null,
      },
      limits: [
        'Le temps passé par étape sur un prospect est indisponible : contacts.stage ne garde que la valeur courante.',
      ],
    });
  } catch (error) {
    console.error('Dashboard diagnostics error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
