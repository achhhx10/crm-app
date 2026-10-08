import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { contacts, calls, deals, referrals, users } from '../db/schema.js';
import { eq, sql, count, desc, and } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const userId = req.user!.userId;

    const totalContacts = isAdmin(req)
      ? (await db.select({ value: count() }).from(contacts))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(contacts).where(eq(contacts.assignedTo, userId)))[0]?.value ?? 0;

    const totalCalls = isAdmin(req)
      ? (await db.select({ value: count() }).from(calls))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(calls).where(eq(calls.userId, userId)))[0]?.value ?? 0;

    const callsToday = isAdmin(req)
      ? (await db.select({ value: count() }).from(calls).where(sql`${calls.date} >= ${startOfDay}`))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(calls).where(and(eq(calls.userId, userId), sql`${calls.date} >= ${startOfDay}`)))[0]?.value ?? 0;

    const callsMonth = isAdmin(req)
      ? (await db.select({ value: count() }).from(calls).where(sql`${calls.date} >= ${thirtyDaysAgo}`))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(calls).where(and(eq(calls.userId, userId), sql`${calls.date} >= ${thirtyDaysAgo}`)))[0]?.value ?? 0;

    const answeredCalls = isAdmin(req)
      ? (await db.select({ value: count() }).from(calls).where(sql`${calls.result} != 'pas_decroche' AND ${calls.result} != 'messagerie'`))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(calls).where(and(eq(calls.userId, userId), sql`${calls.result} != 'pas_decroche' AND ${calls.result} != 'messagerie'`)))[0]?.value ?? 0;

    const totalDeals = isAdmin(req)
      ? (await db.select({ value: count() }).from(deals))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(deals).where(eq(deals.assignedTo, userId)))[0]?.value ?? 0;

    const signedDeals = isAdmin(req)
      ? (await db.select({ value: count() }).from(deals).where(eq(deals.status, 'signe')))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(deals).where(sql`${deals.assignedTo} = ${userId} AND ${deals.status} = 'signe'`))[0]?.value ?? 0;

    const monthRevenue = isAdmin(req)
      ? (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals).where(sql`${deals.status} = 'signe' AND ${deals.signedAt} >= ${thirtyDaysAgo}`))[0]?.value ?? 0
      : (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals).where(sql`${deals.assignedTo} = ${userId} AND ${deals.status} = 'signe' AND ${deals.signedAt} >= ${thirtyDaysAgo}`))[0]?.value ?? 0;

    const totalReferrals = isAdmin(req)
      ? (await db.select({ value: count() }).from(referrals))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(referrals).where(sql`${referrals.sourceContactId} IN (SELECT id FROM contacts WHERE assigned_to = ${userId})`))[0]?.value ?? 0;

    const signedReferrals = isAdmin(req)
      ? (await db.select({ value: count() }).from(referrals).where(eq(referrals.status, 'signe')))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(referrals).where(sql`${referrals.sourceContactId} IN (SELECT id FROM contacts WHERE assigned_to = ${userId}) AND ${referrals.status} = 'signe'`))[0]?.value ?? 0;

    res.json({
      contacts: { total: totalContacts },
      calls: {
        total: totalCalls,
        today: callsToday,
        month: callsMonth,
        answered: answeredCalls,
        connectionRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
      },
      deals: {
        total: totalDeals,
        signed: signedDeals,
        monthRevenue: Number(monthRevenue),
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

router.get('/pipeline', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const stages = ['identifie', 'contacte', 'interesse', 'rdv_programme', 'proposition_envoyee', 'signe', 'perdu'];
    const pipeline: Record<string, number> = {};
    const userId = req.user!.userId;

    for (const stage of stages) {
      const countResult = isAdmin(req)
        ? (await db.select({ value: count() }).from(contacts).where(eq(contacts.stage, stage)))[0]
        : (await db.select({ value: count() }).from(contacts).where(and(eq(contacts.stage, stage), eq(contacts.assignedTo, userId))))[0];
      pipeline[stage] = countResult?.value ?? 0;
    }

    res.json(pipeline);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/performance', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    // Never select password hashes.
    const safeColumns = { id: users.id, name: users.name };
    const allUsers = isAdmin(req)
      ? await db.select(safeColumns).from(users)
      : await db.select(safeColumns).from(users).where(eq(users.id, userId));

    const performance = await Promise.all(allUsers.map(async (user) => {
      const totalCalls = (await db.select({ value: count() }).from(calls)
        .where(eq(calls.userId, user.id)))[0]?.value ?? 0;
      const answeredCalls = (await db.select({ value: count() }).from(calls)
        .where(sql`${calls.userId} = ${user.id} AND ${calls.result} != 'pas_decroche' AND ${calls.result} != 'messagerie'`))[0]?.value ?? 0;
      const rdvObtained = (await db.select({ value: count() }).from(calls)
        .where(sql`${calls.userId} = ${user.id} AND ${calls.result} = 'rdv_obtenu'`))[0]?.value ?? 0;

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

    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/activity', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const columns = {
      id: calls.id,
      date: calls.date,
      result: calls.result,
      notes: calls.notes,
      userName: users.name,
      contactName: contacts.businessName,
    };

    const recentCalls = isAdmin(req)
      ? await db.select(columns)
        .from(calls)
        .leftJoin(users, eq(calls.userId, users.id))
        .leftJoin(contacts, eq(calls.contactId, contacts.id))
        .orderBy(desc(calls.date))
        .limit(20)
      : await db.select(columns)
        .from(calls)
        .leftJoin(users, eq(calls.userId, users.id))
        .leftJoin(contacts, eq(calls.contactId, contacts.id))
        .where(eq(calls.userId, userId))
        .orderBy(desc(calls.date))
        .limit(20);

    res.json(recentCalls);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
