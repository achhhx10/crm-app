import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { parseId } from '../utils/paramId.js';
import { contacts, users, calls } from '../db/schema.js';
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
  dnc: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  dncReason: z.string().optional().nullable(),
  assignedTo: z.number().int().optional()
}).partial();

const VALID_STAGES = ['identifie', 'contacte', 'interesse', 'rdv_programme', 'proposition_envoyee', 'signe', 'perdu'];

/** Escape LIKE wildcards so a search for "100%" does not match everything. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, ch => '\\' + ch);
}

/** Digits only, so "022 123 45 67" can match a stored "+41 22 123 45 67". */
function digitsOnly(term: string): string {
  return term.replace(/\D/g, '');
}

const digitsPhone = sql`regexp_replace(coalesce(${contacts.phone}, ''), '[^0-9]', '', 'g')`;

/**
 * Single definition of "search", shared by the list and export routes so the two
 * can never drift apart. Covers the fields a rep actually recalls a lead by:
 * name, contact, city, trade, phone, email, notes, objection and website.
 */
function searchCondition(search: string) {
  const like = `%${escapeLike(search)}%`;
  const cols = [
    contacts.businessName,
    contacts.contactName,
    contacts.city,
    contacts.activity,
    contacts.email,
    contacts.notes,
    contacts.objection,
    contacts.siteUrl,
  ];
  const textMatches = cols.map(col => sql`${col} ILIKE ${like} ESCAPE '\\'`);

  const digits = digitsOnly(search);
  if (digits.length >= 4) {
    textMatches.push(sql`${digitsPhone} LIKE ${'%' + digits} '%'} ESCAPE '\\'`);
    // National significant number: search "22312345" against "+41221234567".
    if (digits.length >= 6) {
      textMatches.push(sql`right(${digitsPhone}, ${digits.length}) = ${digits}`);
    }
  }

  return sql`(${sql.join(textMatches.map(m => sql`(${m})`), sql` OR `)})`;
}

/**
 * Last call per contact for one page of results, scoped to the viewer for
 * non-admins. Returns a map keyed by contact id.
 *
 * Built with the query builder rather than raw SQL: `WHERE id = ANY($1)` binds a
 * JS array as a single parameter that PostgreSQL does not recognise as an array
 * (42809 "op ANY/ALL (array) requires array on right side"), which took the whole
 * contact list down. inArray() is the supported form and is already proven on the
 * bulk and export routes.
 *
 * No row cap: an incorrect count is worse than a slightly larger transfer, and
 * the IN list is index-backed on idx_calls_contact.
 */
