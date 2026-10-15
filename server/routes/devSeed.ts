import { Router, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { contacts, deals, users } from '../db/schema.js';
import { eq, sql, count } from 'drizzle-orm';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { CONTACTS, CALLS, DEALS, daysAgo, DEMO_SOURCE } from '../demo/seedData.js';

/**
 * Demo seeding over HTTP.
 *
 * The alternative was opening a Railway TCP proxy on the production database,
 * which exposes Postgres publicly for the duration of the operation. That was
 * attempted four times and failed; this keeps the database closed.
 *
 * The router answers 404 for everything when DEV_SEED_TOKEN is unset, so in a
 * normal deployment these paths do not exist. When it is set, a correct token
 * AND an admin session are both required: an attacker needs both.
 */

const router = Router();

const TOKEN = process.env.DEV_SEED_TOKEN;

function build(): Router {
  if (!TOKEN) {
    // Not "forbidden": the routes do not exist in a normal deployment.
    router.use((_req, res) => res.status(404).json({ error: 'Introuvable' }));
    return router;
  }

  const expected = Buffer.from(TOKEN);

  const requireSeedToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const given = Buffer.from(req.header('x-dev-token') || '');
    // timingSafeEqual throws when lengths differ, so compare first.
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      res.status(403).json({ error: 'Jeton invalide' });
      return;
    }
    next();
  };

  async function demoContactCount(): Promise<number> {
    const row = await db.select({ value: count() }).from(contacts).where(eq(contacts.source, DEMO_SOURCE));
    return Number(row[0]?.value ?? 0);
  }

  router.post(
    '/seed-demo',
    authMiddleware,
    requireSeedToken,
    requireRole('admin'),
    async (_req: AuthRequest, res: Response) => {
      try {
        const existing = await demoContactCount();
        if (existing > 0) {
          res.status(409).json({
            error: 'Des données de démonstration existent déjà',
            existing,
            hint: 'POST /api/dev/seed-demo/undo avant de réinsérer',
          });
          return;
        }

        // Attach the activity to a real rep so non-admin views are not empty.
        const actor = (await db.select({ id: users.id }).from(users)
          .where(eq(users.role, 'admin')).limit(1))[0]?.id ?? null;

        const ids: number[] = [];

        await db.transaction(async (tx) => {
          for (const [name, person, activity, phone, city, hasSite, stage, , rating, reviews] of CONTACTS) {
            const row = await tx.insert(contacts).values({
              businessName: String(name),
              contactName: person === null ? null : String(person),
              activity: String(activity),
              phone: String(phone),
              city: String(city),
              hasSite: String(hasSite),
              siteStatus: String(hasSite),
              stage: String(stage),
              // Overwritten with the demo marker so one delete undoes everything.
              source: DEMO_SOURCE,
              googleRating: Number(rating),
              googleReviews: Number(reviews),
              createdAt: daysAgo(60),
            }).returning({ id: contacts.id });
            ids.push(row[0].id);
          }

          for (const [ci, ago, result, objection, notes, nextStep, nextIn] of CALLS) {
            const nextAt = nextIn === null ? null : daysAgo(Number(ago) - Number(nextIn));
            await tx.execute(sql`
              INSERT INTO calls (contact_id, user_id, date, duration, result, objection, notes, next_step, next_step_at)
              VALUES (
                ${ids[Number(ci)]}, ${actor}, ${daysAgo(Number(ago))}, ${45 + (Number(ago) % 5) * 30},
                ${result}, ${objection}, ${notes}, ${nextStep}, ${nextAt}
              )
            `);
          }

          for (const [ci, agoCreated, amount, status, siteType, agoSigned] of DEALS) {
            await tx.insert(deals).values({
              contactId: ids[Number(ci)],
              amount: Number(amount),
              status: String(status),
              siteType: String(siteType),
              assignedTo: actor,
              createdAt: daysAgo(Number(agoCreated)),
              signedAt: agoSigned === null ? null : daysAgo(Number(agoSigned)),
            });
          }
        });

        res.status(201).json({
          inserted: { contacts: ids.length, calls: CALLS.length, deals: DEALS.length },
          contactIds: ids,
          note: 'Dates relatives à aujourd\'hui : les tendances restent non nulles.',
        });
      } catch (error) {
        console.error('Demo seed error:', error);
        res.status(500).json({ error: 'Échec de l\'insertion' });
      }
    },
  );

  /**
   * One delete. calls and deals cascade from contacts, so tagging the contacts
   * is enough to remove the whole dataset and nothing else. A genuine call
   * logged against a demo contact during the validation window goes with it,
   * which is the intended clean-slate behaviour.
   */
  router.post(
    '/seed-demo/undo',
    authMiddleware,
    requireSeedToken,
    requireRole('admin'),
    async (_req: AuthRequest, res: Response) => {
      try {
        const removed = await db
          .delete(contacts)
          .where(eq(contacts.source, DEMO_SOURCE))
          .returning({ id: contacts.id });
        res.json({ removed: removed.length, note: 'Appels et deals retirés en cascade.' });
      } catch (error) {
        console.error('Demo seed undo error:', error);
        res.status(500).json({ error: 'Échec de la suppression' });
      }
    },
  );

  return router;
}

build();

export default router;