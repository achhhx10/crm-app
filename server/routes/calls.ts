import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { calls, contacts } from '../db/schema.js';
import { eq, desc, sql, and, count } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const callSchema = z.object({
  contactId: z.number().int().positive(),
  duration: z.number().int().positive().optional().nullable(),
  result: z.string().min(1, 'Le résultat est requis'),
  objection: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  nextStep: z.string().optional().nullable()
});

const router = Router();

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { contactId } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    let query = db.select().from(calls);
    const conditions = [];

    if (!isAdmin(req)) {
      conditions.push(eq(calls.userId, req.user!.userId));
    }

    if (contactId && typeof contactId === 'string') {
      conditions.push(eq(calls.contactId, Number(contactId)));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const allCalls = await query.orderBy(desc(calls.date)).limit(limit).offset(offset);
    res.json(allCalls);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/contact/:contactId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const conditions = [eq(calls.contactId, Number(req.params.contactId))];
    if (!isAdmin(req)) {
      conditions.push(eq(calls.userId, req.user!.userId));
    }
    const contactCalls = await db.select().from(calls)
      .where(and(...conditions))
      .orderBy(desc(calls.date));
    res.json(contactCalls);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const userFilter = isAdmin(req) ? sql`1=1` : eq(calls.userId, req.user!.userId);

    const totalCalls = (await db.select({ value: count() }).from(calls).where(userFilter))[0]?.value ?? 0;
    const callsToday = (await db.select({ value: count() }).from(calls)
      .where(and(userFilter, sql`${calls.date} >= ${startOfDay}`)))[0]?.value ?? 0;
    const callsMonth = (await db.select({ value: count() }).from(calls)
      .where(and(userFilter, sql`${calls.date} >= ${thirtyDaysAgo}`)))[0]?.value ?? 0;

    const answeredCalls = (await db.select({ value: count() }).from(calls)
      .where(and(userFilter, sql`${calls.result} != 'pas_decroche' AND ${calls.result} != 'messagerie'`)))[0]?.value ?? 0;

    const rdvObtained = (await db.select({ value: count() }).from(calls)
      .where(and(userFilter, eq(calls.result, 'rdv_obtenu'))))[0]?.value ?? 0;

    res.json({
      total: totalCalls,
      today: callsToday,
      month: callsMonth,
      answered: answeredCalls,
      rdvObtained,
      connectionRate: totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, validate(callSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { contactId, duration, result, objection, notes, nextStep } = req.body;

    if (!contactId || !result) {
      res.status(400).json({ error: 'contactId et result requis' });
      return;
    }

    if (!isAdmin(req)) {
      const contact = (await db.select().from(contacts).where(eq(contacts.id, Number(contactId))))[0];
      if (!contact || (contact.assignedTo !== null && contact.assignedTo !== req.user!.userId)) {
        res.status(403).json({ error: 'Accès interdit' });
        return;
      }
    }

    const [call] = await db.insert(calls).values({
      contactId: Number(contactId),
      userId: req.user!.userId,
      duration: duration || null,
      result,
      objection: objection || null,
      notes: notes || null,
      nextStep: nextStep || null,
    }).returning();
    res.json(call);
  } catch (error) {
    console.error('Create call error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
