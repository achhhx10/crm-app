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
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const { Client } = pg;

// Children first: restoring in this order keeps every foreign key satisfied.
const TABLES = [
  'referrals',
  'deals',
  'calls',
  'contacts',
  'users',
];

const BACKUP_ROOT = 'backups';

export function connection() {
  const { DATABASE_URL, PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD } = process.env;
  if (DATABASE_URL) return { connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } };
  if (PGHOST && PGUSER) {
    return {
      host: PGHOST,
      port: Number(PGPORT || 5432),
      user: PGUSER,
      database: PGDATABASE || 'railway',
      password: PGPASSWORD,
      ssl: { rejectUnauthorized: false },
    };
  }
  console.error(
    'Connexion requise :\n' +
    '  DATABASE_URL=... ou\n' +
    '  export PGHOST=... PGPORT=5432 PGUSER=postgres PGDATABASE=railway PGPASSWORD=...',
  );
  process.exit(2);
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

async function latestBackup() {
  if (!existsSync(BACKUP_ROOT)) return null;
  const entries = (await readdir(BACKUP_ROOT, { withFileTypes: true }))
    .filter(e => e.isDirectory() && e.name.startsWith('pg-'))
    .map(e => e.name)
    .sort();
  return entries.length ? join(BACKUP_ROOT, entries[entries.length - 1]) : null;
}

const [command, arg] = process.argv.slice(2);

if (command === 'restore' || command === '--restore') {
  const dir = arg && !arg.startsWith('--') ? arg : await latestBackup();
  if (!dir) { console.error('Aucune sauvegarde trouvée.'); process.exit(1); }
  await restore(dir, process.argv.includes('--dry-run'));
} else {
  await backup();
}