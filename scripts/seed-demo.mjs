#!/usr/bin/env node
/**
 * Demo dataset for validating the reporting layer.
 *
 * The production database holds no calls and no deals yet, so every KPI, funnel
 * step and trend would read zero and none of the wiring could be checked. This
 * inserts a small, deterministic dataset spanning two months so month-over-month
 * trends are non-zero and every stage of the funnel has a value.
 *
 * It is NOT part of the application and never runs on deploy. It only touches
 * the database when someone runs it explicitly, and `--undo` removes exactly
 * what it created.
 *
 *   # once, from your machine
 *   railway domain --service Postgres --port 5432
 *   export PGHOST=postgres-production-XXXX.up.railway.app PGPORT=5432
 *   export PGUSER=postgres PGDATABASE=railway
 *   export PGPASSWORD="$(railway variables --service Postgres --kv | grep '^PGPASSWORD=' | cut -d= -f2-)"
 *
 *   npm run seed:demo        # insert
 *   npm run seed:demo -- --undo   # remove, and nothing else
 *   npm run seed:demo -- --dry-run
 *
 * Demo rows are tagged contacts.source = 'demo' so they can always be told apart
 * from real data, and their ids are written to .demo-seed.json for an exact undo.
 */
import pg from 'pg';
import { pathToFileURL } from 'node:url';
// The same vocabularies the interface renders from, so demo data cannot drift
// into codes the UI displays as raw strings.
import { CALL_RESULTS, OBJECTIONS, SITE_STATUSES, STAGES } from '../src/lib/utils.ts';

// Deal statuses are declared inside DealsPage rather than in lib/utils; kept
// inline here rather than refactoring the page inside a data fix.
const DEAL_STATUSES = { en_cours: 1, signe: 1, perdu: 1 };

const { Client } = pg;

const MARKER = 'demo';
const ID_FILE = new URL('../.demo-seed.json', import.meta.url).pathname;
const undo = process.argv.includes('--undo');
const dryRun = process.argv.includes('--dry-run');


