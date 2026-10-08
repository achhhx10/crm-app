import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const preparedCsv = path.join(dataDir, 'leads/prepared.csv');
const dbPath = path.join(dataDir, 'crm.db');

import Database from 'better-sqlite3';
const db = new Database(dbPath, { readonly: true });

const raw = fs.readFileSync(preparedCsv, 'utf-8');
const leads = parse(raw, { columns: true, skip_empty_lines: true }) as any[];

const crm = db.prepare('SELECT business_name, phone, city, place_id FROM contacts').all() as any[];

const crmPlaceIds = new Set<string>();
const crmPhones = new Set<string>();
const crmNameCity = new Set<string>();
for (const c of crm) {
  if (c.place_id) crmPlaceIds.add(c.place_id);
  if (c.phone && c.phone.trim()) crmPhones.add(c.phone.replace(/\D/g, ''));
  const key = `${(c.business_name || '').toLowerCase().trim()}|${(c.city || '').toLowerCase().trim()}`;
  crmNameCity.add(key);
}

const skipPlace = [] as any[];
const skipPhone = [] as any[];
const skipNameCity = [] as any[];
const toImport = [] as any[];
let i = 0;

for (const row of leads) {
  i++;
  const pid = row.place_id;
  const phoneNorm = row.phone_norm;
  const nameCityKey = `${row.business_name.toLowerCase().trim()}|${row.city.toLowerCase().trim()}`;

  if (pid && crmPlaceIds.has(pid)) { skipPlace.push({ ...row, reason: 'place_id' }); continue; }
  if (phoneNorm && crmPhones.has(phoneNorm)) { skipPhone.push({ ...row, reason: 'phone' }); continue; }
  if (crmNameCity.has(nameCityKey) && row.business_name.trim()) { skipNameCity.push({ ...row, reason: 'name+city' }); continue; }
  toImport.push(row);
}

const writeCsv = (rows: any[], file: string) => {
  const headers = Object.keys(rows[0] || {});
  const buf = [headers.join(',')];
  for (const row of rows) {
    buf.push(headers.map(h => {
      const s = row[h] === undefined ? '' : String(row[h]);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
  }
  fs.writeFileSync(file, buf.join('\n'));
};

const toImportCsv = path.join(dataDir, 'leads/to-import.csv');
writeCsv(toImport, toImportCsv);
writeCsv(skipPlace, path.join(dataDir, 'leads/skipped-place_id.csv'));
writeCsv(skipPhone, path.join(dataDir, 'leads/skipped-phone.csv'));
writeCsv(skipNameCity, path.join(dataDir, 'leads/skipped-name-city.csv'));

const report = {
  crmContacts: crm.length,
  leadsAfterDedup: leads.length,
  skip_place_id: skipPlace.length,
  skip_phone: skipPhone.length,
  skip_name_city: skipNameCity.length,
  toImport: toImport.length,
  toImportCsv,
};
fs.writeFileSync(path.join(dataDir, 'leads/skipped-report.json'), JSON.stringify(report, null, 2));

console.log(`🧠 CRM: ${crm.length} contacts`);
console.log(`📄 Leades préparés: ${leads.length}`);
console.log(`  skipped place_id  : ${skipPlace.length}`);
console.log(`  skipped phone     : ${skipPhone.length}`);
console.log(`  skipped name+city : ${skipNameCity.length}`);
console.log(`✅ À importer: ${toImport.length} → ${toImportCsv}`);

db.close();