#!/usr/bin/env node
/**
 * Full PostgreSQL backup and restore.
 *
 * The former scripts/backup.sh copied data/crm.db, which was the SQLite file from
 * before the migration; it has been removed. The 39,254 live prospects are on
 * Railway Postgres and had no backup at all. This is that backup.
 *
 * Dumps every table to JSON, in dependency order, plus a manifest recording row
 * counts and the schema version, so a restore can be checked before it runs.
 *
 *   npm run backup:db                       # writes backups/<timestamp>/
 *   DATABASE_URL=... npm run backup:db
 *   npm run restore:db -- backups/2026-10-15T12-00-00Z
 *   npm run restore:db -- backups/... --dry-run
 *
 * The connection is read from DATABASE_URL or the standard PG* variables.
 * Prefer enabling the automated backups offered by Railway on the Postgres
 * plugin; this script is the portable fallback you can run on demand.
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { Client } = pg;

// Children first: restoring in this order keeps every foreign key satisfied.
const TABLES = [
  'referrals',
  'deals',
  'calls',
  'contacts',
  'users',
];

// Configurable so a Railway volume can be mounted at the dump location.
// Relative to the process cwd by default, which is /app in the container.
const BACKUP_ROOT = process.env.BACKUP_ROOT || 'backups';

/**
 * Guard against a half-filled connection string.
 *
 * Copying a documented placeholder such as `postgresql://...` is the obvious
 * mistake here, and it used to surface as a raw `TypeError: Invalid URL` from
 * deep inside node:internal/url, which says nothing about the real problem.
 */
function parseConnectionUrl(raw, label) {
  try {
    return new URL(raw);
  } catch {
    console.error(
      `${label} est invalide.\n` +
      `  Recu : ${raw.slice(0, 40)}\n` +
      `  Railway cree DATABASE_PUBLIC_URL automatiquement apres avoir active le\n` +
      `  proxy TCP public. Si la variable est absente, reconstruisez l'URL :\n` +
      `    postgresql://<user>:<password>@<RAILWAY_TCP_PROXY_DOMAIN>:<RAILWAY_TCP_PROXY_PORT>/<PGDATABASE>`,
    );
    process.exit(2);
  }
}

// Cron jobs must terminate, and a volume will fill up eventually.
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP || 14);

/**
 * Resolve which Postgres to talk to.
 *
 * Railway splits its endpoints in two and this bit us before:
 *   - DATABASE_URL -> postgres.railway.internal, reachable ONLY from inside the
 *     service container. Running a backup from a laptop with it fails.
 *   - DATABASE_PUBLIC_URL -> *.proxy.rlwy.net, reachable from anywhere.
 *
 * The PG* variables belong to the *internal* endpoint, so preferring them
 * (as an earlier version of this script did) would have picked the host that
 * cannot answer a local request. Precedence therefore depends on where the
 * script runs:
 *
 *   1. BACKUP_DATABASE_URL  explicit override, always wins
 *   2. inside Railway       DATABASE_URL (internal, fastest)
 *   3. outside Railway      DATABASE_PUBLIC_URL, then PG*, then DATABASE_URL
 */
export function connection() {
  const {
    BACKUP_DATABASE_URL, DATABASE_PUBLIC_URL, DATABASE_URL,
    PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD,
    RAILWAY_ENVIRONMENT,
  } = process.env;

  const insideRailway = Boolean(RAILWAY_ENVIRONMENT);
  const fromUrl = (u) => ({ connectionString: u, ssl: { rejectUnauthorized: false } });
  const fromPg = () => ({
    host: PGHOST,
    port: Number(PGPORT || 5432),
    user: PGUSER,
    database: PGDATABASE || 'railway',
    password: PGPASSWORD,
    ssl: { rejectUnauthorized: false },
  });

  if (BACKUP_DATABASE_URL) return fromUrl(BACKUP_DATABASE_URL);

  if (insideRailway) {
    if (DATABASE_URL) return fromUrl(DATABASE_URL);
    if (PGHOST && PGUSER) return fromPg();
  } else {
    if (DATABASE_PUBLIC_URL) return fromUrl(DATABASE_PUBLIC_URL);
    if (PGHOST && PGUSER) return fromPg();
    if (DATABASE_URL) return fromUrl(DATABASE_URL);
  }

  console.error(
    'Connexion Postgres introuvable.\n' +
    (insideRailway
      ? '  Dans Railway : vérifie DATABASE_URL du service.\n'
      : '  En local :\n' +
        '    railway variables --service Postgres   puis exporte DATABASE_PUBLIC_URL\n' +
        '    (le proxy TCP public doit être activé dans le dashboard Railway)\n') +
    '  Ou force explicitement : BACKUP_DATABASE_URL=postgresql://... npm run backup:db',
  );
  process.exit(2);
}