// Fixed so repeated runs are comparable and the undo list is predictable.
const day = (offset) => {
  const d = new Date('2026-09-01T09:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

export const CONTACTS = [
  ['Boulangerie Marten',        'Marten',        'boulangerie',  '+41 32 123 45 67', 'Delémont',   'pas_de_site',    'identifie',        'internet',        4.8, 52],
  ['Café du Marché',             'Aebischer',     'café',          '+41 32 987 65 43', 'Bienne',     'site_fonctionnel','interesse',       'google_maps',     4.6, 88],
  ['Garage Zenetti',             null,            'garage',        '+41 79 555 12 34', 'La Chaux',   'pas_de_site',    'contacte',        'bouche_a_oreille', 4.2, 17],
  ['Atelier Pugin SAS',          'Pugin',         'menuiserie',    '+41 26 322 11 09', 'Fribourg',   'site_fonctionnel','rdv_programme',   'linkedin',        4.9, 134],
  ['Fromagerie Rieder',          'Rieder',        'fromagerie',    '+41 27 721 45 60', 'Sion',       'pas_de_site',    'proposition_envoyee','internet',      4.4, 23],
  ['Imprimerie Vonarb',          null,            'imprimerie',    '+41 24 427 80 15', 'Sierre',     'site_vetuste',    'perdu',           'appel',           3.4, 6],
  ['Transports Dunand',          'Dunand',        'transport',     '+41 21 711 22 33', 'Lausanne',   'pas_de_site',    'signe',           'google_maps',     4.7, 61],
  ['Cave de Pfister',         'Pfister',        'vins',           '+41 27 771 09 88', 'Sion',       'site_fonctionnel','interesse',       'bouche_a_oreille', 4.5, 44],
  ['Boucherie Nicolet',          'Nicolet',       'boucherie',     '+41 32 723 44 21', 'Neuchâtel',  'pas_de_site',    'contacte',        'internet',        4.3, 29],
  ['Plomberie_absolute',        'Absolute',      'plomberie',     '+41 79 888 77 66', 'Sierre',     'pas_de_site',    'identifie',       'appel',           4.1, 11],
];

// [contactIndex, dayOffset, result, objection|null, notes, nextStep|null, nextStepDayOffset|null]
export const CALLS = [
  [0,  0, 'pas_decroche', null,                 'Pas de réponse', null, null],
  [0,  4, 'messagerie',   null,                 'Message vocal', null, null],
  [0, 11, 'pas_decroche', null,                 'Toujours injoignable', null, null],
  [1,  2, 'rdv_obtenu',   null,                 'Rendez-vous mardi 10h', 'Envoyer la proposition', 6],
  [1, 12, 'interesse',    'trop_cher',         'Budget serré cette année', 'Relancer après devis', 3],
  [2,  3, 'pas_interesse','pas_de_temps',       'Pas le temps de refaire le site', null, null],
  [2, 17, 'pas_decroche', null,                 'Aucune réponse', null, null],
  [3,  5, 'rdv_obtenu',   null,                 'Rendez-vous obtenu', null, null],
  [3, 20, 'interesse',    null,                 'Devis vitrine transmis', null, null],
  [4,  6, 'interesse',    'trop_cher',         'Compare 3 devis', null, null],
  [4, 22, 'interesse',    'faut_en_parler',    'Doit valider avec le comptable', 'Relancer le comptable', 1],
  [5,  7, 'pas_interesse','autre',             'Réponse trop évasive', null, null],
  [6,  8, 'rdv_obtenu',   null,                 'Signature validerie', null, null],
  [6, 30, 'rdv_obtenu',   null,                 'Contrat signé', null, null],
  [7,  9, 'interesse',    'trop_cher',         'Intéressé par le multilingue', null, null],
  [7, 26, 'pas_decroche', null,                 'Pas de réponse', null, null],
  [8, 13, 'pas_interesse','pas_de_temps',       'En cours de modernisation', 'Rappeler dans 2 mois', 45],
  [9, 14, 'pas_decroche', null,                 'Pas de réponse', null, null],
  [0, 40, 'pas_decroche', null,                 'Relance 2', null, null],
  [8, 41, 'pas_decroche', null,                 'Relance 2', null, null],
  [2, 42, 'pas_decroche', null,                 'Relance 2', null, null],
  [9, 43, 'pas_decroche', null,                 'Relance 2', null, null],
  [1, 44, 'pas_decroche', null,                 'Relance 2', null, null],
];

// [contactIndex, dayOffset, amount, status, siteType, signedDayOffset|null]
export const DEALS = [
  [6, 30, 6800, 'signe',     'vitrine_complete', 30],
  [3, 20, 4200, 'signe',     'vitrine_simple',   38],
  [1, 12, 3200, 'en_cours',  'vitrine_simple',   null],
  [4, 22, 9500, 'en_cours',  'ecommerce',        null],
  [7, 26, 5400, 'en_cours',  'sur_mesure',       null],
  [5,  7, 2100, 'perdu',     'vitrine_simple',   null],
];

if (dryRun) {
  assertVocabulary();
  console.log(`Mode simulation — ${CONTACTS.length} contacts, ${CALLS.length} appels, ${DEALS.length} deals.`);
  console.log(`Période : ${day(0).toISOString().slice(0, 10)} → ${day(44).toISOString().slice(0, 10)}`);
  const sources = new Set(CONTACTS.map(c => c[7]));
  const stages = new Set(CONTACTS.map(c => c[6]));
  const statuses = new Set(DEALS.map(d => d[3]));
  console.log(`Origines couvertes : ${[...sources].join(', ')}`);
  console.log(`Étapes couvertes    : ${[...stages].join(', ')}`);
  console.log(`Statuts de deal     : ${[...statuses].join(', ')}`);
  console.log(`Relances à venir    : ${CALLS.filter(c => c[6] !== null).length}`);
  process.exit(0);
}


/** Accepts either DATABASE_URL or the standard PG* variables psql uses. */
function connection() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  const { PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD } = process.env;
  if (PGHOST && PGUSER) {
    return {
      host: PGHOST,
      port: Number(PGPORT || 5432),
      user: PGUSER,
      database: PGDATABASE || 'railway',
      password: PGPASSWORD,
    };
  }
  console.error(
    'Connexion Postgres requise :\n' +
    '  export PGHOST=... PGPORT=5432 PGUSER=postgres PGDATABASE=railway\n' +
    '  export PGPASSWORD="$(railway variables --service Postgres --kv | grep \'^PGPASSWORD=\' | cut -d= -f2-)"\n' +
    'ou DATABASE_URL.',
  );
  process.exit(2);
}

/**
 * Returns every value the interface would render as a raw string. Pure: it
 * never exits, so importing this module (check-sql does) stays side-effect free
 * and each caller decides what to do with the problems.
 */
export function validateVocabulary() {
  const problems = [];
  for (const [i, c] of CONTACTS.entries()) {
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

/** Refuses to seed rather than writing values the interface cannot render. */
export function assertVocabulary() {
  const problems = validateVocabulary();
  if (problems.length) {
    console.error('Vocabulaire incohérent avec l\'application :');
    for (const p of problems) console.error('  -', p);
    process.exit(1);
  }
}

async function main() {
  assertVocabulary();
  const client = new Client({ ...connection(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // Refuse to run against anything that does not look like our schema.
    const probe = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('contacts','calls','deals')`,
    );
    if (probe.rows[0].n !== 3) {
      console.error(`Cette base ne ressemble pas au schéma du CRM (${probe.rows[0].n}/3 tables). Abandon.`);
      process.exit(1);
    }

    if (undo) {
      const previous = await client.query(`SELECT 1 FROM contacts WHERE source = $1 LIMIT 1`, [MARKER]);
      if (!previous.rows.length) {
        console.log('Aucune donnée de démo à supprimer.');
        return;
      }
      await client.query('BEGIN');
      // Cascades remove the demo calls and deals for these contacts.
      const res = await client.query(`DELETE FROM contacts WHERE source = $1 RETURNING id`, [MARKER]);
      await client.query('COMMIT');
      console.log(`${res.rowCount} contacts de démonstration supprimés, avec leurs appels et deals (cascade).`);
      return;
    }

    const existing = await client.query(`SELECT count(*)::int AS n FROM contacts WHERE source = $1`, [MARKER]);
    if (existing.rows[0].n > 0) {
      console.error(`Il existe déjà ${existing.rows[0].n} contacts de démonstration. Lance d'abord : npm run seed:demo -- --undo`);
      process.exit(1);
    }

    // Attach the demo activity to a real rep so non-admin views are not empty,
    // and so the admin's own dashboard shows the full history.
    const actor = (await client.query(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`,
    )).rows[0]?.id ?? null;

    await client.query('BEGIN');

    const contactIds = [];
    for (const [name, person, activity, phone, city, hasSite, stage, source, rating, reviews] of CONTACTS) {
      const res = await client.query(
        `INSERT INTO contacts
           (business_name, contact_name, activity, phone, city, has_site, site_status,
            stage, source, google_rating, google_reviews, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [name, person === '—' ? null : person, activity, phone, city,
         hasSite, hasSite,
         stage, source, rating, reviews, day(0)],
      );
      contactIds.push(res.rows[0].id);
    }

    let callCount = 0;
    for (const [ci, offset, result, objection, notes, nextStep, nextStepOffset] of CALLS) {
      await client.query(
        `INSERT INTO calls (contact_id, user_id, date, duration, result, objection, notes, next_step, next_step_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [contactIds[ci], actor, day(offset), 45 + (offset % 5) * 30, result, objection, notes,
         nextStep, nextStepOffset === null ? null : day(offset + nextStepOffset)],
      );
      callCount += 1;
    }

    let dealCount = 0;
    for (const [ci, offset, amount, status, siteType, signedOffset] of DEALS) {
      await client.query(
        `INSERT INTO deals (contact_id, amount, site_type, status, assigned_to, created_at, signed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [contactIds[ci], amount, siteType, status, actor, day(offset),
         signedOffset === null ? null : day(signedOffset)],
      );
      dealCount += 1;
    }

    await client.query('COMMIT');

    await import('node:fs/promises').then(fs => fs.writeFile(
      ID_FILE,
      JSON.stringify({ marker: MARKER, contactIds, seededAt: new Date().toISOString() }, null, 2),
    ));

    console.log(`Démonstration insérée : ${contactIds.length} contacts, ${callCount} appels, ${dealCount} deals${actor ? ` (rattachés à l'admin #${actor})` : ' (aucun utilisateur trouvé)'}.`);
    console.log(`Période : ${day(0).toISOString().slice(0, 10)} → ${day(44).toISOString().slice(0, 10)}`);
    console.log('Pour vérifier : npm run smoke');
    console.log('Pour tout effacer : npm run seed:demo -- --undo');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Échec du seed :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Importing this module must not open a connection: check-sql.mjs reads the
// data above without touching a database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