async function loadCallInfo(ids: number[], userId: number | null): Promise<Record<number, { lastCallAt: any; lastCallResult: string; callCount: number }>> {
  if (ids.length === 0) return {};

  const conditions = [inArray(calls.contactId, ids)];
  if (userId !== null) conditions.push(eq(calls.userId, userId));

  const rows = await db
    .select({
      contactId: calls.contactId,
      date: calls.date,
      result: calls.result,
    })
    .from(calls)
    .where(and(...conditions))
    // Oldest contact first, most recent call first: the first row seen for a
    // contact is its latest call, and the rest only increment the counter.
    .orderBy(asc(calls.contactId), desc(calls.date));

  const out: Record<number, { lastCallAt: any; lastCallResult: string; callCount: number }> = {};
  for (const row of rows) {
    const key = row.contactId;
    if (key === null) continue;
    const existing = out[key];
    if (existing) {
      existing.callCount += 1;
    } else {
      out[key] = { lastCallAt: row.date, lastCallResult: row.result, callCount: 1 };
    }
  }
  return out;
}

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
  'source', 'stage', 'objection', 'notes', 'dnc', 'dncReason',
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
    const { search, stage, assignedTo, activity, minRating, hasSite, city, reach, minReviews, hasReviews, excludeCalled, called, language, dnc, archived, sortBy, sortDir } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    let query = db.select().from(contacts);
    let countQuery = db.select({ value: count() }).from(contacts);

    const conditions = [];

    if (!isAdmin(req)) {
      conditions.push(ownershipCondition(req.user!.userId));
    }

    if (search && typeof search === 'string') {
      conditions.push(searchCondition(search));
    }
    if (stage && typeof stage === 'string' && stage !== 'all') {
      conditions.push(eq(contacts.stage, stage));
    }
    // 'me' | 'unassigned' | 'all' | a user id.
    if (assignedTo && typeof assignedTo === 'string' && assignedTo !== 'all') {
      if (assignedTo === 'me') {
        conditions.push(or(eq(contacts.assignedTo, req.user!.userId), isNull(contacts.assignedTo)));
      } else if (assignedTo === 'unassigned') {
        conditions.push(isNull(contacts.assignedTo));
      } else {
        const ownerId = Number(assignedTo);
        if (Number.isInteger(ownerId) && ownerId > 0) {
          conditions.push(eq(contacts.assignedTo, ownerId));
        }
      }
    }
    if (activity && typeof activity === 'string' && activity !== 'all') {
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
    } else if (city && typeof city === 'string' && city !== 'all') {
      conditions.push(eq(contacts.city, city));
    }
    if (minReviews && typeof minReviews === 'string') {
      conditions.push(sql`${contacts.googleReviews} >= ${Number(minReviews)}`);
    }
    if (hasReviews === 'true') {
      conditions.push(sql`${contacts.googleReviews} IS NOT NULL`);
    }
    // Language filter: 'de'/'fr'/'it'/'en', or '__empty__' for undetermined.
    if (language === '__empty__') {
      conditions.push(isNull(contacts.language));
    } else if (language && typeof language === 'string' && language !== 'all') {
      conditions.push(eq(contacts.language, language));
    }
    // Archived prospects are hidden by default. contacts is the parent of calls,
    // deals and referrals with ON DELETE CASCADE, so deletion is not offered.
    if (archived === 'only') {
      conditions.push(sql`${contacts.archivedAt} IS NOT NULL`);
    } else if (archived !== 'include') {
      conditions.push(sql`${contacts.archivedAt} IS NULL`);
    }

    // Opt-out. Default ('exclude') keeps flagged businesses out of every list;
    // 'only' shows just those, so they stay reachable for auditing.
    if (dnc === 'only') {
      conditions.push(sql`${contacts.dnc} = 1`);
    } else if (dnc !== 'include') {
      conditions.push(sql`coalesce(${contacts.dnc}, 0) = 0`);
    }

    // Calling history filter. The phoning queue wants leads never called before
    // (excludeCalled), but a rep also needs the reverse: the companies they
    // already worked, which is what they were unable to find before.
    if (excludeCalled === 'true') {
      const sub = isAdmin(req)
        ? sql`SELECT 1 FROM calls WHERE calls.contact_id = ${contacts.id}`
        : sql`SELECT 1 FROM calls WHERE calls.contact_id = ${contacts.id} AND calls.user_id = ${req.user!.userId}`;
      conditions.push(sql`NOT EXISTS (${sub})`);
    } else if (called === 'only') {
      const sub = isAdmin(req)
        ? sql`SELECT 1 FROM calls WHERE calls.contact_id = ${contacts.id}`
        : sql`SELECT 1 FROM calls WHERE calls.contact_id = ${contacts.id} AND calls.user_id = ${req.user!.userId}`;
      conditions.push(sql`EXISTS (${sub})`);
    } else if (called === 'never') {
      const sub = isAdmin(req)
        ? sql`SELECT 1 FROM calls WHERE calls.contact_id = ${contacts.id}`
        : sql`SELECT 1 FROM calls WHERE calls.contact_id = ${contacts.id} AND calls.user_id = ${req.user!.userId}`;
      conditions.push(sql`NOT EXISTS (${sub})`);
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
      // Sort key for the "Dernier appel" column. Without it the header would
      // silently fall back to created_at and the arrow would lie.
      lastCall: sql`(SELECT MAX(c.date) FROM calls c WHERE c.contact_id = ${contacts.id})`,
    };

    // 'non' is the legacy value for "no site" (see hasSite handling above): count it
    // like 'pas_de_site' so legacy rows are not under-ranked, mirroring lib/utils.ts.
    const opportunityExpr = sql`CASE WHEN ${contacts.hasSite} IN ('pas_de_site','non') THEN 2 ELSE 0 END
      + CASE WHEN ${contacts.phone} IS NOT NULL AND ${contacts.phone} != '' THEN 2 ELSE 0 END
      + CASE WHEN ${contacts.googleRating} >= 4.5 THEN 1 ELSE 0 END
      + CASE WHEN ${contacts.googleReviews} >= 20 THEN 1 ELSE 0 END`;

    let orderedQuery: typeof query;
    if (sortField === 'opportunity') {
      // contacts.id as final tiebreaker keeps the order stable across fetches,
      // otherwise "lead 3 of 340" can drift between requests.
      orderedQuery = query.orderBy(desc(opportunityExpr), desc(contacts.createdAt), desc(contacts.id)) as typeof query;
    } else {
      const sortCol = sortColumnMap[sortField] || contacts.createdAt;
      orderedQuery = query.orderBy(sortDirection(sortCol)) as typeof query;
    }

    const allContacts = await orderedQuery.limit(limit).offset(offset);
    const total = (await countQuery)[0]?.value ?? 0;

    // Calling history for the rows on this page only, fetched separately so the
    // contact projection above can never lose a column.
    //
    // Enrichment must never be able to fail the primary read. An unguarded query
    // here is what turned a cosmetic column into a full outage of the prospect
    // list, so a failure degrades to "no history shown" instead of a 500.
    let callInfo: Record<number, { lastCallAt: any; lastCallResult: string; callCount: number }> = {};
    try {
      callInfo = await loadCallInfo(
        allContacts.map((c: any) => c.id),
        isAdmin(req) ? null : req.user!.userId,
      );
    } catch (err) {
      console.error('Call history enrichment failed, serving list without it:', err);
    }
    const withCalls = allContacts.map((c: any) => ({
      ...c,
      lastCallAt: callInfo[c.id]?.lastCallAt ?? null,
      lastCallResult: callInfo[c.id]?.lastCallResult ?? null,
      callCount: callInfo[c.id]?.callCount ?? 0,
    }));

    res.json({ contacts: withCalls, total, page, limit });
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
    const { search, stage, activity, minRating, hasSite, city, reach, minReviews, hasReviews, dnc, language, ids, archived } = req.query;

    let query = db.select().from(contacts);
    const conditions = [];

    if (!isAdmin(req)) {
      conditions.push(ownershipCondition(req.user!.userId));
    }

    // An explicit selection is exclusive: "export these 12 rows" exports those
    // 12 rows. Applying the filters as well would silently drop selected rows
    // that no longer match the current view.
    const selectedIds = typeof ids === 'string' && ids.length > 0
      ? ids.split(',').map(v => Number(v.trim())).filter(v => Number.isInteger(v) && v > 0)
      : [];
    const onlySelection = selectedIds.length > 0;

    if (onlySelection) {
      conditions.push(inArray(contacts.id, selectedIds));
    }

    if (!onlySelection && search && typeof search === 'string') {
      conditions.push(searchCondition(search));
    }
    if (!onlySelection) {
      if (stage && typeof stage === 'string' && stage !== 'all') conditions.push(eq(contacts.stage, stage));
      if (dnc === 'only') {
        conditions.push(sql`${contacts.dnc} = 1`);
      } else if (dnc !== 'include') {
        conditions.push(sql`coalesce(${contacts.dnc}, 0) = 0`);
      }
      // The web export used to drop the language filter entirely, so exporting
      // "German" silently returned every language.
      if (language === '__empty__') {
        conditions.push(isNull(contacts.language));
      } else if (language && typeof language === 'string' && language !== 'all') {
        conditions.push(eq(contacts.language, language));
      }
      if (activity && typeof activity === 'string') conditions.push(eq(contacts.activity, activity));
      if (minRating && typeof minRating === 'string') conditions.push(sql`${contacts.googleRating} >= ${Number(minRating)}`);
      if (hasSite && typeof hasSite === 'string' && hasSite !== 'all') conditions.push(hasSite === 'pas_de_site' ? inArray(contacts.hasSite, ['pas_de_site', 'non']) : eq(contacts.hasSite, hasSite));
      if (reach === 'true') conditions.push(sql`${contacts.phone} IS NOT NULL AND ${contacts.phone} != ''`);
      if (reach === 'false') conditions.push(sql`(${contacts.phone} IS NULL OR ${contacts.phone} = '')`);
    }
    if (!onlySelection) {
      if (city === '__empty__') conditions.push(sql`(${contacts.city} IS NULL OR ${contacts.city} = '')`);
      else if (city && typeof city === 'string' && city !== 'all') conditions.push(eq(contacts.city, city));
      if (minReviews && typeof minReviews === 'string') conditions.push(sql`${contacts.googleReviews} >= ${Number(minReviews)}`);
      if (hasReviews === 'true') conditions.push(sql`${contacts.googleReviews} IS NOT NULL`);
    }

    // Mirror the list route: a CSV export is a prospect list, so archived rows
    // stay hidden unless the caller explicitly asks for them. Without this the
    // export leaked every archived prospect the table already hides.
    if (archived === 'only') {
      conditions.push(sql`${contacts.archivedAt} IS NOT NULL`);
    } else if (archived !== 'include') {
      conditions.push(sql`${contacts.archivedAt} IS NULL`);
    }

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
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: 'Prospect non trouvé' });
      return;
    }
    const contact = (await db.select().from(contacts).where(eq(contacts.id, id)))[0];
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

