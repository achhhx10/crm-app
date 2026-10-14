#!/usr/bin/env node
/**
 * Language backfill for contacts.
 *
 *   node scripts/detect-language.mjs heuristic [--limit N] [--dry-run]
 *   node scripts/detect-language.mjs crawl     [--limit N] [--concurrency N] [--delay MS] [--dry-run]
 *   node scripts/detect-language.mjs stats
 *
 * Requires DATABASE_URL. 'crawl' performs outbound HTTP to third-party sites:
 * it honours robots.txt, serialises requests per host and never runs the
 * login-only endpoints. Always dry-run first.
 */
import pg from 'pg';
import { detectFromFields, detectFromHtml, normalizeUrl } from './lib/language.mjs';

const { Client } = pg;

const argv = process.argv.slice(2);
const mode = argv[0];
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? dflt : argv[i + 1];
};
const has = (name) => argv.includes('--' + name);

const LIMIT = Number(flag('limit', 0)) || 0;
const CONCURRENCY = Math.min(8, Math.max(1, Number(flag('concurrency', 3))));
const DELAY_MS = Math.max(0, Number(flag('delay', 1200)));
const DRY = has('dry-run');
const TIMEOUT_MS = 10000;
const MAX_BYTES = 400_000;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required (railway run ... or export it).');
  process.exit(1);
}

const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

/* ------------------------------- heuristics ------------------------------- */

async function runHeuristic() {
  const { rows } = await db.query(
    LIMIT
      ? `select id, business_name, city, language, language_source from contacts order by id limit $1`
      : `select id, business_name, city, language, language_source from contacts`
  );
  const stats = { set: 0, change: 0, unchanged: 0, cleared: 0, none: 0 };
  const bySource = {};
  const updates = [];

  for (const r of rows) {
    const det = detectFromFields(r.business_name, r.city);
    if (!det) { stats.none++; if (r.language) { stats.cleared++; updates.push({ id: r.id, language: null, source: null }); } continue; }
    bySource[det.source] = (bySource[det.source] || 0) + 1;
    if (r.language === det.language && r.language_source === det.source) { stats.unchanged++; continue; }
    stats.set++;
    updates.push({ id: r.id, language: det.language, source: det.source });
  }

  console.log(`scanned ${rows.length} contacts`);
  console.log(`  determines : ${stats.set}`);
  console.log(`  identiques : ${stats.unchanged}`);
  console.log(`  sans indice: ${stats.none}`);
  console.log('  par source :', bySource);

  if (!DRY) {
    await db.query('begin');
    try {
      // Batched single statement: 39k rows would otherwise need 39k round trips.
      const CHUNK = 1000;
      for (let i = 0; i < updates.length; i += CHUNK) {
        const part = updates.slice(i, i + CHUNK);
        const values = part.map((u, n) => `($${n * 3 + 1}, $${n * 3 + 2}, $${n * 3 + 3})`).join(',');
        const params = part.flatMap((u) => [u.id, u.language, u.source]);
        await db.query(`update contacts as c set language = v.l, language_source = v.s
                        from (values ${values}) as v(id, l, s) where c.id = v.id`, params);
      }
      await db.query('commit');
      console.log(`committed ${updates.length} updates`);
    } catch (e) {
      await db.query('rollback');
      throw e;
    }
  } else {
    console.log(`DRY RUN — would write ${updates.length} rows`);
  }
}

/* --------------------------------- crawl --------------------------------- */

const robotsCache = new Map();

async function robotsAllows(url) {
  const origin = url.origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin);

  let allowed = true;
  let delay = DELAY_MS;
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'crm-language-detector (+internal use)' },
    });
    if (res.ok) {
      const text = await res.text();
      let applies = false;
      for (const raw of text.split('\n')) {
        const line = raw.split('#')[0].trim();
        if (!line) continue;
        const [rawKey, ...rest] = line.split(':');
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key === 'user-agent') applies = value === '*';
        else if (!applies) continue;
        else if (key === 'disallow' && value) allowed = false;
        else if (key === 'crawl-delay') delay = Math.max(delay, Number(value) * 1000 || 0);
      }
    }
  } catch { /* unreachable robots.txt -> proceed, as crawlers conventionally do */ }

  robotsCache.set(origin, { allowed, delay });
  return robotsCache.get(origin);
}

const lastHit = new Map();