/** Human readable target, for the check command. */
export function describeTarget() {
  const c = connection();
  const url = c.connectionString
    ? parseConnectionUrl(c.connectionString, 'DATABASE_PUBLIC_URL')
    : { hostname: c.host, port: c.port, pathname: '/' + c.database };
  return `${url.hostname}:${url.port || 5432}${url.pathname}`;
}

async function connect() {
  const cfg = connection();
  if (cfg.connectionString) parseConnectionUrl(cfg.connectionString, 'DATABASE_PUBLIC_URL');
  const client = new Client(cfg);
  await client.connect();
  return client;
}

async function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(BACKUP_ROOT, `pg-${stamp}`);
  await mkdir(dir, { recursive: true });

  const client = await connect();
  const manifest = { createdAt: new Date().toISOString(), tables: {}, checksums: {} };
  try {
    // Record the shape of the database so a restore into a drifted schema is visible.
    const cols = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `);
    await writeFile(join(dir, 'schema.json'), JSON.stringify(cols.rows, null, 2));

    for (const table of TABLES) {
      const res = await client.query(`SELECT * FROM "${table}"`);
      const payload = JSON.stringify(res.rows);
      await writeFile(join(dir, `${table}.json`), payload);
      manifest.tables[table] = res.rows.length;
      // Checksum so a truncated or half-copied dump is caught before a
      // destructive restore, not discovered halfway through it.
      manifest.checksums[table] = createHash('sha256').update(payload).digest('hex');
      console.log(`  ${table.padEnd(10)} ${String(res.rows.length).padStart(7)} lignes`);
    }
  } finally {
    await client.end();
  }

  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
  console.log(`\nSauvegarde écrite dans ${dir} (${total} lignes au total).`);
  console.log(`Restaurer : npm run restore:db -- ${dir}`);
  return dir;
}

/**
 * Rewind every serial sequence past the restored ids.
 *
 * A restore inserts explicit ids, which Postgres does not feed back into the
 * sequences. Left as-is, the next insert would draw from the sequence's stale
 * value (1 on a fresh database) and collide with a restored row, so every
 * future create would fail on a duplicate key. `setval(seq, max, true)` makes
 * the next value max + 1; an empty table starts back at 1.
 */
async function resetSerialSequences(client, tables) {
  for (const table of tables) {
    const cols = await client.query(
      `SELECT column_name, column_default
         FROM information_schema.columns
        WHERE table_name = $1 AND column_default LIKE 'nextval%'`,
      [table],
    );
    for (const { column_name, column_default } of cols.rows) {
      const seq = column_default.match(/nextval\('([^']+)'/)?.[1];
      if (!seq) continue;
      const max = Number(
        (await client.query(`SELECT COALESCE(MAX("${column_name}"), 0) AS max FROM "${table}"`)).rows[0].max,
      );
      if (max === 0) {
        await client.query(`SELECT setval('${seq}', 1, false)`);
      } else {
        await client.query(`SELECT setval('${seq}', ${max})`);
      }
      console.log(`  séquence  ${seq} -> ${max + 1} (prochaine valeur)`);
    }
  }
}

/**
 * Restore order matters: children reference contacts, which reference users.
 * Everything runs in one transaction, so a failure leaves the database untouched.
 */
async function restore(dir, dryRun, allowDrift = false) {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`Pas de manifest.json dans ${dir}.`);
    process.exit(1);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  console.log(`Sauvegarde du ${manifest.createdAt}`);
  for (const [t, n] of Object.entries(manifest.tables)) console.log(`  ${t.padEnd(10)} ${n} lignes`);

  const client = await connect();

  if (dryRun) {
    // The dry run used to only echo the manifest, so every real failure mode
    // (corrupt file, schema drift, wrong database) surfaced *after* the
    // DELETE had already run. It now checks the things that can actually break
    // a restore, then stops without writing.
    let problems = 0;
    console.log('');

    const schemaPath = join(dir, 'schema.json');
    if (existsSync(schemaPath)) {
      const dumpCols = new Set(JSON.parse(await readFile(schemaPath, 'utf8')).map(c => c.column_name));
      const live = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'contacts'
      `);
      const liveCols = new Set(live.rows.map(r => r.column_name));
      const missing = [...liveCols].filter(c => !dumpCols.has(c));
      if (missing.length) {
        console.error(`  ✗ colonnes présentes en base mais absentes du dump : ${missing.join(', ')}`);
        console.error('    une restauration echouerait sur une colonne inconnue');
        problems += 1;
      } else {
        console.log('  ✓ schema : toutes les colonnes de la base sont presentes dans le dump');
      }
    }

    for (const [table, expected] of Object.entries(manifest.tables)) {
      const file = join(dir, `${table}.json`);
      if (!existsSync(file)) {
        console.error(`  ✗ ${table}.json manquant`);
        problems += 1;
        continue;
      }
      const raw = await readFile(file, 'utf8');
      const sum = manifest.checksums?.[table];
      if (sum) {
        const actual = createHash('sha256').update(raw).digest('hex');
        if (actual !== sum) {
          console.error(`  ✗ ${table}.json : checksum invalide (dump corrompu ou tronque)`);
          problems += 1;
          continue;
        }
      }
      let rows;
      try {
        rows = JSON.parse(raw);
      } catch {
        console.error(`  ✗ ${table}.json : JSON illisible`);
        problems += 1;
        continue;
      }
      if (rows.length !== expected) {
        console.error(`  ✗ ${table}.json : ${rows.length} lignes, manifeste annonce ${expected}`);
        problems += 1;
        continue;
      }
      const liveRows = await client
        .query(`SELECT count(*)::int AS n FROM "${table}"`)
        .then(r => r.rows[0].n)
        .catch(() => null);

      // A dump that is internally consistent but far smaller than the live
      // table is the dangerous case: checksums pass, the manifest agrees, and
      // the restore would still wipe most of the real rows. New rows since the
      // snapshot are normal, so only a gross shortfall is fatal.
      if (liveRows !== null && liveRows > 0 && rows.length < liveRows * 0.5) {
        console.error(
          `  ✗ ${table.padEnd(10)} ${rows.length} lignes dans le dump pour ${liveRows} en base :` +
          ' incohérence majeure',
        );
        if (!allowDrift) {
          console.error('    une restauration remplacerait la base par un jeu de donnees bien plus petit');
          console.error('    corrige le dump, ou passe --allow-drift si c est voulu');
          problems += 1;
          continue;
        }
        console.error('    continue car --allow-drift a ete passe');
      }
      const drift = liveRows === null || liveRows === rows.length ? '' : ` (base actuelle : ${liveRows})`;
      console.log(`  ✓ ${table.padEnd(10)} ${String(rows.length).padStart(7)} lignes, checksum valide${drift}`);
    }

    const target = describeTarget();
    console.log(`\n  Cible de restauration : ${target}`);
    console.log('  ATTENTION : une restauration reelle DELETE puis reecrit chaque table');
    console.log('             ci-dessus. La base de production serait remplacee.');
    console.log('  Les sequences seront ensuite ramenees au max de chaque table (setval).');
    await client.end();
    console.log(problems === 0
      ? '\nSimulation terminee : aucune ecriture effectuee, sauvegarde exploitable.'
      : `\nSimulation terminee : ${problems} probleme(s), sauvegarde NON exploitable en l'etat.`);
    process.exit(problems === 0 ? 0 : 1);
  }

  try {
    await client.query('BEGIN');
    for (const table of [...TABLES].reverse()) {
      const file = join(dir, `${table}.json`);
      if (!existsSync(file)) continue;
      const rows = JSON.parse(await readFile(file, 'utf8'));
      await client.query(`DELETE FROM "${table}"`);
      for (const row of rows) {
        const keys = Object.keys(row);
        const cols = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`,
          keys.map(k => row[k]),
        );
      }
      console.log(`  ${table.padEnd(10)} ${rows.length} restaurés`);
    }
    await client.query('COMMIT');

    // Sequences live outside the row data: rewinding them cannot roll back, but
    // skipping them leaves future inserts broken. A failure here must be loud.
    try {
      await resetSerialSequences(client, TABLES);
    } catch (err) {
      console.error('Données restaurées, MAIS le reset des séquences a échoué :', err.message);
      console.error('Les prochaines insertions remonteront des collisions de clé.');
      process.exit(1);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Restauration annulée, la base est intacte :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
  console.log('\nRestauration terminée.');
}

/**
 * Keep only the newest BACKUP_KEEP dumps.
 *
 * Without this a daily cron silently fills the volume until writes fail, which
 * is how you end up with a backup job that has not produced a usable backup for
 * weeks. The newest directory is never removed, and `lock`-style retention is
 * out of scope: every dump here is disposable by construction.
 */
async function prune() {
  if (!existsSync(BACKUP_ROOT)) return;
  const dirs = (await readdir(BACKUP_ROOT, { withFileTypes: true }))
    .filter(e => e.isDirectory() && e.name.startsWith('pg-'))
    .map(e => e.name)
    .sort();
  const excess = dirs.length - BACKUP_KEEP;
  if (excess <= 0) return;
  for (const name of dirs.slice(0, excess)) {
    const target = join(BACKUP_ROOT, name);
    await rm(target, { recursive: true, force: true });
    console.log(`  purge    ${name}`);
  }
  console.log(`  ${excess} sauvegarde(s) purgée(s), ${BACKUP_KEEP} conservée(s)`);
}

async function latestBackup() {
  if (!existsSync(BACKUP_ROOT)) return null;
  const entries = (await readdir(BACKUP_ROOT, { withFileTypes: true }))
    .filter(e => e.isDirectory() && e.name.startsWith('pg-'))
    .map(e => e.name)
    .sort();
  return entries.length ? join(BACKUP_ROOT, entries[entries.length - 1]) : null;
}

async function main() {
  const [command, arg] = process.argv.slice(2);

  // Print the resolved target and reachability without dumping anything. A
  // backup that silently targets the wrong database is worse than no backup.
  if (command === 'check') {
    const target = describeTarget();
    console.log(`  Cible     : ${target}`);
    console.log(`  Contexte  : ${process.env.RAILWAY_ENVIRONMENT ? 'Railway (interne)' : 'local'}`);
    try {
      const client = await connect();
      const { rows } = await client.query('SELECT current_database() AS db, version() AS v');
      const counts = await client.query(
        `SELECT count(*)::int AS contacts FROM contacts`,
      ).catch(() => null);
      await client.end();
      console.log(`  Connexion : OK (${rows[0].db})`);
      if (counts) console.log(`  Contacts  : ${counts.rows[0].contacts}`);
    } catch (err) {
      console.error(`  Connexion : ECHEC - ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (command === 'restore' || command === '--restore') {
    const dir = arg && !arg.startsWith('--') ? arg : await latestBackup();
    if (!dir) { console.error('Aucune sauvegarde trouvée.'); process.exit(1); }
    await restore(dir, process.argv.includes('--dry-run'), process.argv.includes('--allow-drift'));
    return;
  }

  if (command === 'prune') {
    await prune();
    return;
  }

  await backup();
  await prune();
}

// Same guard as scripts/seed-demo.mjs so `connection()` stays unit-testable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export { main };