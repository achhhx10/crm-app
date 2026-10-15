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

async function check(label, path, { expect = [200] } = {}) {
  const url = `${API}${path}`;
  let status = 0;
  let body = '';
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(20_000),
    });
    status = res.status;
    body = await res.text();
  } catch (err) {
    console.error(`  ✗ ${label}\n      ${path}\n      réseau: ${err.message}`);
    return false;
  }

  if (status >= 500) {
    console.error(`  ✗ ${label}\n      ${path}\n      HTTP ${status} — ${body.slice(0, 300)}`);
    return false;
  }
  if (!expect.includes(status)) {
    console.error(`  ✗ ${label}\n      ${path}\n      HTTP ${status} (attendu ${expect.join('/')})`);
    return false;
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
  ['prospects (défaut)', '/contacts?limit=5'],
  ['prospects (jamais appelés)', '/contacts?called=never&limit=5'],
  ['prospects (déjà appelés)', '/contacts?called=only&limit=5'],
  ['prospects (file phoning)', '/contacts?excludeCalled=true&limit=5&sortBy=opportunity&sortDir=desc'],
  ['prospects (tri dernier appel)', '/contacts?limit=5&sortBy=lastCall&sortDir=desc'],
  ['prospects (recherche)', '/contacts?search=a&limit=5'],
  ['prospects (export)', '/contacts/export?dnc=exclude'],
  ['prospects (listes)', '/contacts/activities'],
  ['villes', '/contacts/cities'],
  ['appels', '/calls?limit=5'],
  ['appels (statistiques)', '/calls/stats'],
  ['appels (relances dues)', '/calls/due'],
  ['appels (compteur relances)', '/calls/due-count'],
  ['tableau de bord (résumé)', '/dashboard/summary'],
  ['tableau de bord (période)', '/dashboard/summary?from=2026-01-01&to=2026-12-31'],
  ['tableau de bord (pipeline)', '/dashboard/pipeline'],
  ['tableau de bord (performance)', '/dashboard/performance'],
  ['tableau de bord (activité)', '/dashboard/activity'],
  ['tableau de bord (objections)', '/dashboard/objections'],
  ['deals', '/deals?limit=5'],
  ['deals (statistiques)', '/deals/stats'],
  ['recommandations', '/referrals?limit=5'],
  ['recommandations (statistiques)', '/referrals/stats'],
  // 403 acceptable : un commercial n'est pas admin.
  ['utilisateurs', '/auth/users', { expect: [200, 403] }],
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
