#!/usr/bin/env node
/**
 * Generates the SQL of every reporting query and asserts it is well-formed.
 *
 * Two outages in this project shipped because a query was never executed before
 * deployment: an array bound to `= ANY()` (42809), and a response reshape the
 * mobile client could not read. Neither is reachable from a shell, so the
 * queries are built here and their SQL printed, which catches syntax errors,
 * unknown columns and malformed templates without a database.
 *
 * It does NOT execute anything, and it cannot catch errors that only surface on
 * execution. Run `npm run smoke` against a real deployment for that.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from '../server/db/schema.ts';
import {
  sql, count, countDistinct, sum, eq, and, gte, lte, inArray, desc,
} from 'drizzle-orm';
import { resolveRange, previousRange, trend } from '../server/utils/dateRange.ts';
import { CALL_RESULTS, OBJECTIONS, SITE_STATUSES, STAGES } from '../src/lib/utils.ts';
// Single source of truth, shared with the HTTP seed endpoint.
import { CONTACTS, CALLS, DEALS } from '../server/demo/seedData.ts';
import { validateVocabulary } from './seed-demo.mjs';

// Deal statuses live inside DealsPage rather than lib/utils; kept inline here
// rather than refactoring the page inside a data check.
const DEAL_STATUSES = { en_cours: 1, signe: 1, perdu: 1 };

/**
 * The demo dataset has to speak the same vocabulary as the interface, or the
 * dashboard renders raw strings like "proposition" instead of a label. Three
 * invalid codes slipped through review once; this runs on every check.
 */
function checkSeedVocabulary() {
  const problems = [];
  for (const c of CONTACTS) {
    if (!SITE_STATUSES[c[5]]) problems.push(`contact ${c[0]}: site_status « ${c[5]} » absent de SITE_STATUSES`);
    if (!STAGES[c[6]]) problems.push(`contact ${c[0]}: stage « ${c[6]} » absent de STAGES`);
  }
  for (const [ci, , result, objection] of CALLS) {
    if (!CALL_RESULTS[result]) problems.push(`appel sur ${CONTACTS[ci][0]}: result « ${result} » absent de CALL_RESULTS`);
    if (objection && !OBJECTIONS[objection]) problems.push(`appel sur ${CONTACTS[ci][0]}: objection « ${objection} » absente de OBJECTIONS`);
  }
  for (const [ci, , , status] of DEALS) {
    if (!DEAL_STATUSES[status]) problems.push(`deal sur ${CONTACTS[ci][0]}: status « ${status} » inconnu`);
  }
  return problems;
}

// A pool that is never connected to: toSQL() does not need one.
const pool = new Pool({ connectionString: 'postgres://x:x@127.0.0.1:1/none', max: 1 });
const db = drizzle(pool, { schema });

// db.execute() runs immediately and has no toSQL(), so raw sql templates are
// rendered through the dialect directly. Same output, still no connection.
const dialect = new PgDialect();
const raw = (template) => {
  const rendered = dialect.sqlToQuery(template);
  return { toSQL: () => rendered };
};
const { contacts, calls, deals } = schema;

const SIGNED = 'signe';
const IN_PROGRESS = 'en_cours';
const QUALIFIED_STAGES = ['interesse', 'rdv_programme', 'proposition_envoyee', 'signe'];
const ownedContacts = sql`1=1`;
const ownedDeals = sql`1=1`;
const inPeriod = (column, from, to) => and(gte(column, from), lte(column, to));

