#!/usr/bin/env node
/**
 * Language backfill for contacts.
 *
 *   node scripts/detect-language.mjs heuristic [--limit N] [--dry-run]
 *   node scripts/detect-language.mjs crawl     [--limit N] [--concurrency N] [--delay MS] [--dry-run]
 *   node scripts/detect-language.mjs stats
 *   node scripts/detect-language.mjs apply results.json
 *
 * 'crawl --out file.json' keeps every hit in a local file so the crawl itself needs
 * no database connection; 'apply' replays the file in one short transaction.
 *
 * Requires DATABASE_URL. 'crawl' performs outbound HTTP to third-party sites:
 * it honours robots.txt, serialises requests per host and never runs the
 * login-only endpoints. Always dry-run first.
 */
import pg from 'pg';
import { execFile } from 'node:child_process';
import { detectFromFields, detectFromHtml, normalizeUrl } from './lib/language.mjs';

const { Client } = pg;

// A single failing socket must never end a multi-hour run. undici can throw
// asynchronously from its socket handler, out of reach of any local try/catch.
let crashed = 0;
process.on('uncaughtException', (err) => {
  crashed++;
  if (crashed > 200) { console.error('too many uncaught errors, stopping'); process.exit(1); }
  console.error('uncaught (ignored):', err?.message || err);
});

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
const OUT = flag('out', null);
const CANDIDATES = flag('candidates', null);
const TIMEOUT_MS = 10000;
const MAX_BYTES = 400_000;

// Only modes that actually read or write the database need credentials.
const needsDb = !(mode === 'crawl' && CANDIDATES);
if (needsDb && !process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required (railway run ... or export it).');
  process.exit(1);
}

const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
let connected = false;
// Lazy: 'crawl --candidates' never touches the database, so a multi-hour run does
// not need a tunnel to production open.
async function getDb() {
  if (!connected) { await db.connect(); connected = true; }
  return db;
}

/* ------------------------------- heuristics ------------------------------- */

async function runHeuristic() {
  const { rows } = await (await getDb()).query(
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
    await (await getDb()).query('begin');
    try {
      // Batched single statement: 39k rows would otherwise need 39k round trips.
      // Casts are mandatory: in a VALUES row constructor Postgres infers types from
      // the placeholders, and without them id is inferred as text (integer = text).
      const CHUNK = 1000;
      for (let i = 0; i < updates.length; i += CHUNK) {
        const part = updates.slice(i, i + CHUNK);
        const values = part.map((u, n) => `($${n * 3 + 1}::int, $${n * 3 + 2}::text, $${n * 3 + 3}::text)`).join(',');
        const params = part.flatMap((u) => [u.id, u.language, u.source]);
        await (await getDb()).query(`update contacts as c set language = v.l, language_source = v.s
                        from (values ${values}) as v(id, l, s) where c.id = v.id`, params);
      }
      await (await getDb()).query('commit');
      console.log(`committed ${updates.length} updates`);
    } catch (e) {
      await (await getDb()).query('rollback');
      throw e;
    }
  } else {
    console.log(`DRY RUN — would write ${updates.length} rows`);
  }
}

/* --------------------------------- crawl --------------------------------- */

/**
 * HTTP transport via curl.
 *
 * Node's global fetch is undici under the hood, and it hits an internal
 * assertion (assert(!this.paused) in Parser.finish) when a socket is torn down
 * mid-response. The guard above keeps the process alive, but the connection pool
 * stays degraded and error rates climb from 7% to 45%. curl does not have that
 * failure mode, and spawning it per request is cheap enough at this rate.
 */
function curlFetch(url, { maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS, accept = 'text/html,application/xhtml+xml' } = {}) {
  const secs = Math.max(1, Math.floor(timeoutMs / 1000));
  const marker = '\n__HTTP_META__';
  return new Promise((resolve) => {
    execFile('curl', [
      '-s', '-L', '--max-redirs', '5',
      '-k', '--compressed',
      '--connect-timeout', String(secs),
      '--max-time', String(secs),
      '-A', 'crm-language-detector (+internal use)',
      '-H', 'Accept: ' + accept,
      '-H', 'Accept-Language: de,fr,en;q=0.8',
      '-w', marker + '%{http_code} %{content_type}',
      url,
    ], {
      maxBuffer: maxBytes * 4,
      timeout: timeoutMs + 3000,
      killSignal: 'SIGKILL',
    }, (err, stdout) => {
      if (!stdout) return resolve({ error: err && err.killed ? 'timeout' : 'curl_failed' });
      const at = stdout.lastIndexOf(marker);
      if (at === -1) return resolve({ error: 'bad_output' });
      const body = stdout.slice(0, at);
      const [status, ctype = ''] = stdout.slice(at + marker.length).trim().split(' ');
      if (!/^\d{3}$/.test(status)) return resolve({ error: 'bad_status' });
      resolve({
        status: Number(status),
        ctype,
        html: body.length > maxBytes ? body.slice(0, maxBytes) : body,
        truncated: body.length > maxBytes,
      });
    });
  });
}

