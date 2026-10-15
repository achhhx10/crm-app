import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { contacts, calls, deals, referrals, users } from '../db/schema.js';
import { eq, sql, count, desc, and, isNull } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { resolveRange } from '../utils/dateRange.js';

const router = Router();

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

/** Narrow a count/sum to the reporting range, scoped to the caller when not admin. */
function scoped(conditions: any[], req: AuthRequest, userColumn: any, userId: number) {
  return isAdmin(req) ? conditions : [...conditions, eq(userColumn, userId)];
}

router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const range = resolveRange(req.query as Record<string, unknown>);
    const userId = req.user!.userId;
    const inRange = sql`${calls.date} >= ${range.from} AND ${calls.date} <= ${range.to}`;

    // Contacts are a stock, never a flow: not filtered by period.
    const totalContacts = isAdmin(req)
      // Keep the legacy aggregate aligned with ownedContacts(): the mobile
      // prospect counter must not include rows the web table hides.
      ? (await db.select({ value: count() }).from(contacts).where(isNull(contacts.archivedAt)))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(contacts).where(and(eq(contacts.assignedTo, userId), isNull(contacts.archivedAt))))[0]?.value ?? 0;

    const totalCalls = (await db.select({ value: count() }).from(calls)
      .where(and(...scoped([inRange], req, calls.userId, userId))))[0]?.value ?? 0;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const callsToday = (await db.select({ value: count() }).from(calls)
      .where(and(...scoped([sql`${calls.date} >= ${startOfDay}`], req, calls.userId, userId))))[0]?.value ?? 0;

    // A mobile-only "refus" must not count as answered, or the headline
    // connection rate inflates depending on which device logged the call.
    const ANSWERED = sql`${calls.result} NOT IN ('pas_decroche','messagerie','refus','a_rappeler')`;
    const answeredCalls = (await db.select({ value: count() }).from(calls)
      .where(and(...scoped([inRange, ANSWERED], req, calls.userId, userId))))[0]?.value ?? 0;

    const meetings = (await db.select({ value: count() }).from(calls)
      .where(and(...scoped([inRange, sql`${calls.result} = 'rdv_obtenu'`], req, calls.userId, userId))))[0]?.value ?? 0;

    const dealRange = sql`${deals.createdAt} >= ${range.from} AND ${deals.createdAt} <= ${range.to}`;
    const totalDeals = (await db.select({ value: count() }).from(deals)
      .where(and(...scoped([dealRange], req, deals.assignedTo, userId))))[0]?.value ?? 0;

    const signedDeals = (await db.select({ value: count() }).from(deals)
      .where(and(...scoped([dealRange, eq(deals.status, 'signe')], req, deals.assignedTo, userId))))[0]?.value ?? 0;

    // Revenue follows signedAt, not createdAt: a deal signed today but created
    // last quarter is revenue of today.
    const signedRange = sql`${deals.signedAt} >= ${range.from} AND ${deals.signedAt} <= ${range.to}`;
    const revenue = (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals)
      .where(and(...scoped([eq(deals.status, 'signe'), signedRange], req, deals.assignedTo, userId))))[0]?.value ?? 0;

    // Open pipeline value is never summed anywhere; it is the number that
    // answers "what is still in flight".
    const openPipeline = (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals)
      .where(and(...scoped([sql`${deals.status} = 'en_cours'`], req, deals.assignedTo, userId))))[0]?.value ?? 0;

    // Referrals are owned by the source contact, so ownership follows contacts.
    const referralScope = isAdmin(req)
      ? []
      : [sql`${referrals.sourceContactId} IN (SELECT id FROM contacts WHERE assigned_to = ${userId})`];
    // Both vocabularies count as signed: the web wrote 'convertie', mobile 'signe',
    // and the dashboard previously counted only 'signe'.
    const SIGNED_REFERRAL = sql`${referrals.status} IN ('signe','convertie')`;
    const totalReferrals = (await db.select({ value: count() }).from(referrals)
      .where(and(...referralScope)))[0]?.value ?? 0;
    const signedReferrals = (await db.select({ value: count() }).from(referrals)
      .where(and(...referralScope, SIGNED_REFERRAL)))[0]?.value ?? 0;

    res.json({
      range,
      contacts: { total: totalContacts },
      calls: {
        total: totalCalls,
        today: callsToday,
        answered: answeredCalls,
        meetings,
        connectionRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
        meetingRate: answeredCalls > 0 ? Math.round((meetings / answeredCalls) * 100) : 0,
      },
      deals: {
        total: totalDeals,
        signed: signedDeals,
        revenue: Number(revenue),
        openPipeline: Number(openPipeline),
        closingRate: totalDeals > 0 ? Math.round((signedDeals / totalDeals) * 100) : 0,
      },
      referrals: {
        total: totalReferrals,
        signed: signedReferrals,
      },
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Objection breakdown over the period. The six objection codes were stored on
 * every call and aggregated nowhere, so "what stops us most?" had no answer.
 */
router.get('/objections', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const range = resolveRange(req.query as Record<string, unknown>);
    const userId = req.user!.userId;
    const inRange = sql`${calls.date} >= ${range.from} AND ${calls.date} <= ${range.to}`;
    const hasObjection = sql`${calls.objection} IS NOT NULL AND ${calls.objection} != ''`;

    const rows = await db
      .select({
        objection: calls.objection,
        occurrences: count(),
      })
      .from(calls)
      .where(and(...scoped([inRange, hasObjection], req, calls.userId, userId)))
      .groupBy(calls.objection)
      .orderBy(desc(count()));

    const total = rows.reduce((sum, r) => sum + r.occurrences, 0);
    res.json({
      range,
      total,
      objections: rows.map(r => ({
        objection: r.objection,
        occurrences: r.occurrences,
        share: total > 0 ? Math.round((r.occurrences / total) * 100) : 0,
      })),
    });
  } catch (error) {
    console.error('Dashboard objections error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Current stage distribution. Without stage history this is a snapshot, not a
 * conversion-over-time funnel, so it reports how far each stage has advanced
 * relative to the previous one rather than a rate of conversion.
 */
router.get('/pipeline', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const stages = ['identifie', 'contacte', 'interesse', 'rdv_programme', 'proposition_envoyee', 'signe', 'perdu'];
    const userId = req.user!.userId;

    const rows = await db
      .select({ stage: contacts.stage, n: count() })
      .from(contacts)
      .where(isAdmin(req) ? undefined : eq(contacts.assignedTo, userId))
      .groupBy(contacts.stage);

    const byStage: Record<string, number> = Object.fromEntries(stages.map(s => [s, 0]));
    for (const row of rows) {
      const key = (row.stage as string) || 'identifie';
      if (key in byStage) byStage[key] = row.n;
    }

    const funnel = stages.map((stage, index) => {
      const value = byStage[stage];
      const previous = index > 0 ? byStage[stages[index - 1]] : null;
      return {
        stage,
        count: value,
        // Share of leads that have reached at least this stage.
        reachRate: previous && previous > 0 ? Math.round((value / previous) * 100) : null,
      };
    });

    const won = byStage.signe;
    const lost = byStage.perdu;
    const closed = won + lost;

    res.json({
      pipeline: byStage,
      funnel,
      closed,
      winRate: closed > 0 ? Math.round((won / closed) * 100) : null,
    });
  } catch (error) {
    console.error('Dashboard pipeline error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/performance', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const range = resolveRange(req.query as Record<string, unknown>);
    const userId = req.user!.userId;
    // Never select password hashes.
    const safeColumns = { id: users.id, name: users.name };
    const allUsers = isAdmin(req)
      ? await db.select(safeColumns).from(users)
      : await db.select(safeColumns).from(users).where(eq(users.id, userId));

    const inRange = sql`${calls.date} >= ${range.from} AND ${calls.date} <= ${range.to}`;

    const performance = await Promise.all(allUsers.map(async (user) => {
      const scope = eq(calls.userId, user.id);
      const totalCalls = (await db.select({ value: count() }).from(calls)
        .where(and(scope, inRange)))[0]?.value ?? 0;
      const answeredCalls = (await db.select({ value: count() }).from(calls)
        .where(and(scope, inRange, sql`${calls.result} NOT IN ('pas_decroche','messagerie','refus','a_rappeler')`)))[0]?.value ?? 0;
      const rdvObtained = (await db.select({ value: count() }).from(calls)
        .where(and(scope, inRange, sql`${calls.result} = 'rdv_obtenu'`)))[0]?.value ?? 0;

      return {
        userId: user.id,
        name: user.name,
        totalCalls,
        answeredCalls,
        rdvObtained,
        connectionRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
        rdvRate: answeredCalls > 0 ? Math.round((rdvObtained / answeredCalls) * 100) : 0,
      };
    }));

    // Sorted so the chart shows the strongest performer first.
    performance.sort((a, b) => b.rdvObtained - a.rdvObtained || b.totalCalls - a.totalCalls);

    res.json({ range, performance });
  } catch (error) {
    console.error('Dashboard performance error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/activity', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const range = resolveRange(req.query as Record<string, unknown>);
    const userId = req.user!.userId;

    const columns = {
      id: calls.id,
      contactId: calls.contactId,
      date: calls.date,
      result: calls.result,
      notes: calls.notes,
      userName: users.name,
      contactName: contacts.businessName,
    };

    const recentCalls = await db.select(columns)
      .from(calls)
      .leftJoin(users, eq(calls.userId, users.id))
      .leftJoin(contacts, eq(calls.contactId, contacts.id))
      .where(and(
        sql`${calls.date} >= ${range.from} AND ${calls.date} <= ${range.to}`,
        ...(isAdmin(req) ? [] : [eq(calls.userId, userId)]),
      ))
      .orderBy(desc(calls.date))
      .limit(20);

    res.json({ range, activity: recentCalls });
  } catch (error) {
    console.error('Dashboard activity error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
