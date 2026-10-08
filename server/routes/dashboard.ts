import { Router } from 'express';
import { db } from '../db/index.js';
import { contacts, calls, deals, referrals, users } from '../db/schema.js';
import { eq, sql, count, desc, and } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

router.get('/summary', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = Math.floor(today.getTime() / 1000);
    const userId = req.user!.userId;

    const totalContacts = isAdmin(req)
      ? db.select({ value: count() }).from(contacts).get()?.value || 0
      : db.select({ value: count() }).from(contacts).where(eq(contacts.assignedTo, userId)).get()?.value || 0;

    const totalCalls = isAdmin(req)
      ? db.select({ value: count() }).from(calls).get()?.value || 0
      : db.select({ value: count() }).from(calls).where(eq(calls.userId, userId)).get()?.value || 0;

    const callsToday = isAdmin(req)
      ? db.select({ value: count() }).from(calls).where(sql`${calls.date} >= ${startOfDay}`).get()?.value || 0
      : db.select({ value: count() }).from(calls).where(and(eq(calls.userId, userId), sql`${calls.date} >= ${startOfDay}`)).get()?.value || 0;

    const callsMonth = isAdmin(req)
      ? db.select({ value: count() }).from(calls).where(sql`${calls.date} >= ${thirtyDaysAgo}`).get()?.value || 0
      : db.select({ value: count() }).from(calls).where(and(eq(calls.userId, userId), sql`${calls.date} >= ${thirtyDaysAgo}`)).get()?.value || 0;

    const answeredCalls = isAdmin(req)
      ? db.select({ value: count() }).from(calls).where(sql`${calls.result} != 'pas_decroche' AND ${calls.result} != 'messagerie'`).get()?.value || 0
      : db.select({ value: count() }).from(calls).where(and(eq(calls.userId, userId), sql`${calls.result} != 'pas_decroche' AND ${calls.result} != 'messagerie'`)).get()?.value || 0;

    const totalDeals = isAdmin(req)
      ? db.select({ value: count() }).from(deals).get()?.value || 0
      : db.select({ value: count() }).from(deals).where(eq(deals.assignedTo, userId)).get()?.value || 0;

    const signedDeals = isAdmin(req)
      ? db.select({ value: count() }).from(deals).where(eq(deals.status, 'signe')).get()?.value || 0
      : db.select({ value: count() }).from(deals).where(sql`${deals.assignedTo} = ${userId} AND ${deals.status} = 'signe'`).get()?.value || 0;

    const monthRevenue = isAdmin(req)
      ? db.select({ value: sql`COALESCE(SUM(${deals.amount}), 0)` }).from(deals).where(sql`${deals.status} = 'signe' AND ${deals.signedAt} >= ${thirtyDaysAgo}`).get()?.value || 0
      : db.select({ value: sql`COALESCE(SUM(${deals.amount}), 0)` }).from(deals).where(sql`${deals.assignedTo} = ${userId} AND ${deals.status} = 'signe' AND ${deals.signedAt} >= ${thirtyDaysAgo}`).get()?.value || 0;

    const totalReferrals = isAdmin(req)
      ? db.select({ value: count() }).from(referrals).get()?.value || 0
      : db.select({ value: count() }).from(referrals).where(sql`${referrals.sourceContactId} IN (SELECT id FROM contacts WHERE assigned_to = ${userId})`).get()?.value || 0;

    const signedReferrals = isAdmin(req)
      ? db.select({ value: count() }).from(referrals).where(eq(referrals.status, 'signe')).get()?.value || 0
      : db.select({ value: count() }).from(referrals).where(sql`${referrals.sourceContactId} IN (SELECT id FROM contacts WHERE assigned_to = ${userId}) AND ${referrals.status} = 'signe'`).get()?.value || 0;

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

router.get('/pipeline', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const stages = ['identifie', 'contacte', 'interesse', 'rdv_programme', 'proposition_envoyee', 'signe', 'perdu'];
    const pipeline: Record<string, number> = {};
    const userId = req.user!.userId;

    for (const stage of stages) {
      const countResult = isAdmin(req)
        ? db.select({ value: count() }).from(contacts).where(eq(contacts.stage, stage)).get()
        : db.select({ value: count() }).from(contacts).where(and(eq(contacts.stage, stage), eq(contacts.assignedTo, userId))).get();
      pipeline[stage] = countResult?.value || 0;
    }

    res.json(pipeline);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/performance', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const allUsers = isAdmin(req)
      ? db.select().from(users).all()
      : db.select().from(users).where(eq(users.id, userId)).all();

    const performance = allUsers.map(user => {
      const totalCalls = db.select({ value: count() }).from(calls)
        .where(eq(calls.userId, user.id)).get()?.value || 0;
      const answeredCalls = db.select({ value: count() }).from(calls)
        .where(sql`${calls.userId} = ${user.id} AND ${calls.result} != 'pas_decroche' AND ${calls.result} != 'messagerie'`)
        .get()?.value || 0;
      const rdvObtained = db.select({ value: count() }).from(calls)
        .where(sql`${calls.userId} = ${user.id} AND ${calls.result} = 'rdv_obtenu'`)
        .get()?.value || 0;

      return {
        userId: user.id,
        name: user.name,
        totalCalls,
        answeredCalls,
        rdvObtained,
        connectionRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
        rdvRate: answeredCalls > 0 ? Math.round((rdvObtained / answeredCalls) * 100) : 0,
      };
    });

    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/activity', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const recentCalls = isAdmin(req)
      ? db.select({
          id: calls.id,
          date: calls.date,
          result: calls.result,
          notes: calls.notes,
          userName: users.name,
          contactName: contacts.businessName,
        })
        .from(calls)
        .leftJoin(users, eq(calls.userId, users.id))
        .leftJoin(contacts, eq(calls.contactId, contacts.id))
        .orderBy(desc(calls.date))
        .limit(20)
        .all()
      : db.select({
          id: calls.id,
          date: calls.date,
          result: calls.result,
          notes: calls.notes,
          userName: users.name,
          contactName: contacts.businessName,
        })
        .from(calls)
        .leftJoin(users, eq(calls.userId, users.id))
        .leftJoin(contacts, eq(calls.contactId, contacts.id))
        .where(eq(calls.userId, userId))
        .orderBy(desc(calls.date))
        .limit(20)
        .all();

    res.json(recentCalls);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