router.put('/bulk-assign', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { ids, assignedTo } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids (array) requis' });
      return;
    }
    const numericIds = [...new Set(ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))];
    if (numericIds.length === 0) {
      res.status(400).json({ error: 'ids invalides' });
      return;
    }

    // null unassigns; otherwise the user must exist.
    let ownerId: number | null = null;
    if (assignedTo !== null && assignedTo !== undefined && assignedTo !== '') {
      ownerId = Number(assignedTo);
      if (!Number.isInteger(ownerId) || ownerId <= 0) {
        res.status(400).json({ error: 'assignedTo invalide' });
        return;
      }
      const owner = (await db.select({ id: users.id }).from(users).where(eq(users.id, ownerId)))[0];
      if (!owner) {
        res.status(400).json({ error: 'Utilisateur inconnu' });
        return;
      }
    }

    await db.update(contacts).set({ assignedTo: ownerId, updatedAt: new Date() })
      .where(inArray(contacts.id, numericIds));
    res.json({ success: true, updated: numericIds.length, assignedTo: ownerId });
  } catch (error) {
    console.error('Bulk assign error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', authMiddleware, validate(contactSchema.partial()), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: 'Prospect non trouvé' });
      return;
    }
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

/**
 * Bulk archive. The bulk delete removed rows outright, which cascaded into
 * calls, deals and referrals: one mis-click destroyed a prospect's whole history.
 */
