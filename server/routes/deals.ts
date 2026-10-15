import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { deals, contacts } from '../db/schema.js';
import { eq, desc, sql, count, and } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { resolveRange } from '../utils/dateRange.js';
import { parseId } from '../utils/paramId.js';

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

    // LEFT JOIN so the client never has to resolve names from a capped contact list.
    const dealColumns = {
      id: deals.id,
      contactId: deals.contactId,
      amount: deals.amount,
      siteType: deals.siteType,
      status: deals.status,
      assignedTo: deals.assignedTo,
      createdAt: deals.createdAt,
      signedAt: deals.signedAt,
      contactName: contacts.businessName,
      contactCity: contacts.city,
    };

    let allDeals, totalResult;
    if (isAdmin(req)) {
      allDeals = await db.select(dealColumns).from(deals)
        .leftJoin(contacts, eq(deals.contactId, contacts.id))
        .orderBy(desc(deals.createdAt)).limit(limit).offset(offset);
      totalResult = (await db.select({ value: count() }).from(deals))[0]?.value ?? 0;
    } else {
      allDeals = await db.select(dealColumns).from(deals)
        .leftJoin(contacts, eq(deals.contactId, contacts.id))
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
    const range = resolveRange(req.query as Record<string, unknown>);
    const uid = req.user!.userId;
    const isAdminUser = isAdmin(req);
    const owner = isAdminUser ? sql`1=1` : sql`${deals.assignedTo} = ${uid}`;

    const createdInRange = sql`${deals.createdAt} >= ${range.from} AND ${deals.createdAt} <= ${range.to}`;
    const signedInRange = sql`${deals.signedAt} >= ${range.from} AND ${deals.signedAt} <= ${range.to}`;

    const totalDeals = (await db.select({ value: count() }).from(deals)
      .where(and(owner, createdInRange)))[0]?.value ?? 0;

    const signedDeals = (await db.select({ value: count() }).from(deals)
      .where(and(owner, createdInRange, eq(deals.status, 'signe'))))[0]?.value ?? 0;

    // All-time signed revenue: a lifetime figure, never date-filtered.
    const totalRevenue = (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals)
      .where(and(owner, eq(deals.status, 'signe'))))[0]?.value ?? 0;

    // Revenue of the period, attributed on signature date.
    const periodRevenue = (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals)
      .where(and(owner, eq(deals.status, 'signe'), signedInRange)))[0]?.value ?? 0;

    // Open pipeline: money still in flight, which nothing summed before.
    const openPipeline = (await db.select({ value: sql<number>`COALESCE(SUM(${deals.amount}), 0)` }).from(deals)
      .where(and(owner, eq(deals.status, 'en_cours'))))[0]?.value ?? 0;

    res.json({
      range,
      total: totalDeals,
      signed: signedDeals,
      totalRevenue: Number(totalRevenue),
      periodRevenue: Number(periodRevenue),
      openPipeline: Number(openPipeline),
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
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: 'Deal non trouvé' });
      return;
    }
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
    const targetId = parseId(req.params.id);
    if (targetId === null) {
      res.status(404).json({ error: 'Deal non trouvé' });
      return;
    }
    const deleted = await db.delete(deals).where(eq(deals.id, targetId)).returning({ id: deals.id });
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
