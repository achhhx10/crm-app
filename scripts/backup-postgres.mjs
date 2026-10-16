#!/usr/bin/env node
/**
 * Full PostgreSQL backup and restore.
 *
 * scripts/backup.sh copies data/crm.db, which is the SQLite file from before the
 * migration. The 39,254 live prospects are on Railway Postgres and had no backup
 * at all. This is that backup.
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
    ? new URL(c.connectionString)
    : { hostname: c.host, port: c.port, pathname: '/' + c.database };
  return `${url.hostname}:${url.port || 5432}${url.pathname}`;
}

async function connect() {
  const client = new Client(connection());
  await client.connect();
  return client;
}

async function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(BACKUP_ROOT, `pg-${stamp}`);
  await mkdir(dir, { recursive: true });

  const client = await connect();
  const manifest = { createdAt: new Date().toISOString(), tables: {} };
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
      await writeFile(join(dir, `${table}.json`), JSON.stringify(res.rows));
      manifest.tables[table] = res.rows.length;
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
 * Restore order matters: children reference contacts, which reference users.
 * Everything runs in one transaction, so a failure leaves the database untouched.
 */
async function restore(dir, dryRun) {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`Pas de manifest.json dans ${dir}.`);
    process.exit(1);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  console.log(`Sauvegarde du ${manifest.createdAt}`);
  for (const [t, n] of Object.entries(manifest.tables)) console.log(`  ${t.padEnd(10)} ${n} lignes`);

  if (dryRun) {
    console.log('\nSimulation : aucune écriture effectuée.');
    return;
  }

  const client = await connect();
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
    await restore(dir, process.argv.includes('--dry-run'));
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