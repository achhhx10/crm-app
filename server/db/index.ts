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
  // Typo-tolerant search ("boulangerie" finds "Boulangerie Marten"). Kept out of
  // the main block: creating an extension needs elevated privileges, and a
  // failure here must not abort the schema bootstrap and take the API down.
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_business_name_trgm ON contacts USING gin (business_name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_contacts_contact_name_trgm ON contacts USING gin (contact_name gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_contacts_city_trgm ON contacts USING gin (city gin_trgm_ops);
      CREATE INDEX IF NOT EXISTS idx_contacts_activity_trgm ON contacts USING gin (activity gin_trgm_ops);
    `);
  } catch (err) {
    console.warn('pg_trgm unavailable, search falls back to plain ILIKE:', (err as Error).message);
  }

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

  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS language TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS language_source TEXT;
  CREATE INDEX IF NOT EXISTS idx_contacts_language ON contacts(language);


  -- Scheduled follow-ups. Without this the "prochaine étape" note is write-only:
  -- it was stored and returned by the API but rendered by no screen.
  ALTER TABLE calls ADD COLUMN IF NOT EXISTS next_step_at TIMESTAMP;
  CREATE INDEX IF NOT EXISTS idx_calls_next_step_at ON calls(next_step_at);

  -- Opt-out flag, shared across every rep and every device.
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dnc INTEGER DEFAULT 0;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dnc_reason TEXT;
  CREATE INDEX IF NOT EXISTS idx_contacts_dnc ON contacts(dnc);
  `);
}

export const dbReady = initSchema().catch((err) => {
  console.error('FATAL: could not initialize database schema:', err);
  process.exit(1);
});

export default db;
