import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/crm.db');
const csvPath = path.join(__dirname, '../../strasbourg_20260820.csv');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const csv = fs.readFileSync(csvPath, 'utf-8');
const lines = csv.split('\n').filter(l => l.trim());
const header = lines[0].split(',');

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function extractCity(address: string): string {
  const match = address.match(/,\s*(?:\d{5}\s+)?([^,]+),?\s*France$/i);
  if (match) return match[1].trim();
  const match2 = address.match(/(\d{5})\s+([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ\s-]+)/);
  if (match2) return match2[2].trim();
  return '';
}

interface Row {
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: string;
  review_count: string;
}

function parseRow(values: string[]): Row {
  return {
    name: values[0] || '',
    category: values[1] || '',
    address: values[2] || '',
    phone: values[3] || '',
    website: values[4] || '',
    rating: values[5] || '',
    review_count: values[6] || '',
  };
}

const insert = db.prepare(`
  INSERT INTO contacts (business_name, contact_name, phone, email, activity, city, google_rating, google_reviews, has_site, site_url, site_status, source, stage, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const checkExisting = db.prepare('SELECT id FROM contacts WHERE business_name = ?');

console.log(`🚀 Import de ${lines.length - 1} lignes depuis Strasbourg CSV...`);

let imported = 0;
let skipped = 0;
let dupes = 0;
const now = Math.floor(Date.now() / 1000);

const insertMany = db.transaction(() => {
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = parseRow(values);

    if (!row.name || row.name.trim() === '') {
      skipped++;
      continue;
    }

    const existing = checkExisting.get(row.name.trim());
    if (existing) {
      dupes++;
      continue;
    }

    const rating = row.rating ? parseFloat(row.rating) : null;
    const reviewCount = row.review_count ? parseInt(row.review_count) : null;
    const hasSiteUrl = row.website && row.website.trim() !== '';
    const city = extractCity(row.address) || 'Strasbourg';

    try {
      insert.run(
        row.name.trim(),
        null,
        row.phone.trim() || null,
        null,
        row.category.trim() || null,
        city,
        rating && !isNaN(rating) ? rating : null,
        reviewCount && !isNaN(reviewCount) ? reviewCount : null,
        hasSiteUrl ? 'site_fonctionnel' : 'pas_de_site',
        hasSiteUrl ? row.website.trim() : null,
        hasSiteUrl ? 'site_fonctionnel' : 'pas_de_site',
        'google_maps',
        'identifie',
        now,
        now
      );
      imported++;
      if (imported % 100 === 0) console.log(`  ... ${imported} importés`);
    } catch (e: any) {
      skipped++;
    }
  }
});

insertMany();

console.log(`\n📊 Résumé import Strasbourg:`);
console.log(`   Total lignes CSV: ${lines.length - 1}`);
console.log(`   Importés: ${imported}`);
console.log(`   Doublons ignorés: ${dupes}`);
console.log(`   Erreurs/lignes vides: ${skipped}`);

const total = db.prepare('SELECT COUNT(*) as c FROM contacts').get() as any;
console.log(`   Total contacts en base: ${total.c}`);

db.close();
