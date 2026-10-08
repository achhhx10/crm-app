import { pgTable, text, integer, real, serial, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  password: text('password').notNull(),
  role: text('role').default('demarcheur').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
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
  placeId: text('place_id').unique(),
  latitude: real('latitude'),
  longitude: real('longitude'),
  detailUrl: text('detail_url'),
  stage: text('stage').default('identifie'),
  assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  objection: text('objection'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const calls = pgTable('calls', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  date: timestamp('date').defaultNow(),
  duration: integer('duration'),
  result: text('result').notNull(),
  objection: text('objection'),
  notes: text('notes'),
  nextStep: text('next_step'),
});

export const deals = pgTable('deals', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  amount: real('amount'),
  siteType: text('site_type').default('vitrine_simple'),
  status: text('status').default('en_cours'),
  assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
  signedAt: timestamp('signed_at'),
});

export const referrals = pgTable('referrals', {
  id: serial('id').primaryKey(),
  sourceContactId: integer('source_contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  referredName: text('referred_name'),
  referredPhone: text('referred_phone'),
  referredEmail: text('referred_email'),
  referredContactId: integer('referred_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  status: text('status').default('contacte'),
  createdAt: timestamp('created_at').defaultNow(),
});
