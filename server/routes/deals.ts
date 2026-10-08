import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { deals } from '../db/schema.js';
import { eq, desc, sql, count } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const dealSchema = z.object({
  contactId: z.number().int().positive(),
  amount: z.number().positive().optional().nullable(),
  siteType: z.string().optional(),
  status: z.string().optional()
});

const dealUpdateSchema = dealSchema.partial();

const router = Router();

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

const DEAL_UPDATE_FIELDS = ['contactId', 'amount', 'siteType', 'status'];

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let allDeals, totalResult;
    if (isAdmin(req)) {
      allDeals = await db.select().from(deals).orderBy(desc(deals.createdAt)).limit(limit).offset(offset);
      totalResult = (await db.select({ value: count() }).from(deals))[0]?.value ?? 0;
    } else {
      allDeals = await db.select().from(deals)
        .where(eq(deals.assignedTo, req.user!.userId))
        .orderBy(desc(deals.createdAt)).limit(limit).offset(offset);
      totalResult = (await db.select({ value: count() }).from(deals).where(eq(deals.assignedTo, req.user!.userId)))[0]?.value ?? 0;
    }
    res.json({ deals: allDeals, total: totalResult, page, limit });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const uid = req.user!.userId;
    const isAdminUser = isAdmin(req);

    const totalDeals = isAdminUser
      ? (await db.select({ value: count() }).from(deals))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(deals).where(eq(deals.assignedTo, uid)))[0]?.value ?? 0;

    const signedDeals = isAdminUser
      ? (await db.select({ value: count() }).from(deals).where(eq(deals.status, 'signe')))[0]?.value ?? 0
      : (await db.select({ value: count() }).from(deals).where(sql`${deals.assignedTo} = ${uid} AND ${deals.status} = 'signe'`))[0]?.value ?? 0;

    const totalRevenue = isAdminUser
      ? (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals).where(eq(deals.status, 'signe')))[0]?.value ?? 0
      : (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals).where(sql`${deals.assignedTo} = ${uid} AND ${deals.status} = 'signe'`))[0]?.value ?? 0;

    const monthRevenue = isAdminUser
      ? (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals).where(sql`${deals.status} = 'signe' AND ${deals.signedAt} >= ${thirtyDaysAgo}`))[0]?.value ?? 0
      : (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals).where(sql`${deals.assignedTo} = ${uid} AND ${deals.status} = 'signe' AND ${deals.signedAt} >= ${thirtyDaysAgo}`))[0]?.value ?? 0;

    res.json({
      total: totalDeals,
      signed: signedDeals,
      totalRevenue: Number(totalRevenue),
      monthRevenue: Number(monthRevenue),
      closingRate: totalDeals > 0 ? Math.round((signedDeals / totalDeals) * 100) : 0,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, validate(dealSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { contactId, amount, siteType, status } = req.body;

    if (!contactId) {
      res.status(400).json({ error: 'contactId requis' });
      return;
    }

    const [deal] = await db.insert(deals).values({
      contactId: Number(contactId),
      amount: amount ?? null,
      siteType: siteType || 'vitrine_simple',
      status: status || 'en_cours',
      assignedTo: req.user!.userId,
    }).returning();
    res.json(deal);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', authMiddleware, validate(dealUpdateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = (await db.select().from(deals).where(eq(deals.id, id)))[0];
    if (!existing) {
      res.status(404).json({ error: 'Deal non trouvé' });
      return;
    }

    if (!isAdmin(req) && existing.assignedTo !== null && existing.assignedTo !== req.user!.userId) {
      res.status(403).json({ error: 'Accès interdit' });
      return;
    }

    const updates: Record<string, any> = {};
    for (const f of DEAL_UPDATE_FIELDS) {
      if (f in req.body) updates[f] = req.body[f];
    }

    if (updates.status === 'signe' && existing.status !== 'signe') {
      updates.signedAt = new Date();
    }

    const [deal] = await db.update(deals).set(updates).where(eq(deals.id, id)).returning();
    res.json(deal);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const deleted = await db.delete(deals).where(eq(deals.id, Number(req.params.id))).returning({ id: deals.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Deal non trouvé' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
