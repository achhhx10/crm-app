import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { eq, desc, asc, sql, and, count, or, isNull, inArray } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const contactSchema = z.object({
  businessName: z.string().min(1, 'Le nom du commerce est requis'),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  activity: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  googleRating: z.number().min(0).max(5).optional().nullable(),
  googleReviews: z.number().int().optional().nullable(),
  hasSite: z.string().optional(),
  siteUrl: z.string().url().optional().or(z.literal('')).nullable(),
  siteStatus: z.string().optional(),
  source: z.string().optional(),
  stage: z.string().optional(),
  objection: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedTo: z.number().int().optional()
}).partial();

const VALID_STAGES = ['identifie', 'contacte', 'interesse', 'rdv_programme', 'proposition_envoyee', 'signe', 'perdu'];

const router = Router();

function isAdmin(req: AuthRequest): boolean {
  return req.user?.role === 'admin';
}

function ownershipCondition(userId: number) {
  return or(eq(contacts.assignedTo, userId), isNull(contacts.assignedTo));
}

const CONTACT_UPDATE_FIELDS = [
  'businessName', 'contactName', 'phone', 'email', 'activity', 'city',
  'googleRating', 'googleReviews', 'hasSite', 'siteUrl', 'siteStatus',
  'source', 'stage', 'objection', 'notes',
];

