#!/usr/bin/env node
/**
 * Pre-deployment smoke test.
 *
 * Unauthenticated `curl` checks are blind to SQL errors: authMiddleware rejects
 * before any query runs, so a broken query still answers 401. This authenticates
 * and exercises the read routes for real, which is the only way to catch a 500
 * before it reaches the team.
 *
 * Usage:
 *   CRM_EMAIL=... CRM_PASSWORD=... node scripts/smoke.mjs
 *   CRM_TOKEN=... node scripts/smoke.mjs
 *   API_URL=https://... node scripts/smoke.mjs
 *
 * Exits 1 on the first 5xx or network failure.
 */
const API = (process.env.API_URL || 'https://crm-app-production-9a59.up.railway.app/api').replace(/\/$/, '');

let token = process.env.CRM_TOKEN || '';

async function check(label, path, { expect = [200], shape, method = 'GET' } = {}) {
  const url = `${API}${path}`;
  let status = 0;
  let body = '';
  let contentType = '';
  try {
    const res = await fetch(url, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(20_000),
    });
    status = res.status;
    contentType = res.headers.get('content-type') || '';
    body = await res.text();
  } catch (err) {
    console.error(`  ✗ ${label}\n      ${path}\n      réseau: ${err.message}`);
    return false;
  }

  if (status >= 500) {
    console.error(`  ✗ ${label}\n      ${path}\n      HTTP ${status} — ${body.slice(0, 300)}`);
    return false;
  }

  // Both Railway and Vercel answer unknown API paths with the SPA index.html
  // and HTTP 200. A status-only check happily calls that a success, so reject
  // any HTML payload before looking at the expected status.
  if (contentType.includes('text/html')) {
    console.error(
      `  ✗ ${label}\n      ${path}\n      HTTP ${status} mais réponse HTML (fallback SPA) — la route n'existe pas`,
    );
    return false;
  }
  if (!expect.includes(status)) {
    console.error(`  ✗ ${label}\n      ${path}\n      HTTP ${status} (attendu ${expect.join('/')})`);
    return false;
  }
  // Shape assertions catch the other half of the outage class: a 200 whose body
  // no longer matches what a client reads. The mobile dashboard broke exactly
  // that way when /dashboard/activity started answering an envelope.
  if (shape) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      console.error(`  ✗ ${label}\n      ${path}\n      corps non JSON`);
      return false;
    }
    for (const probe of shape) {
      let value = parsed;
      for (const key of probe.path.split('.')) value = value?.[key];
      const kind = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
      if (kind !== probe.type) {
        console.error(
          `  ✗ ${label}\n      ${path}\n      ${probe.path} devrait être ${probe.type}, reçu ${kind}`,
        );
        return false;
      }
    }
  }
  console.log(`  ✓ ${label} [${status}]`);
  return true;
}

