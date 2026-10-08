import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { referrals, contacts } from '../db/schema.js';
import { eq, desc, count, sql, and, inArray } from 'drizzle-orm';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const referralSchema = z.object({
  sourceContactId: z.number().int().positive(),
  referredName: z.string().min(1, 'Le nom est requis'),
  referredPhone: z.string().optional().nullable(),
  referredEmail: z.string().email().optional().or(z.literal('')).nullable()
});

const router = Router();

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

const REFERRAL_UPDATE_FIELDS = ['status', 'referredName', 'referredPhone', 'referredEmail', 'referredContactId'];

async function userContactIds(userId: number): Promise<number[]> {
  const rows = await db.select({ id: contacts.id }).from(contacts)
    .where(eq(contacts.assignedTo, userId));
  return rows.map((r) => r.id);
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let allReferrals: (typeof referrals.$inferSelect)[];
    let totalResult: number;
    if (isAdmin(req)) {
      allReferrals = await db.select().from(referrals).orderBy(desc(referrals.createdAt)).limit(limit).offset(offset);
      totalResult = (await db.select({ value: count() }).from(referrals))[0]?.value ?? 0;
    } else {
      const ids = await userContactIds(req.user!.userId);
      if (ids.length === 0) {
        allReferrals = [];
        totalResult = 0;
      } else {
        const contactFilter = inArray(referrals.sourceContactId, ids);
        allReferrals = await db.select().from(referrals)
          .where(contactFilter)
          .orderBy(desc(referrals.createdAt)).limit(limit).offset(offset);
        totalResult = (await db.select({ value: count() }).from(referrals).where(contactFilter))[0]?.value ?? 0;
      }
    }
    res.json({ referrals: allReferrals, total: totalResult, page, limit });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/contact/:contactId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      const contact = (await db.select().from(contacts).where(eq(contacts.id, Number(req.params.contactId))))[0];
      if (!contact || (contact.assignedTo !== null && contact.assignedTo !== req.user!.userId)) {
        res.status(403).json({ error: 'Accès interdit' });
        return;
      }
    }
    const contactReferrals = await db.select().from(referrals)
      .where(eq(referrals.sourceContactId, Number(req.params.contactId)))
      .orderBy(desc(referrals.createdAt));

    const total = contactReferrals.length;
    const signed = contactReferrals.filter(r => r.status === 'signe').length;

    res.json({ referrals: contactReferrals, total, signed });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    let totalReferrals, signedReferrals;

    if (isAdmin(req)) {
      totalReferrals = (await db.select({ value: count() }).from(referrals))[0]?.value ?? 0;
      signedReferrals = (await db.select({ value: count() }).from(referrals)
        .where(eq(referrals.status, 'signe')))[0]?.value ?? 0;
    } else {
      const ids = await userContactIds(req.user!.userId);
      if (ids.length === 0) {
        totalReferrals = 0;
        signedReferrals = 0;
      } else {
        const contactFilter = inArray(referrals.sourceContactId, ids);
        totalReferrals = (await db.select({ value: count() }).from(referrals).where(contactFilter))[0]?.value ?? 0;
        signedReferrals = (await db.select({ value: count() }).from(referrals)
          .where(and(contactFilter, eq(referrals.status, 'signe'))))[0]?.value ?? 0;
      }
    }

    res.json({
      total: totalReferrals,
      signed: signedReferrals,
      conversionRate: totalReferrals > 0 ? Math.round((signedReferrals / totalReferrals) * 100) : 0,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, validate(referralSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { sourceContactId, referredName, referredPhone, referredEmail } = req.body;

    if (!sourceContactId || !referredName) {
      res.status(400).json({ error: 'sourceContactId et referredName requis' });
      return;
    }

    if (!isAdmin(req)) {
      const contact = (await db.select().from(contacts).where(eq(contacts.id, Number(sourceContactId))))[0];
      if (!contact || (contact.assignedTo !== null && contact.assignedTo !== req.user!.userId)) {
        res.status(403).json({ error: 'Accès interdit' });
        return;
      }
    }

    const [referral] = await db.insert(referrals).values({
      sourceContactId: Number(sourceContactId),
      referredName,
      referredPhone: referredPhone || null,
      referredEmail: referredEmail || null,
    }).returning();
    res.json(referral);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = (await db.select().from(referrals).where(eq(referrals.id, id)))[0];
    if (!existing) {
      res.status(404).json({ error: 'Recommandation non trouvée' });
      return;
    }

    if (!isAdmin(req)) {
      const contact = existing.sourceContactId == null
        ? undefined
        : (await db.select().from(contacts).where(eq(contacts.id, existing.sourceContactId)))[0];
      if (!contact || (contact.assignedTo !== null && contact.assignedTo !== req.user!.userId)) {
        res.status(403).json({ error: 'Accès interdit' });
        return;
      }
    }

    const updates: Record<string, any> = {};
    for (const f of REFERRAL_UPDATE_FIELDS) {
      if (f in req.body) updates[f] = req.body[f];
    }
    if (updates.referredContactId !== undefined && updates.referredContactId !== null) {
      updates.referredContactId = Number(updates.referredContactId);
    }

    const [referral] = await db.update(referrals).set(updates).where(eq(referrals.id, id)).returning();
    res.json(referral);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