const robotsCache = new Map();

/**
 * Longest matching path rule wins; an empty Disallow means "allow everything".
 * A blanket `Disallow: /` is the only rule that blocks every path.
 */
function pathAllowed(pathname, rules) {
  let decision = true;
  let bestLen = -1;
  for (const r of rules) {
    if (r.type === 'disallow' && r.value === '') continue; // "Disallow:" with nothing = allow all
    if (pathname.startsWith(r.value)) {
      if (r.value.length > bestLen) { bestLen = r.value.length; decision = r.type === 'allow'; }
    }
  }
  return decision;
}

async function getRobots(origin) {
  const rules = [];
  let delay = DELAY_MS;
  try {
    const res = await curlFetch(`${origin}/robots.txt`, { accept: 'text/plain', timeoutMs: 8000 });
    if (res.status === 200) {
      const text = res.html;
      // Group consecutive User-agent lines, then read the rules that follow.
      let applies = false;
      for (const raw of text.split('\n')) {
        const line = raw.split('#')[0].trim();
        if (!line) { continue; }
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (key === 'user-agent') { applies = value === '*'; continue; }
        if (!applies) continue;
        if (key === 'disallow' || key === 'allow') rules.push({ type: key, value });
        else if (key === 'crawl-delay') delay = Math.max(delay, (Number(value) || 0) * 1000);
      }
    }
  } catch { /* unreachable robots.txt -> proceed, as crawlers conventionally do */ }
  return { rules, delay };
}

async function robotsAllows(url) {
  const origin = url.origin;
  if (!robotsCache.has(origin)) robotsCache.set(origin, await getRobots(origin));
  const { rules, delay } = robotsCache.get(origin);
  return { allowed: pathAllowed(url.pathname, rules), delay };
}

const lastHit = new Map();

async function politeWait(url, delayMs) {
  const prev = lastHit.get(url.hostname) || 0;
  const wait = prev + (delayMs || DELAY_MS) - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(url.hostname, Date.now());
}

async function fetchPage(url, delayMs) {
  await politeWait(url, delayMs);
  const res = await curlFetch(url.toString());
  if (res.error) return res;
  if (res.status === 0) return { error: 'unreachable' };   // curl could not connect at all
  if (res.status !== 200) return { error: 'http_' + res.status };
  if (!/text\/html/i.test(res.ctype || '')) return { error: 'not_html' };
  return { html: res.html, finalUrl: url.toString() };
}