async function login() {
  const { CRM_EMAIL, CRM_PASSWORD } = process.env;
  if (!CRM_EMAIL || !CRM_PASSWORD) {
    console.error("Fournis CRM_EMAIL et CRM_PASSWORD (ou CRM_TOKEN).");
    process.exit(2);
  }
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CRM_EMAIL, password: CRM_PASSWORD }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.error(`  ✗ connexion: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
    process.exit(2);
  }
  const data = await res.json();
  token = data.token;
  console.log(`  ✓ connexion (${data.user?.email}, rôle ${data.user?.role})`);
}

const CHECKS = [
  ['santé', '/health'],
  // La liste de prospects porte l'enrichissement d'historique d'appel : c'est
  // la route qui est tombée en 500 quand la requête ANY() était cassée.
  ['prospects (défaut)', '/contacts?limit=5', {
    shape: [
      { path: 'contacts', type: 'array' },
      { path: 'total', type: 'number' },
    ],
  }],
  ['prospects (jamais appelés)', '/contacts?called=never&limit=5'],
  ['prospects (déjà appelés)', '/contacts?called=only&limit=5'],
  ['prospects (file phoning)', '/contacts?excludeCalled=true&limit=5&sortBy=opportunity&sortDir=desc'],
  ['prospects (tri dernier appel)', '/contacts?limit=5&sortBy=lastCall&sortDir=desc'],
  ['prospects (recherche)', '/contacts?search=a&limit=5'],
  ['prospects (export)', '/contacts/export?dnc=exclude'],
  ['prospects (hors archives)', '/contacts?archived=exclude&limit=5', {
    shape: [{ path: 'contacts', type: 'array' }],
  }],
  ['prospects (archives)', '/contacts?archived=only&limit=5', {
    shape: [{ path: 'contacts', type: 'array' }],
  }],
  // Archive remplace la suppression : aucune route DELETE ne doit exister.
  // These two must actually send DELETE. They previously issued a GET and so
  // proved nothing about the removed destructive routes.
  ['prospects (suppression desactivee)', '/contacts/1', { method: 'DELETE', expect: [404, 405] }],
  ['prospects (suppression groupee desactivee)', '/contacts/bulk', { method: 'DELETE', expect: [404, 405] }],
  ['prospects (identifiant invalide)', '/contacts/bulk', { expect: [404] }],
  // A PUT to /contacts/bulk-archive used to be captured by the PUT /:id pattern,
  // fail parseId() and answer 404: the UI's bulk archive button silently did
  // nothing. An empty ids array answers 400 without touching any data, which
  // proves the route is reachable.
  ['prospects (archivage groupe joignable)', '/contacts/bulk-archive', {
    method: 'PUT',
    expect: [400],
    shape: [{ path: 'error', type: 'string' }],
  }],
  ['prospects (listes)', '/contacts/activities'],
  ['villes', '/contacts/cities'],
  ['appels', '/calls?limit=5', { shape: [{ path: 'calls', type: 'array' }] }],
  ['appels (par contact)', '/calls/contact/1', { shape: [] }],
  ['appels (statistiques)', '/calls/stats'],
  ['appels (relances dues)', '/calls/due'],
  ['appels (compteur relances)', '/calls/due-count'],
  ['tableau de bord (résumé)', '/dashboard/summary', {
    shape: [
      { path: 'range.label', type: 'string' },
      { path: 'calls.total', type: 'number' },
      { path: 'calls.connectionRate', type: 'number' },
      { path: 'deals.revenue', type: 'number' },
      { path: 'contacts.total', type: 'number' },
    ],
  }],
  ['tableau de bord (période)', '/dashboard/summary?from=2026-01-01&to=2026-12-31'],
  ['tableau de bord (pipeline)', '/dashboard/pipeline', {
    shape: [{ path: 'funnel', type: 'array' }, { path: 'pipeline', type: 'object' }],
  }],
  ['tableau de bord (performance)', '/dashboard/performance', {
    shape: [{ path: 'performance', type: 'array' }],
  }],
  // Envelope: the mobile client calls activity.slice(0, 8) on this.
  ['tableau de bord (activité)', '/dashboard/activity', {
    shape: [{ path: 'activity', type: 'array' }],
  }],
  ['tableau de bord (objections)', '/dashboard/objections'],
  // Level 1 — vital metrics.
  ['kpi vitaux', '/dashboard/kpis', {
    shape: [
      { path: 'range.label', type: 'string' },
      { path: 'previousRange.label', type: 'string' },
      { path: 'revenueSigned', type: 'number' },
      { path: 'openQuotes.count', type: 'number' },
      { path: 'openQuotes.amount', type: 'number' },
    ],
  }],
  // Level 2 — funnel.
  ['entonnoir', '/dashboard/funnel', {
    shape: [{ path: 'steps', type: 'array' }],
  }],
  // Level 3 — per-origin tactical table.
  ['origines', '/dashboard/sources', {
    shape: [{ path: 'rows', type: 'array' }],
  }],
  ['actions du jour', '/dashboard/actions', {
    shape: [
      { path: 'total', type: 'number' },
      { path: 'counts', type: 'object' },
      { path: 'items', type: 'array' },
    ],
  }],
  ['diagnostics', '/dashboard/diagnostics', {
    shape: [
      { path: 'cycle.signedCount', type: 'number' },
      { path: 'openQuotes.count', type: 'number' },
      { path: 'limits', type: 'array' },
    ],
  }],
  ['deals', '/deals?limit=5'],
  ['deals (statistiques)', '/deals/stats'],
  ['recommandations', '/referrals?limit=5'],
  ['recommandations (statistiques)', '/referrals/stats'],
  // 403 acceptable : un commercial n'est pas admin.
  ['utilisateurs', '/auth/users', { expect: [200, 403] }],
  // Must answer 404: the seeding routes are only mounted when DEV_SEED_TOKEN is
  // set. If this ever fails, someone enabled demo seeding on production.
  ['seed désactivé', '/dev/seed-demo', { expect: [404] }],
  ['seed undo désactivé', '/dev/seed-demo/undo', { expect: [404] }],
];

async function main() {
  console.log(`Fumée sur ${API}`);
  if (!token) await login();

  let failed = 0;
  for (const [label, path, opts] of CHECKS) {
    if (!(await check(label, path, opts))) failed += 1;
  }

  console.log(failed === 0 ? '\nTout est vert.' : `\n${failed} contrôle(s) en échec.`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