function pickAllowedFields(body: any, fields: string[]) {
  const picked: Record<string, any> = {};
  for (const f of fields) {
    if (f in body) picked[f] = body[f];
  }
  return picked;
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { search, stage, assignedTo, activity, minRating, hasSite, city, reach, minReviews, hasReviews, sortBy, sortDir } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    let query = db.select().from(contacts);
    let countQuery = db.select({ value: count() }).from(contacts);

    const conditions = [];

    if (!isAdmin(req)) {
      conditions.push(ownershipCondition(req.user!.userId));
    }

    if (search && typeof search === 'string') {
      conditions.push(
        sql`(${contacts.businessName} LIKE ${'%' + search + '%'} OR ${contacts.contactName} LIKE ${'%' + search + '%'} OR ${contacts.city} LIKE ${'%' + search + '%'} OR ${contacts.activity} LIKE ${'%' + search + '%'})`
      );
    }
    if (stage && typeof stage === 'string') {
      conditions.push(eq(contacts.stage, stage));
    }
    if (assignedTo && typeof assignedTo === 'string') {
      conditions.push(eq(contacts.assignedTo, Number(assignedTo)));
    }
    if (activity && typeof activity === 'string') {
      conditions.push(eq(contacts.activity, activity));
    }
    if (minRating && typeof minRating === 'string') {
      conditions.push(sql`${contacts.googleRating} >= ${Number(minRating)}`);
    }
    if (hasSite && typeof hasSite === 'string' && hasSite !== 'all') {
      // Legacy imports store 'non' for "no site": treat it as 'pas_de_site'.
      conditions.push(
        hasSite === 'pas_de_site'
          ? inArray(contacts.hasSite, ['pas_de_site', 'non'])
          : eq(contacts.hasSite, hasSite)
      );
    }
    if (reach === 'true') {
      conditions.push(sql`${contacts.phone} IS NOT NULL AND ${contacts.phone} != ''`);
    }
    if (reach === 'false') {
      conditions.push(sql`(${contacts.phone} IS NULL OR ${contacts.phone} = '')`);
    }
    if (city === '__empty__') {
      conditions.push(sql`(${contacts.city} IS NULL OR ${contacts.city} = '')`);
    } else if (city && typeof city === 'string') {
      conditions.push(eq(contacts.city, city));
    }
    if (minReviews && typeof minReviews === 'string') {
      conditions.push(sql`${contacts.googleReviews} >= ${Number(minReviews)}`);
    }
    if (hasReviews === 'true') {
      conditions.push(sql`${contacts.googleReviews} IS NOT NULL`);
    }

    if (conditions.length > 0) {
      const whereClause = and(...conditions);
      query = query.where(whereClause) as typeof query;
      countQuery = countQuery.where(whereClause) as typeof countQuery;
    }

    const sortField = typeof sortBy === 'string' ? sortBy : 'opportunity';
    const sortDirection = sortDir === 'asc' ? asc : desc;

    const sortColumnMap: Record<string, any> = {
      businessName: contacts.businessName,
      contactName: contacts.contactName,
      phone: contacts.phone,
      city: contacts.city,
      activity: contacts.activity,
      stage: contacts.stage,
      hasSite: contacts.hasSite,
      googleRating: contacts.googleRating,
      googleReviews: contacts.googleReviews,
      created_at: contacts.createdAt,
    };

    const opportunityExpr = sql`CASE WHEN ${contacts.hasSite} = 'pas_de_site' THEN 2 ELSE 0 END
      + CASE WHEN ${contacts.phone} IS NOT NULL AND ${contacts.phone} != '' THEN 2 ELSE 0 END
      + CASE WHEN ${contacts.googleRating} >= 4.5 THEN 1 ELSE 0 END
      + CASE WHEN ${contacts.googleReviews} >= 20 THEN 1 ELSE 0 END`;

    let orderedQuery: typeof query;
    if (sortField === 'opportunity') {
      orderedQuery = query.orderBy(desc(opportunityExpr), desc(contacts.createdAt)) as typeof query;
    } else {
      const sortCol = sortColumnMap[sortField] || contacts.createdAt;
      orderedQuery = query.orderBy(sortDirection(sortCol)) as typeof query;
    }

    const allContacts = await orderedQuery.limit(limit).offset(offset);
    const total = (await countQuery)[0]?.value ?? 0;

    res.json({ contacts: allContacts, total, page, limit });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/activities', authMiddleware, async (_req, res) => {
  try {
    const rows = await db
      .select({ activity: contacts.activity })
      .from(contacts)
      .where(sql`${contacts.activity} IS NOT NULL AND ${contacts.activity} != ''`);
    const activities = rows
      .map((r: any) => r.activity)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .sort();
    res.json(activities);
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/cities', authMiddleware, async (_req, res) => {
  try {
    const rows = await db
      .select({ city: contacts.city })
      .from(contacts)
      .where(sql`${contacts.city} IS NOT NULL AND ${contacts.city} != ''`);
    const cities = rows
      .map((r: any) => r.city)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .sort();
    res.json(cities);
  } catch (error) {
    console.error('Get cities error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/export', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { search, stage, activity, minRating, hasSite, city, reach, minReviews, hasReviews } = req.query;

    let query = db.select().from(contacts);
    const conditions = [];

    if (!isAdmin(req)) {
      conditions.push(ownershipCondition(req.user!.userId));
    }

    if (search && typeof search === 'string') {
      conditions.push(
        sql`(${contacts.businessName} LIKE ${'%' + search + '%'} OR ${contacts.contactName} LIKE ${'%' + search + '%'} OR ${contacts.city} LIKE ${'%' + search + '%'} OR ${contacts.activity} LIKE ${'%' + search + '%'})`
      );
    }
    if (stage && typeof stage === 'string') conditions.push(eq(contacts.stage, stage));
    if (activity && typeof activity === 'string') conditions.push(eq(contacts.activity, activity));
    if (minRating && typeof minRating === 'string') conditions.push(sql`${contacts.googleRating} >= ${Number(minRating)}`);
    if (hasSite && typeof hasSite === 'string' && hasSite !== 'all') conditions.push(hasSite === 'pas_de_site' ? inArray(contacts.hasSite, ['pas_de_site', 'non']) : eq(contacts.hasSite, hasSite));
    if (reach === 'true') conditions.push(sql`${contacts.phone} IS NOT NULL AND ${contacts.phone} != ''`);
    if (reach === 'false') conditions.push(sql`(${contacts.phone} IS NULL OR ${contacts.phone} = '')`);
    if (city === '__empty__') conditions.push(sql`(${contacts.city} IS NULL OR ${contacts.city} = '')`);
    else if (city && typeof city === 'string') conditions.push(eq(contacts.city, city));
    if (minReviews && typeof minReviews === 'string') conditions.push(sql`${contacts.googleReviews} >= ${Number(minReviews)}`);
    if (hasReviews === 'true') conditions.push(sql`${contacts.googleReviews} IS NOT NULL`);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const allContacts = await query.limit(10000);

    const sanitize = (v: any) => {
      const s = String(v ?? '');
      // Prevent CSV formula injection
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };

    const header = 'Entreprise,Contact,Téléphone,Email,Activité,Ville,Note Google,Avis,Site,Stage\n';
    const rows = allContacts.map((c: any) =>
      [
        `"${sanitize(c.businessName).replace(/"/g, '""')}"`,
        `"${sanitize(c.contactName || '').replace(/"/g, '""')}"`,
        `"${sanitize(c.phone || '').replace(/"/g, '""')}"`,
        `"${sanitize(c.email || '').replace(/"/g, '""')}"`,
        `"${sanitize(c.activity || '').replace(/"/g, '""')}"`,
        `"${sanitize(c.city || '').replace(/"/g, '""')}"`,
        c.googleRating || '',
        c.googleReviews || '',
        `"${sanitize(c.hasSite || '').replace(/"/g, '""')}"`,
        `"${sanitize(c.stage || '').replace(/"/g, '""')}"`,
      ].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=prospects_export_${Date.now()}.csv`);
    res.send('\uFEFF' + header + rows);
  } catch (error) {
    console.error('Export contacts error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const contact = (await db.select().from(contacts).where(eq(contacts.id, Number(req.params.id))))[0];
    if (!contact) {
      res.status(404).json({ error: 'Prospect non trouvé' });
      return;
    }
    if (!isAdmin(req) && contact.assignedTo !== null && contact.assignedTo !== req.user!.userId) {
      res.status(403).json({ error: 'Accès interdit' });
      return;
    }
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, validate(contactSchema), async (req: AuthRequest, res: Response) => {
  try {
    const {
      businessName, contactName, phone, email, activity, city,
      googleRating, googleReviews, hasSite, siteUrl, siteStatus,
      source, stage, objection, notes
    } = req.body;

    if (!businessName) {
      res.status(400).json({ error: 'Le nom du commerce est requis' });
      return;
    }

    const [contact] = await db.insert(contacts).values({
      businessName,
      contactName: contactName || null,
      phone: phone || null,
      email: email || null,
      activity: activity || null,
      city: city || null,
      googleRating: googleRating ?? null,
      googleReviews: googleReviews ?? null,
      hasSite: hasSite || 'pas_de_site',
      siteUrl: siteUrl || null,
      siteStatus: siteStatus || 'pas_de_site',
      source: source || 'google_maps',
      stage: stage || 'identifie',
      assignedTo: req.user!.userId,
      objection: objection || null,
      notes: notes || null,
    }).returning();
    res.json(contact);
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/bulk-stage', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { ids, stage } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !stage) {
      res.status(400).json({ error: 'ids (array) and stage required' });
      return;
    }
    if (!VALID_STAGES.includes(stage)) {
      res.status(400).json({ error: 'Stage invalide' });
      return;
    }
    const numericIds = [...new Set(ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))];
    if (numericIds.length === 0) {
      res.status(400).json({ error: 'ids invalides' });
      return;
    }

    let targetIds: number[];
    if (isAdmin(req)) {
      targetIds = numericIds;
    } else {
      const rows = await db.select({ id: contacts.id }).from(contacts)
        .where(and(inArray(contacts.id, numericIds), ownershipCondition(req.user!.userId)));
      targetIds = rows.map((r) => r.id);
    }

    if (targetIds.length === 0) {
      res.json({ success: true, updated: 0 });
      return;
    }

    await db.update(contacts).set({ stage, updatedAt: new Date() }).where(inArray(contacts.id, targetIds));
    res.json({ success: true, updated: targetIds.length });
  } catch (error) {
    console.error('Bulk stage error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', authMiddleware, validate(contactSchema.partial()), async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = (await db.select().from(contacts).where(eq(contacts.id, id)))[0];
    if (!existing) {
      res.status(404).json({ error: 'Prospect non trouvé' });
      return;
    }

    if (!isAdmin(req) && existing.assignedTo !== null && existing.assignedTo !== req.user!.userId) {
      res.status(403).json({ error: 'Accès interdit' });
      return;
    }

    const allowed = isAdmin(req)
      ? pickAllowedFields(req.body, [...CONTACT_UPDATE_FIELDS, 'assignedTo'])
      : pickAllowedFields(req.body, CONTACT_UPDATE_FIELDS);

    const [contact] = await db.update(contacts).set({
      ...allowed,
      updatedAt: new Date(),
    }).where(eq(contacts.id, id)).returning();
    res.json(contact);
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/bulk', authMiddleware, requireRole('admin'), async (_req, res) => {
  try {
    const { ids } = _req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids (array) required' });
      return;
    }
    const numericIds = [...new Set(ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))];
    if (numericIds.length === 0) {
      res.status(400).json({ error: 'ids invalides' });
      return;
    }
    const deleted = await db.delete(contacts).where(inArray(contacts.id, numericIds)).returning({ id: contacts.id });
    res.json({ success: true, deleted: deleted.length });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (_req, res) => {
  try {
    const id = Number(_req.params.id);
    const deleted = await db.delete(contacts).where(eq(contacts.id, id)).returning({ id: contacts.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Prospect non trouvé' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