async function politeWait(url) {
  const prev = lastHit.get(url.hostname) || 0;
  const wait = prev + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(url.hostname, Date.now());
}

async function fetchPage(url) {
  await politeWait(url);
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'User-Agent': 'crm-language-detector (+internal use)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'de,fr,en;q=0.8',
    },
  });
  if (!res.ok) return { error: 'http_' + res.status };
  const ctype = res.headers.get('content-type') || '';
  if (!/text\/html/i.test(ctype)) return { error: 'not_html' };
  const reader = res.body?.getReader();
  if (!reader) return { error: 'no_body' };
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
  }
  try { await reader.cancel(); } catch { /* ignore */ }
  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  return { html, finalUrl: res.url };
}

async function runCrawl() {
  // Only rows that are undetermined, or known only by city (the weakest signal).
  const params = [ 'language is null OR language_source = \'city\'' ];
  let sql = `select id, business_name, city, site_url from contacts
              where site_url is not null and site_url <> '' and (${params[0]})
              order by id`;
  const qp = [];
  if (LIMIT) { qp.push(LIMIT); sql += ` limit $${qp.length}`; }

  const { rows } = await db.query(sql, qp);
  console.log(`candidates avec site web : ${rows.length}`);
  console.log(`limite: ${LIMIT || 'aucune'} | concurrence: ${CONCURRENCY} | delai: ${DELAY_MS}ms`);
  if (DRY) console.log('DRY RUN — aucune ecriture');

  const stats = { detected: 0, robots: 0, error: 0, inconclusive: 0, ok: 0 };
  const errors = {};
  const updates = [];
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const url = normalizeUrl(row.site_url);
      if (!url) { stats.error++; errors['bad_url'] = (errors['bad_url'] || 0) + 1; continue; }

      const robots = await robotsAllows(url);
      if (!robots.allowed) { stats.robots++; continue; }

      let page;
      try {
        page = await fetchPage(url);
      } catch (e) {
        stats.error++;
        const k = e.name === 'TimeoutError' ? 'timeout' : 'network';
        errors[k] = (errors[k] || 0) + 1;
        continue;
      }
      if (page.error) { stats.error++; errors[page.error] = (errors[page.error] || 0) + 1; continue; }

      const det = detectFromHtml(page.html, page.finalUrl || url.toString());
      if (!det) { stats.inconclusive++; continue; }

      stats.detected++;
      updates.push({ id: row.id, language: det.language, source: det.source });
      if (!DRY) {
        await db.query(`update contacts set language = $1, language_source = $2 where id = $3`,
                       [det.language, det.source, row.id]);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, worker);
  const t0 = Date.now();
  const timer = setInterval(() => {
    const pct = rows.length ? Math.round((cursor / rows.length) * 100) : 100;
    process.stdout.write(`\r  ${cursor}/${rows.length} (${pct}%) detectes=${stats.detected} robots=${stats.robots} erreurs=${stats.error}   `);
  }, 1500);

  await Promise.all(workers);
  clearInterval(timer);
  process.stdout.write(`\r  ${rows.length}/${rows.length} termine en ${((Date.now() - t0) / 1000).toFixed(0)}s          \n`);

  console.log(`  detectes     : ${stats.detected}`);
  console.log(`  non concluants: ${stats.inconclusive}`);
  console.log(`  bloques robots: ${stats.robots}`);
  console.log(`  erreurs      : ${stats.error}`, errors);
  if (!DRY) console.log(`  mis a jour   : ${updates.length}`);
}

/* --------------------------------- stats --------------------------------- */

async function runStats() {
  const { rows } = await db.query(`
    select coalesce(language,'(indetermine)') lang, coalesce(language_source,'-') src, count(*)::int n
    from contacts group by 1,2 order by n desc`);
  console.table(rows);
  const t = await db.query(`select count(*)::int total,
      count(*) filter (where site_url is not null and site_url <> '')::int avec_site,
      count(*) filter (where language is null)::int indetermines from contacts`);
  console.table(t.rows);
}

try {
  if (mode === 'heuristic') await runHeuristic();
  else if (mode === 'crawl') await runCrawl();
  else if (mode === 'stats') await runStats();
  else { console.error('usage: detect-language.mjs heuristic|crawl|stats [--limit N] [--dry-run]'); process.exit(2); }
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
} finally {
  await db.end();
}