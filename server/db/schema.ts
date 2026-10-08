import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  role: text('role').default('demarcheur').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessName: text('business_name').notNull(),
  contactName: text('contact_name'),
  phone: text('phone'),
  email: text('email'),
  activity: text('activity'),
  city: text('city'),
  googleRating: real('google_rating'),
  googleReviews: integer('google_reviews'),
  hasSite: text('has_site').default('non'),
  siteUrl: text('site_url'),
  siteStatus: text('site_status').default('pas_de_site'),
  source: text('source').default('google_maps'),
  placeId: text('place_id'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  detailUrl: text('detail_url'),
  stage: text('stage').default('identifie'),
  assignedTo: integer('assigned_to').references(() => users.id),
  objection: text('objection'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});

export const calls = sqliteTable('calls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: integer('contact_id').references(() => contacts.id),
  userId: integer('user_id').references(() => users.id),
  date: integer('date', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  duration: integer('duration'),
  result: text('result').notNull(),
  objection: text('objection'),
  notes: text('notes'),
  nextStep: text('next_step'),
});

export const deals = sqliteTable('deals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: integer('contact_id').references(() => contacts.id),
  amount: real('amount'),
  siteType: text('site_type').default('vitrine_simple'),
  status: text('status').default('en_cours'),
  assignedTo: integer('assigned_to').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  signedAt: integer('signed_at', { mode: 'timestamp' }),
});

export const referrals = sqliteTable('referrals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceContactId: integer('source_contact_id').references(() => contacts.id),
  referredName: text('referred_name'),
  referredPhone: text('referred_phone'),
  referredEmail: text('referred_email'),
  referredContactId: integer('referred_contact_id').references(() => contacts.id),
  status: text('status').default('contacte'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});
