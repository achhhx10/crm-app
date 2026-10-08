import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { referrals, contacts } from '../db/schema.js';
import { eq, desc, count, sql, and } from 'drizzle-orm';
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

router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let allReferrals, totalResult;
    if (isAdmin(req)) {
      allReferrals = db.select().from(referrals).orderBy(desc(referrals.createdAt)).limit(limit).offset(offset).all();
      totalResult = db.select({ value: count() }).from(referrals).get()?.value || 0;
    } else {
      const userContactIds = db.select({ id: contacts.id }).from(contacts)
        .where(eq(contacts.assignedTo, req.user!.userId)).all().map((r: any) => r.id);
      if (userContactIds.length === 0) {
        allReferrals = [];
        totalResult = 0;
      } else {
        const contactFilter = sql`${referrals.sourceContactId} IN (${sql.join(userContactIds.map((id: number) => sql`${id}`), sql`, `)})`;
        allReferrals = db.select().from(referrals)
          .where(contactFilter)
          .orderBy(desc(referrals.createdAt)).limit(limit).offset(offset).all();
        totalResult = db.select({ value: count() }).from(referrals).where(contactFilter).get()?.value || 0;
      }
    }
    res.json({ referrals: allReferrals, total: totalResult, page, limit });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/contact/:contactId', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req)) {
      const contact = db.select().from(contacts).where(eq(contacts.id, Number(req.params.contactId))).get();
      if (!contact || (contact.assignedTo !== null && contact.assignedTo !== req.user!.userId)) {
        res.status(403).json({ error: 'Accès interdit' });
        return;
      }
    }
    const contactReferrals = db.select().from(referrals)
      .where(eq(referrals.sourceContactId, Number(req.params.contactId)))
      .orderBy(desc(referrals.createdAt))
      .all();

    const total = contactReferrals.length;
    const signed = contactReferrals.filter(r => r.status === 'signe').length;

    res.json({ referrals: contactReferrals, total, signed });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/stats', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    let totalReferrals, signedReferrals;

    if (isAdmin(req)) {
      totalReferrals = db.select({ value: count() }).from(referrals).get()?.value || 0;
      signedReferrals = db.select({ value: count() }).from(referrals)
        .where(eq(referrals.status, 'signe')).get()?.value || 0;
    } else {
      const userContactIds = db.select({ id: contacts.id }).from(contacts)
        .where(eq(contacts.assignedTo, req.user!.userId)).all().map((r: any) => r.id);
      if (userContactIds.length === 0) {
        totalReferrals = 0;
        signedReferrals = 0;
      } else {
        const contactFilter = sql`${referrals.sourceContactId} IN (${sql.join(userContactIds.map((id: number) => sql`${id}`), sql`, `)})`;
        totalReferrals = db.select({ value: count() }).from(referrals).where(contactFilter).get()?.value || 0;
        signedReferrals = db.select({ value: count() }).from(referrals)
          .where(and(contactFilter, eq(referrals.status, 'signe'))).get()?.value || 0;
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

router.post('/', authMiddleware, validate(referralSchema), (req: AuthRequest, res: Response) => {
  try {
    const { sourceContactId, referredName, referredPhone, referredEmail } = req.body;

    if (!sourceContactId || !referredName) {
      res.status(400).json({ error: 'sourceContactId et referredName requis' });
      return;
    }

    if (!isAdmin(req)) {
      const contact = db.select().from(contacts).where(eq(contacts.id, Number(sourceContactId))).get();
      if (!contact || (contact.assignedTo !== null && contact.assignedTo !== req.user!.userId)) {
        res.status(403).json({ error: 'Accès interdit' });
        return;
      }
    }

    const result = db.insert(referrals).values({
      sourceContactId: Number(sourceContactId),
      referredName,
      referredPhone: referredPhone || null,
      referredEmail: referredEmail || null,
    }).run();

    const referral = db.select().from(referrals).where(eq(referrals.id, Number(result.lastInsertRowid))).get();
    res.json(referral);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = db.select().from(referrals).where(eq(referrals.id, id)).get();
    if (!existing) {
      res.status(404).json({ error: 'Recommandation non trouvée' });
      return;
    }

    if (!isAdmin(req)) {
      const contact = db.select().from(contacts).where(eq(contacts.id, existing.sourceContactId)).get();
      if (!contact || (contact.assignedTo !== null && contact.assignedTo !== req.user!.userId)) {
        res.status(403).json({ error: 'Accès interdit' });
        return;
      }
    }

    const updates: Record<string, any> = {};
    for (const f of REFERRAL_UPDATE_FIELDS) {
      if (f in req.body) updates[f] = req.body[f];
    }

    db.update(referrals).set(updates).where(eq(referrals.id, id)).run();
    const referral = db.select().from(referrals).where(eq(referrals.id, id)).get();
    res.json(referral);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
