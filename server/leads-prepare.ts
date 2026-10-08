import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultCsv = path.join(__dirname, '../../leads_france/output/all_20260820.csv');
const csvPath = process.env.LEADS_CSV || defaultCsv;
const outDir = path.join(__dirname, '../data/leads');

if (!fs.existsSync(csvPath)) {
  console.error(`❌ CSV introuvable: ${csvPath}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const raw = fs.readFileSync(csvPath, 'utf-8');
const rows = parse(raw, { columns: true, skip_empty_lines: true }) as any[];

function normPhone(p: string): string {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  return digits === '1' ? '' : digits;
}

function extractCity(address: string): string {
  if (!address) return '';
  const m1 = address.match(/,\s*(?:\d{5}\s+)?([^,]+?),?\s*France$/i);
  if (m1) return m1[1].trim();
  const m2 = address.match(/(?:\d{5})\s+([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ\s'’-]+?)(?:,\s*\d{1,6}\s?[A-Za-z]?)?$/);
  if (m2) return m2[1].trim();
  const m3 = address.match(/(\d{5})\s+([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ\s'-]+)/);
  if (m3) return m3[2].trim();
  return '';
}

const seen = new Map<string, any>();
const cats: Record<string, string[]> = {};

for (const row of rows) {
  const pid = (row.place_id || '').trim();
  if (!pid) continue;
  if (!seen.has(pid)) {
    seen.set(pid, row);
    cats[pid] = [];
  }
  const cat = (row.category || '').trim();
  if (cat && !cats[pid].includes(cat)) cats[pid].push(cat);
}

const headers = [
  'business_name', 'phone', 'phone_norm', 'activity', 'address', 'city',
  'google_rating', 'google_reviews', 'has_site', 'site_url', 'site_status',
  'place_id', 'latitude', 'longitude', 'detail_url', 'notes',
];

const buffer: string[] = [headers.join(',')];
let badPhoneRows = 0;

for (const [pid, row] of seen) {
  const name = (row.name || '').trim();
  if (!name) continue;

  const phone = (row.phone || '').trim() || null;
  const phoneNorm = normPhone(row.phone || '');
  if (phone && !phoneNorm) badPhoneRows++;

  const catList = cats[pid];
  const activity = catList[0] || null;
  const extraCats = catList.slice(1);
  const address = (row.address || '').trim() || null;
  const city = extractCity(address || '');
  const rating = row.rating ? Number(row.rating) : null;
  const reviews = row.review_count ? parseInt(row.review_count, 10) : null;
  const website = (row.website || '').trim() || null;
  const hasSite = website ? 'site_fonctionnel' : 'pas_de_site';
  const siteStatus = website ? 'site_fonctionnel' : 'pas_de_site';
  const lat = row.latitude ? Number(row.latitude) : null;
  const lng = row.longitude ? Number(row.longitude) : null;
  const detailUrl = (row.detail_url || '').trim() || null;

  const notes = extraCats.length ? `Catégories supplémentaires: ${extraCats.join('; ')}` : '';

  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  buffer.push([
    esc(name), esc(phone), esc(phoneNorm), esc(activity), esc(address), esc(city),
    esc(rating !== null && !isNaN(rating) ? rating : ''), esc(reviews !== null && !isNaN(reviews) ? reviews : ''),
    esc(hasSite), esc(website), esc(siteStatus),
    esc(pid), esc(lat !== null && !isNaN(lat) ? lat : ''), esc(lng !== null && !isNaN(lng) ? lng : ''),
    esc(detailUrl), esc(notes),
  ].join(','));
}

const outCsv = path.join(outDir, 'prepared.csv');
fs.writeFileSync(outCsv, buffer.join('\n'));

const report = {
  inputRows: rows.length,
  uniquePlaceIds: seen.size,
  skippedDupPlaceIds: rows.length - seen.size,
  outputRows: seen.size,
  badPhoneBugRows: badPhoneRows,
  csvPath,
  outCsv,
};

fs.writeFileSync(path.join(outDir, 'prepare-report.json'), JSON.stringify(report, null, 2));
console.log(`📄 Input: ${report.inputRows} rows`);
console.log(`🧹 Dedup place_id: ${report.skippedDupPlaceIds} skipped → ${report.uniquePlaceIds} unique`);
console.log(`⚠️  Phone bug (valeur "1") : ${badPhoneRows}`);
console.log(`✅ Prepared: ${outCsv}`);