router.put('/bulk-archive', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids (array) requis' });
      return;
    }
    const numericIds = [...new Set(ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))];
    if (numericIds.length === 0) {
      res.status(400).json({ error: 'ids invalides' });
      return;
    }
    const archived = await db.update(contacts)
      .set({ archivedAt: new Date(), archivedBy: req.user!.userId, updatedAt: new Date() })
      .where(and(inArray(contacts.id, numericIds), isNull(contacts.archivedAt)))
      .returning({ id: contacts.id });
    res.json({ success: true, archived: archived.length });
  } catch (error) {
    console.error('Bulk archive error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Archive, never delete.
 *
 * contacts is the parent of calls, deals and referrals with ON DELETE CASCADE,
 * so deleting a prospect destroyed its whole history irreversibly. Archiving
 * hides the lead everywhere while keeping every call, quote and referral, and
 * can be undone.
 */
router.post('/:id/archive', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id)!;
    const existing = (await db.select({ archivedAt: contacts.archivedAt })
      .from(contacts).where(eq(contacts.id, id)))[0];
    if (!existing) {
      res.status(404).json({ error: 'Prospect non trouvé' });
      return;
    }
    if (existing.archivedAt) {
      res.status(409).json({ error: 'Prospect déjà archivé' });
      return;
    }
    const [row] = await db.update(contacts)
      .set({ archivedAt: new Date(), archivedBy: req.user!.userId, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });
    res.json({ success: true, archived: row });
  } catch (error) {
    console.error('Archive contact error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/restore', authMiddleware, requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const id = Number(_req.params.id);
    const existing = (await db.select({ archivedAt: contacts.archivedAt })
      .from(contacts).where(eq(contacts.id, id)))[0];
    if (!existing) {
      res.status(404).json({ error: 'Prospect non trouvé' });
      return;
    }
    if (!existing.archivedAt) {
      res.status(409).json({ error: 'Prospect non archivé' });
      return;
    }
    await db.update(contacts)
      .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
      .where(eq(contacts.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Restore contact error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