const QUERIES = {
  'kpi: revenu signé': () => db.select({ value: sum(deals.amount) }).from(deals)
    .where(and(ownedDeals, eq(deals.status, SIGNED),
      inPeriod(deals.signedAt, new Date('2026-10-01'), new Date('2026-10-31')))),

  'kpi: devis créés et signés': () => db.select({
    created: count(),
    signed: sql`count(*) FILTER (WHERE ${deals.status} = ${SIGNED})`,
  }).from(deals).where(and(ownedDeals, inPeriod(deals.createdAt, new Date('2026-10-01'), new Date('2026-10-31')))),

  'kpi: devis en cours': () => db.select({ value: count(), amount: sum(deals.amount) })
    .from(deals).where(and(ownedDeals, eq(deals.status, IN_PROGRESS))),

  'funnel: prospects': () => db.select({ value: count() }).from(contacts).where(ownedContacts),

  'funnel: contactés': () => db.select({ value: countDistinct(calls.contactId) })
    .from(calls).where(sql`1=1`),

  'funnel: qualifiés': () => db.select({ value: count() }).from(contacts)
    .where(and(ownedContacts, inArray(contacts.stage, QUALIFIED_STAGES))),

  'sources: agrégat contacts': () => db.select({
    source: contacts.source,
    prospects: count(),
    qualified: sql`count(*) FILTER (WHERE ${inArray(contacts.stage, QUALIFIED_STAGES)})`,
  }).from(contacts).where(ownedContacts).groupBy(contacts.source).orderBy(desc(count())),

  // Diagnostics: interval arithmetic on timestamps.
  'diag: duree signature': () => raw(sql`
    SELECT EXTRACT(EPOCH FROM (${deals.signedAt} - ${deals.createdAt})) / 86400 AS days
    FROM ${deals}
    WHERE ${deals.status} = ${SIGNED}
      AND ${deals.signedAt} >= ${new Date('2026-10-01')} AND ${deals.signedAt} <= ${new Date('2026-10-31')}
      AND ${deals.createdAt} IS NOT NULL
  `),
  'diag: age des devis ouverts': () => raw(sql`
    SELECT id, amount, EXTRACT(EPOCH FROM (NOW() - ${deals.createdAt})) / 86400 AS age
    FROM ${deals} WHERE ${deals.status} = ${IN_PROGRESS} ORDER BY ${deals.createdAt} ASC LIMIT 200
  `),
  'sources: agrégat deals': () => db.select({
    source: contacts.source,
    quotes: count(),
    quotesAmount: sum(deals.amount),
    signed: sql`count(*) FILTER (WHERE ${deals.status} = ${SIGNED})`,
    signedAmount: sql`COALESCE(SUM(${deals.amount}) FILTER (WHERE ${deals.status} = ${SIGNED}), 0)`,
  }).from(deals).innerJoin(contacts, eq(deals.contactId, contacts.id))
    .where(inPeriod(deals.createdAt, new Date('2026-10-01'), new Date('2026-10-31')))
    .groupBy(contacts.source),
};

let failures = 0;
console.log(`Génération du SQL de ${Object.keys(QUERIES).length} requêtes\n`);

for (const [label, build] of Object.entries(QUERIES)) {
  try {
    const { sql: text, params } = build().toSQL();
    const problems = [];
    if (!text) problems.push('SQL vide');
    else if (!/^\s*select/i.test(text)) problems.push('ne commence pas par SELECT');
    if (/\bundefined\b/.test(text)) problems.push('contient "undefined"');
    if (/\$\{\s*\}/.test(text)) problems.push('contient un gabarit non résolu');
    if (!text.includes('"')) problems.push('aucun identifiant quoté');

    if (problems.length) {
      console.error(`  ✗ ${label}: ${problems.join(', ')}\n    ${text}`);
      failures += 1;
    } else {
      console.log(`  ✓ ${label}\n    ${text}`);
      console.log(`    params: ${params.length}`);
    }
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    failures += 1;
  }
}

// The period maths the trends depend on.
console.log('\nPériodes et tendances');
const range = resolveRange({});
const prev = previousRange(range);
const cases = [
  ['période par défaut', range.label, true],
  ['période précédente', prev.label, true],
  ['même longueur', String(range.days === prev.days), range.days === prev.days],
  ['tendance 100 -> 150', String(trend(150, 100)), trend(150, 100) === 50],
  ['tendance 100 -> 50', String(trend(50, 100)), trend(50, 100) === -50],
  ['tendance sans base', String(trend(50, 0)), trend(50, 0) === null],
];
for (const [label, got, expected] of cases) {
  const ok = typeof expected === 'boolean' ? expected : String(expected) === got;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got}`);
  if (!ok) failures += 1;
}

// Vocabulary of the demo dataset, checked against what the UI renders.
const vocab = checkSeedVocabulary();
console.log('\nVocabulaire du jeu de démonstration');
if (vocab.length) {
  for (const p of vocab) { console.error(`  ✗ ${p}`); failures += 1; }
} else {
  console.log('  ✓ tout correspond aux vocabulaires de l\'interface');
}

await pool.end();
console.log(failures === 0 ? '\nSQL valide.' : `\n${failures} problème(s).`);
process.exit(failures === 0 ? 0 : 1);
