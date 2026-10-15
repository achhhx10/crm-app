#!/usr/bin/env node
/**
 * Fallback seeding path, straight to Postgres.
 *
 * The HTTP endpoint (POST /api/dev/seed-demo) is the primary path and does not
 * require exposing the database. This script exists for the case where the
 * endpoint is disabled; it needs a Railway TCP proxy, which publishes Postgres
 * publicly for as long as it exists, so delete the proxy straight afterwards.
 *
 *   railway domain --service Postgres --port 5432
 *   export PGHOST=... PGPORT=5432 PGUSER=postgres PGDATABASE=railway
 *   export PGPASSWORD="$(railway variables --service Postgres --kv | grep '^PGPASSWORD=' | cut -d= -f2-)"
 *   npm run seed:demo -- --dry-run
 *   npm run seed:demo
 *   npm run seed:demo -- --undo
 *   railway domain delete "$PGHOST" --service Postgres --yes
 */
import pg from 'pg';
import { pathToFileURL } from 'node:url';

// Same dataset the HTTP endpoint uses, anchored to today.
import { CONTACTS, CALLS, DEALS, daysAgo, DEMO_SOURCE } from '../server/demo/seedData.ts';
import { CALL_RESULTS, OBJECTIONS, SITE_STATUSES, STAGES } from '../src/lib/utils.ts';

const { Client } = pg;

// Declared inside DealsPage rather than lib/utils; kept inline rather than
// refactoring the page from inside a script.
const DEAL_STATUSES = { en_cours: 1, signe: 1, perdu: 1 };

const undo = process.argv.includes('--undo');
const dryRun = process.argv.includes('--dry-run');

/**
 * Returns every value the interface would render as a raw string. Pure, so that
 * importing this module (check-sql does) has no side effect.
 */
export function validateVocabulary() {
  const problems = [];
  for (const c of CONTACTS) {
    if (!SITE_STATUSES[c[5]]) problems.push(`contact ${c[0]}: site_status « ${c[5]} » inconnu`);
    if (!STAGES[c[6]]) problems.push(`contact ${c[0]}: stage « ${c[6]} » inconnu`);
  }
  for (const [ci, , result, objection] of CALLS) {
    if (!CALL_RESULTS[result]) problems.push(`appel sur ${CONTACTS[ci][0]}: result « ${result} » inconnu`);
    if (objection && !OBJECTIONS[objection]) problems.push(`appel sur ${CONTACTS[ci][0]}: objection « ${objection} » inconnue`);
  }
  for (const [ci, , , status] of DEALS) {
    if (!DEAL_STATUSES[status]) problems.push(`deal sur ${CONTACTS[ci][0]}: status « ${status} » inconnu`);
  }
  return problems;
}

function assertVocabulary() {
  const problems = validateVocabulary();
  if (!problems.length) return;
  console.error('Vocabulaire incohérent avec l\'application :');
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}

/**
 * PG* first, DATABASE_URL only as a fallback. A DATABASE_URL left over from an
 * older shell session silently overrides everything else and fails with an
 * unhelpful ERR_INVALID_URL.
 */
function connection() {
  const { PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD, DATABASE_URL } = process.env;
  if (PGHOST && PGUSER) {
    return {
      host: PGHOST,
      port: Number(PGPORT || 5432),
      user: PGUSER,
      database: PGDATABASE || 'railway',
      password: PGPASSWORD,
    };
  }
  if (DATABASE_URL) return { connectionString: DATABASE_URL };
  console.error(
    'Connexion Postgres requise :\n' +
    '  export PGHOST=... PGPORT=5432 PGUSER=postgres PGDATABASE=railway\n' +
    '  export PGPASSWORD="$(railway variables --service Postgres --kv | grep \'^PGPASSWORD=\' | cut -d= -f2-)"',
  );
  process.exit(2);
}

async function main() {
  assertVocabulary();

  if (dryRun) {
    const sources = new Set(CONTACTS.map(c => c[7]));
    const stages = new Set(CONTACTS.map(c => c[6]));
    console.log(
      `Mode simulation — ${CONTACTS.length} contacts, ${CALLS.length} appels, ${DEALS.length} deals.\n` +
      `Période : ${daysAgo(60).toISOString().slice(0, 10)} → ${daysAgo(0).toISOString().slice(0, 10)}\n` +
      `Origines : ${[...sources].join(', ')}\n` +
      `Étapes   : ${[...stages].join(', ')}\n` +
      `Relances : ${CALLS.filter(c => c[6] !== null).length} (dont ${CALLS.filter(c => c[6] !== null && Number(c[6]) < 0).length} en retard)`,
    );
    return;
  }

  const client = new Client({ ...connection(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const probe = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('contacts','calls','deals')`,
    );
    if (probe.rows[0].n !== 3) {
      console.error(`Cette base ne ressemble pas au schéma du CRM (${probe.rows[0].n}/3 tables). Abandon.`);
      process.exit(1);
    }

    const existing = await client.query(
      `SELECT count(*)::int AS n FROM contacts WHERE source = $1`, [DEMO_SOURCE],
    );
    if (existing.rows[0].n > 0) {
      console.error(`${existing.rows[0].n} contacts de démonstration déjà présents. Lance d'abord --undo.`);
      process.exit(1);
    }

    await client.query('BEGIN');

    if (undo) {
      const res = await client.query(`DELETE FROM contacts WHERE source = $1 RETURNING id`, [DEMO_SOURCE]);
      await client.query('COMMIT');
      console.log(`${res.rowCount} contacts de démonstration supprimés, avec leurs appels et deals (cascade).`);
      return;
    }

    const actor = (await client.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`))
      .rows[0]?.id ?? null;

    const ids = [];
    for (const [name, person, activity, phone, city, hasSite, stage, , rating, reviews] of CONTACTS) {
      const res = await client.query(
        `INSERT INTO contacts
           (business_name, contact_name, activity, phone, city, has_site, site_status,
            stage, source, google_rating, google_reviews, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [name, person, activity, phone, city, hasSite, hasSite, stage, DEMO_SOURCE, rating, reviews, daysAgo(60)],
      );
      ids.push(res.rows[0].id);
    }

    for (const [ci, ago, result, objection, notes, nextStep, nextIn] of CALLS) {
      const nextAt = nextIn === null ? null : daysAgo(Number(ago) - Number(nextIn));
      await client.query(
        `INSERT INTO calls (contact_id, user_id, date, duration, result, objection, notes, next_step, next_step_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ids[Number(ci)], actor, daysAgo(Number(ago)), 45 + (Number(ago) % 5) * 30, result, objection, notes, nextStep, nextAt],
      );
    }

    for (const [ci, agoCreated, amount, status, siteType, agoSigned] of DEALS) {
      await client.query(
        `INSERT INTO deals (contact_id, amount, site_type, status, assigned_to, created_at, signed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [ids[Number(ci)], amount, status, siteType, actor, daysAgo(Number(agoCreated)),
         agoSigned === null ? null : daysAgo(Number(agoSigned))],
      );
    }

    await client.query('COMMIT');
    console.log(
      `Démonstration insérée : ${ids.length} contacts, ${CALLS.length} appels, ${DEALS.length} deals ` +
      `(rattachés à l'admin ${actor ?? '—'}).`,
    );
    console.log(`Période : ${daysAgo(60).toISOString().slice(0, 10)} → ${daysAgo(0).toISOString().slice(0, 10)}`);
    console.log('Vérifie le dashboard, puis : npm run seed:demo -- --undo');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Échec du seed :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Importing this module must not open a connection: check-sql reads the data.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}