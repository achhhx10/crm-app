import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const toImportCsv = path.join(dataDir, 'leads/to-import.csv');
const dbPath = path.join(dataDir, 'crm.db');

if (!fs.existsSync(toImportCsv)) {
  console.error(`❌ ${toImportCsv} introuvable (lance d'abord leads-dryrun.ts)`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 10000');

const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as any;
if (!admin) {
  console.error('❌ Aucun admin trouvé. Lance `npm run seed` d abord.');
  process.exit(1);
}

const raw = fs.readFileSync(toImportCsv, 'utf-8');
const rows = parse(raw, { columns: true, skip_empty_lines: true }) as any[];

const insert = db.prepare(`
  INSERT OR IGNORE INTO contacts
    (business_name, phone, activity, city, google_rating, google_reviews,
     has_site, site_url, site_status, source, place_id, latitude, longitude,
     detail_url, notes, stage, assigned_to, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'identifie', ?, ?, ?)
`);

const now = Math.floor(Date.now() / 1000);
const source = 'leads_france_20260820';
const BATCH = 2000;

let imported = 0;
let ignored = 0;
let errors = 0;
let lastPct = -1;

const runBatch = db.transaction((batch: any[]) => {
  for (const r of batch) {
    try {
      const res = insert.run(
        r.business_name.trim(),
        r.phone || null,
        r.activity || null,
        r.city || null,
        r.google_rating ? Number(r.google_rating) : null,
        r.google_reviews ? parseInt(r.google_reviews, 10) : null,
        r.has_site || 'pas_de_site',
        r.site_url || null,
        r.site_status || 'pas_de_site',
        source,
        r.place_id || null,
        r.latitude ? Number(r.latitude) : null,
        r.longitude ? Number(r.longitude) : null,
        r.detail_url || null,
        r.notes || null,
        admin.id,
        now,
        now,
      );
      if (res.changes) imported++;
      else ignored++;
    } catch (e) {
      errors++;
    }
  }
});

for (let i = 0; i < rows.length; i += BATCH) {
  runBatch(rows.slice(i, i + BATCH));
  const pct = Math.round(((i + BATCH) / rows.length) * 100);
  if (pct >= lastPct + 10) {
    console.log(`  ... ${Math.min(i + BATCH, rows.length)}/${rows.length} (${Math.min(pct, 100)}%)`);
    lastPct = pct;
  }
}

const total = db.prepare('SELECT COUNT(*) as c FROM contacts').get() as any;
const placeDup = db.prepare('SELECT COUNT(*) as c FROM (SELECT place_id FROM contacts WHERE place_id IS NOT NULL GROUP BY place_id HAVING COUNT(*) > 1)').get() as any;

console.log(`\n📊 Résumé import leads_france:`);
console.log(`   Lignes dans to-import.csv : ${rows.length}`);
console.log(`   Importés                : ${imported}`);
console.log(`   Ignorés (place_id/coll.) : ${ignored}`);
console.log(`   Erreurs                 : ${errors}`);
console.log(`   Total contacts en base  : ${total.c}`);
console.log(`   place_id en double      : ${placeDup.c}`);

fs.writeFileSync(
  path.join(dataDir, 'leads/import-report.json'),
  JSON.stringify({ input: rows.length, imported, ignored, errors, totalContacts: total.c, placeIdDup: placeDup.c }, null, 2),
);

db.close();