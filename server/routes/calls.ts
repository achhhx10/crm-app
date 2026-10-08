import { Router } from 'express';
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

router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { contactId, page = '1', limit = '50' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

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

    const allCalls = query.orderBy(desc(calls.date)).limit(Number(limit)).offset(offset).all();
    res.json(allCalls);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/contact/:contactId', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const conditions = [eq(calls.contactId, Number(req.params.contactId))];
    if (!isAdmin(req)) {
      conditions.push(eq(calls.userId, req.user!.userId));
    }
    const contactCalls = db.select().from(calls)
      .where(and(...conditions))
      .orderBy(desc(calls.date))
      .all();
    res.json(contactCalls);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/stats', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = Math.floor(today.getTime() / 1000);

    const userFilter = isAdmin(req) ? sql`1=1` : eq(calls.userId, req.user!.userId);

    const totalCalls = db.select({ value: count() }).from(calls).where(userFilter).get()?.value || 0;
    const callsToday = db.select({ value: count() }).from(calls)
      .where(and(userFilter, sql`${calls.date} >= ${startOfDay}`)).get()?.value || 0;
    const callsMonth = db.select({ value: count() }).from(calls)
      .where(and(userFilter, sql`${calls.date} >= ${thirtyDaysAgo}`)).get()?.value || 0;

    const answeredCalls = db.select({ value: count() }).from(calls)
      .where(and(userFilter, sql`${calls.result} != 'pas_decroche' AND ${calls.result} != 'messagerie'`)).get()?.value || 0;

    const rdvObtained = db.select({ value: count() }).from(calls)
      .where(and(userFilter, eq(calls.result, 'rdv_obtenu'))).get()?.value || 0;

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

router.post('/', authMiddleware, validate(callSchema), (req: AuthRequest, res: Response) => {
  try {
    const { contactId, duration, result, objection, notes, nextStep } = req.body;

    if (!contactId || !result) {
      res.status(400).json({ error: 'contactId et result requis' });
      return;
    }

    if (!isAdmin(req)) {
      const contact = db.select().from(contacts).where(eq(contacts.id, Number(contactId))).get();
      if (!contact || (contact.assignedTo !== null && contact.assignedTo !== req.user!.userId)) {
        res.status(403).json({ error: 'Accès interdit' });
        return;
      }
    }

    const result_insert = db.insert(calls).values({
      contactId: Number(contactId),
      userId: req.user!.userId,
      duration: duration || null,
      result,
      objection: objection || null,
      notes: notes || null,
      nextStep: nextStep || null,
    }).run();

    const call = db.select().from(calls).where(eq(calls.id, Number(result_insert.lastInsertRowid))).get();
    res.json(call);
  } catch (error) {
    console.error('Create call error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