async function runCrawl() {
  // Only rows that are undetermined, or known only by city (the weakest signal).
  // Candidates can be pre-extracted to a file so a multi-hour crawl never has to
  // hold a tunnel open to the production database.
  let rows;
  if (CANDIDATES) {
    const { readFileSync, existsSync } = await import('node:fs');
    rows = readFileSync(CANDIDATES, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    // Resume on ids that were *attempted*, not on ids that were *detected*: skipping
    // only the successes re-queues every previous failure at the front of the list,
    // which makes the head of the run a biased sample of the hardest sites.
    const processedFile = OUT ? OUT + '.processed' : null;
    if (processedFile && existsSync(processedFile)) {
      const done = new Set(readFileSync(processedFile, 'utf8').split('\n').filter(Boolean).map(Number));
      const before = rows.length;
      rows = rows.filter((r) => !done.has(r.id));
      console.log(`reprise : ${done.size} candidats deja traites sauves, ${before - rows.length} a retraiter`);
    } else if (OUT && existsSync(OUT)) {
      const already = new Set(
        readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id)
      );
      const before = rows.length;
      rows = rows.filter((r) => !already.has(r.id));
      console.log(`reprise (approximative) : ${already.size} resultats conserves, ${before - rows.length} candidats requeues`);
    }
    if (LIMIT) rows = rows.slice(0, LIMIT);
  } else {
    let sql = `select id, business_name, city, site_url from contacts
                where site_url is not null and site_url <> ''
                  and (language is null or language_source = 'city')
                order by id`;
    const qp = [];
    if (LIMIT) { qp.push(LIMIT); sql += ` limit $${qp.length}`; }
    ({ rows } = await (await getDb()).query(sql, qp));
  }
  console.log(`candidates avec site web : ${rows.length}`);

  const stats = { detected: 0, robots: 0, error: 0, inconclusive: 0 };
  const errors = {};
  const updates = [];

  // Group by host and fetch each domain once. The language belongs to the site, not
  // to the lead, so every lead sharing a host gets the same answer. This also removes
  // the stalls: a single host can carry hundreds of leads (yellow.local.ch alone had
  // 631), and the per-host politeness delay would serialise them into minutes of
  // workers sleeping with no request in flight.
  const groups = new Map();
  for (const r of rows) {
    const u = normalizeUrl(r.site_url);
    if (!u) { stats.error++; errors['bad_url'] = (errors['bad_url'] || 0) + 1; continue; }
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push({ row: r, url: u });
  }
  const todo = [...groups.values()];
  console.log(`domaines uniques a interroger : ${todo.length}` + (LIMIT ? ` (limite ${LIMIT})` : ''));
  console.log(`limite: ${LIMIT || 'aucune'} | concurrence: ${CONCURRENCY} | delai: ${DELAY_MS}ms`);
  if (DRY) console.log('DRY RUN — aucune ecriture');

  let cursor = 0;
  // One append handle for the whole run: re-opening the file per hit truncated it.
  let sink = null;
  let seen = null;
  if (OUT && !DRY) {
    const { createWriteStream } = await import('node:fs');
    sink = createWriteStream(OUT, { flags: 'a' });
    seen = createWriteStream(OUT + '.processed', { flags: 'a' });
  }

  async function worker() {
    while (cursor < todo.length) {
      const group = todo[cursor++];
      const { row, url } = group[0];
      if (seen) for (const g of group) seen.write(g.row.id + '\n');   // attempted, whatever the outcome

      const robots = await robotsAllows(url);
      if (!robots.allowed) { stats.robots++; continue; }
      const hostDelay = robots.delay;

      let page;
      try {
        page = await fetchPage(url, hostDelay);
      } catch (e) {
        stats.error++;
        errors[e.name === 'TimeoutError' ? 'timeout' : 'network'] = (errors[e.name === 'TimeoutError' ? 'timeout' : 'network'] || 0) + 1;
        continue;
      }
      if (page.error) { stats.error++; errors[page.error] = (errors[page.error] || 0) + 1; continue; }

      const det = detectFromHtml(page.html, page.finalUrl || url.toString());
      if (!det) { stats.inconclusive++; continue; }

      stats.detected += group.length;
      for (const g of group) {
        const rec = { id: g.row.id, language: det.language, source: det.source };
        updates.push(rec);
        if (sink) sink.write(JSON.stringify(rec) + '\n');
        else if (!DRY && !OUT) {
          await (await getDb()).query(`update contacts set language = $1, language_source = $2 where id = $3`,
            [det.language, det.source, g.row.id]);
        }
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, worker);
  const t0 = Date.now();
  const timer = setInterval(() => {
    const pct = todo.length ? Math.round((cursor / todo.length) * 100) : 100;
    process.stdout.write(`\r  domaines ${cursor}/${todo.length} (${pct}%) leads_detectes=${stats.detected} robots=${stats.robots} erreurs=${stats.error}   `);
  }, 1500);

  await Promise.all(workers);
  if (sink) await new Promise((r) => sink.end(r));
  if (seen) await new Promise((r) => seen.end(r));
  clearInterval(timer);
  process.stdout.write(`\r  ${todo.length}/${todo.length} domaines termines en ${((Date.now() - t0) / 1000).toFixed(0)}s          \n`);

  console.log(`  leads detectes: ${stats.detected}`);
  console.log(`  non concluants: ${stats.inconclusive} domaines`);
  console.log(`  bloques robots: ${stats.robots} domaines`);
  console.log(`  erreurs        : ${stats.error}`, errors);
  if (!DRY) console.log(`  mis a jour     : ${updates.length}`);
}

/* --------------------------------- apply --------------------------------- */

/** Replay a crawl result file in one transaction. Needs the DB for a few seconds. */
async function runApply(file) {
  const { readFileSync } = await import('node:fs');
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const rows = lines.map((l) => JSON.parse(l));
  console.log(`${rows.length} resultats a appliquer`);

  if (DRY) { console.log('DRY RUN'); return; }

  await (await getDb()).query('begin');
  try {
    const CHUNK = 1000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const part = rows.slice(i, i + CHUNK);
      const values = part.map((u, n) => `($${n * 3 + 1}::int, $${n * 3 + 2}::text, $${n * 3 + 3}::text)`).join(',');
      const params = part.flatMap((u) => [u.id, u.language, u.source]);
      await (await getDb()).query(`update contacts as c set language = v.l, language_source = v.s
                      from (values ${values}) as v(id, l, s) where c.id = v.id`, params);
    }
    await (await getDb()).query('commit');
    console.log(`commit: ${rows.length} lignes mises a jour`);
  } catch (e) {
    await (await getDb()).query('rollback');
    throw e;
  }
}

/* --------------------------------- stats --------------------------------- */

async function runStats() {
  const { rows } = await (await getDb()).query(`
    select coalesce(language,'(indetermine)') lang, coalesce(language_source,'-') src, count(*)::int n
    from contacts group by 1,2 order by n desc`);
  console.table(rows);
  const t = await (await getDb()).query(`select count(*)::int total,
      count(*) filter (where site_url is not null and site_url <> '')::int avec_site,
      count(*) filter (where language is null)::int indetermines from contacts`);
  console.table(t.rows);
}

try {
  if (mode === 'heuristic') await runHeuristic();
  else if (mode === 'crawl') await runCrawl();
  else if (mode === 'stats') await runStats();
  else if (mode === 'apply') await runApply(argv[1]);
  else { console.error('usage: detect-language.mjs heuristic|crawl|stats [--limit N] [--dry-run]'); process.exit(2); }
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
} finally {
  if (connected) await db.end();
}