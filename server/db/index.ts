import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../data/crm.db');

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'demarcheur' NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    activity TEXT,
    city TEXT,
    google_rating REAL,
    google_reviews INTEGER,
    has_site TEXT DEFAULT 'non',
    site_url TEXT,
    site_status TEXT DEFAULT 'pas_de_site',
    source TEXT DEFAULT 'google_maps',
    place_id TEXT,
    latitude REAL,
    longitude REAL,
    detail_url TEXT,
    stage TEXT DEFAULT 'identifie',
    assigned_to INTEGER REFERENCES users(id),
    objection TEXT,
    notes TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id),
    user_id INTEGER REFERENCES users(id),
    date INTEGER DEFAULT (unixepoch()),
    duration INTEGER,
    result TEXT NOT NULL,
    objection TEXT,
    notes TEXT,
    next_step TEXT
  );

  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id),
    amount REAL,
    site_type TEXT DEFAULT 'vitrine_simple',
    status TEXT DEFAULT 'en_cours',
    assigned_to INTEGER REFERENCES users(id),
    created_at INTEGER DEFAULT (unixepoch()),
    signed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_contact_id INTEGER REFERENCES contacts(id),
    referred_name TEXT,
    referred_phone TEXT,
    referred_email TEXT,
    referred_contact_id INTEGER REFERENCES contacts(id),
    status TEXT DEFAULT 'contacte',
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(stage);
  CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
  CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(city);
  CREATE INDEX IF NOT EXISTS idx_contacts_rating ON contacts(google_rating);
  CREATE INDEX IF NOT EXISTS idx_contacts_reviews ON contacts(google_reviews);
  CREATE INDEX IF NOT EXISTS idx_calls_contact ON calls(contact_id);
  CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(date);
  CREATE INDEX IF NOT EXISTS idx_calls_user ON calls(user_id);
  CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
  CREATE INDEX IF NOT EXISTS idx_deals_assigned ON deals(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_referrals_source ON referrals(source_contact_id);
`);

const contactCols = (sqlite.prepare('PRAGMA table_info(contacts)').all() as any[]).map(c => c.name);
if (!contactCols.includes('place_id')) {
  sqlite.exec(`ALTER TABLE contacts ADD COLUMN place_id TEXT`);
  sqlite.exec(`ALTER TABLE contacts ADD COLUMN latitude REAL`);
  sqlite.exec(`ALTER TABLE contacts ADD COLUMN longitude REAL`);
  sqlite.exec(`ALTER TABLE contacts ADD COLUMN detail_url TEXT`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_place_id ON contacts(place_id)`);
}

export const db = drizzle(sqlite, { schema });
export default db;
