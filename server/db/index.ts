import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('FATAL: DATABASE_URL must be set. Example: postgres://user:password@localhost:5432/crm');
  process.exit(1);
}

export const pool = new Pool({ connectionString, max: 10 });
pool.on('error', (err) => {
  console.error('PG pool error:', err);
});

export const db = drizzle(pool, { schema });

// Bootstrap DDL so a fresh database works on first boot (no separate migrate step).
async function initSchema() {
  await pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'demarcheur' NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
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
    place_id TEXT UNIQUE,
    latitude REAL,
    longitude REAL,
    detail_url TEXT,
    stage TEXT DEFAULT 'identifie',
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    objection TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS calls (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    date TIMESTAMP DEFAULT NOW(),
    duration INTEGER,
    result TEXT NOT NULL,
    objection TEXT,
    notes TEXT,
    next_step TEXT
  );

  CREATE TABLE IF NOT EXISTS deals (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    amount REAL,
    site_type TEXT DEFAULT 'vitrine_simple',
    status TEXT DEFAULT 'en_cours',
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    signed_at TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    source_contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    referred_name TEXT,
    referred_phone TEXT,
    referred_email TEXT,
    referred_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'contacte',
    created_at TIMESTAMP DEFAULT NOW()
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
}

export const dbReady = initSchema().catch((err) => {
  console.error('FATAL: could not initialize database schema:', err);
  process.exit(1);
});

export default db;
