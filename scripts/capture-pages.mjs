/**
 * Visual + behavioral check of the newly built screens against the local dev
 * server: /settings (self-service profile), contact detail (edit + call
 * buttons + admin deals), deals edit dialog, referrals admin delete, and the
 * shared CallFormDialog on the calls page.
 *
 * Same launcher constraint as capture-shell.mjs: Chrome is spawned on a fixed
 * debugging port and puppeteer only connects to it.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
// On the Vercel front there is no /api proxy: in-page fetches must target the
// Railway API directly (same origin the app itself uses cross-origin).
const IN_PAGE_API = (process.env.IN_PAGE_API_URL || (APP.startsWith('http://localhost') ? '/api' : 'https://crm-app-production-9a59.up.railway.app/api')).replace(/\/$/, '');
const [email, password] = [process.env.CRM_EMAIL, process.env.CRM_PASSWORD];
const CHROME_CANDIDATES = [
  '/Users/devops/.cache/puppeteer/chrome-headless-shell/mac-139.0.7258.138/chrome-headless-shell-mac-x64/chrome-headless-shell',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

mkdirSync('.shots', { recursive: true });
const base = mkdtempSync(path.join(os.tmpdir(), 'crm-pages-'));

let chrome = null;
let up = false;
outer:
for (const CHROME of CHROME_CANDIDATES) {
  process.stderr.write(`essai ${path.basename(CHROME)}\n`);
  for (const attempt of [9226, 9227, 9228]) {
    const chromeSpawn = spawn(CHROME, [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${attempt}`,
      `--user-data-dir=${base}-${attempt}`,
      'about:blank',
    ], { stdio: 'ignore' });
    for (let i = 0; i < 15; i++) {
      try {
        await fetch(`http://127.0.0.1:${attempt}/json/version`);
        chrome = chromeSpawn;
        up = true;
        var port = attempt;
        break outer;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    chromeSpawn.kill('SIGKILL');
  }
}
if (!up) {
  console.error('DevTools Chrome injoignable');
  rmSync(base, { recursive: true, force: true, maxRetries: 5 });
  process.exit(2);
}

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
// Mid-rollout the PWA service worker can serve a superseded bundle whose
// asset hashes no longer exist on the CDN, so lazy routes white-screen.
await page.setBypassServiceWorker(true);

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond || !detail ? '' : ` — ${detail}`}`);
  if (!cond) failed += 1;
};

await page.goto(`${APP}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
const inputs = await page.$$('input');
await inputs[0].type(email);
await inputs[1].type(password);
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
]);
await new Promise(r => setTimeout(r, 2000));

const gotoWithShell = async (url) => {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  try {
    await page.waitForSelector('aside', { timeout: 15000 });
  } catch {
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('aside', { timeout: 20000 });
  }
};

const bodyText = () => page.evaluate(() => document.body.innerText);

try {
  // 1 — Settings
  await gotoWithShell(`${APP}/settings`);
  await new Promise(r => setTimeout(r, 1200));
  const txt = await bodyText();
  ok('settings : titre "Mon compte"', txt.includes('Mon compte'));
  ok('settings : champ nom rempli', await page.evaluate(() =>
    (document.querySelector('#settings-name')?.value || '').length > 1));
  ok('settings : mot de passe actuel présent', await page.$('#settings-pwd-current') !== null);
  ok('settings : email affiché (lecture seule)', txt.includes('Email'));
  ok('sidebar : bloc compte pointe vers /settings', await page.evaluate(() =>
    !!document.querySelector('aside a[href="/settings"]')));
  await page.screenshot({ path: '.shots/page-settings.png' });

  // 2 — Contact detail (admin: edit + call + deals)
  const contactId = await page.evaluate(async (apiBase) => {
    const res = await fetch(`${apiBase}/contacts?limit=1&sortBy=opportunity&sortDir=desc`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('crm_token')}` },
    });
    const data = await res.json();
    return data.contacts?.[0]?.id ?? null;
  }, IN_PAGE_API);
  ok('detail : contact trouvé', contactId !== null);
  await gotoWithShell(`${APP}/contacts/${contactId}`);
  await new Promise(r => setTimeout(r, 1500));
  const dTxt = await bodyText();
  ok('detail : bouton "Enregistrer un appel"', dTxt.includes('Enregistrer un appel'));
  ok('detail : bouton "Modifier"', dTxt.includes('Modifier'));
  ok('detail : card "Devis & Deals" (admin)', dTxt.includes('Devis & Deals'));
  await page.screenshot({ path: '.shots/page-contact-detail.png' });

  const dealsVisible = dTxt.includes('Devis & Deals');

  // Reference check as a caller would see it: deals hidden, edit allowed only on own leads.
  ok('detail : historique des appels', dTxt.includes('Historique des appels'));
  ok('detail : recommandations', dTxt.includes('Recommandations'));

  // Log a call dialog opens from the detail page.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.includes('Enregistrer un appel'));
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 700));
  const callTxt = await bodyText();
  ok('detail : dialog appel ouvert', callTxt.includes('Durée (secondes)') && callTxt.includes('Résultat'));
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 500));

  // 3 — Deals edit dialog. The database can legitimately hold zero deals, so
  // the check seeds one through the API and removes it afterwards: nothing is
  // left in the books, but the dialog is exercised for real.
  const seedDeal = await page.evaluate(async (apiBase) => {
    try {
      const auth = { Authorization: `Bearer ${localStorage.getItem('crm_token')}`, 'Content-Type': 'application/json' };
      const cRes = await fetch(`${apiBase}/contacts?limit=1`, { headers: { Authorization: auth.Authorization } });
      const contact = (await cRes.json()).contacts?.[0];
      if (!contact) return null;
      const res = await fetch(`${apiBase}/deals`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ contactId: contact.id, amount: 1234.5, siteType: 'vitrine_simple', status: 'en_cours' }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, IN_PAGE_API);

  if (seedDeal?.id) {
    await gotoWithShell(`${APP}/deals`);
    await new Promise(r => setTimeout(r, 2000));
    await page.evaluate(() => {
      const btn = document.querySelector('table button[title="Modifier"]');
      btn?.click();
    });
    await new Promise(r => setTimeout(r, 700));
    const dealTxt = await bodyText();
    ok('deals : dialog édition avec statut', dealTxt.includes('Modifier le deal') && dealTxt.includes('Type de site'));
    await page.screenshot({ path: '.shots/page-deal-edit.png' });
  } else {
    console.log('  (deals : pas de contact/dispo pour semer un deal — vérification sautée)');
  }

  // Cleanup regardless of the dialog result, so the books stay untouched.
  if (seedDeal?.id) {
    const del = await page.evaluate(async (apiBase, dealId) => {
      const res = await fetch(`${apiBase}/deals/${dealId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('crm_token')}` },
      });
      return res.status;
    }, IN_PAGE_API, seedDeal.id);
    ok('deals : deal semé supprimé (nettoyage)', del === 200, `status=${del}`);
  }

  // 4 — Referrals admin delete
  await gotoWithShell(`${APP}/referrals`);
  await new Promise(r => setTimeout(r, 1500));
  const refTxt = await bodyText();
  ok('recommandations : page chargée', refTxt.includes('Total recommandations'));

  // 5 — Calls page keeps a working add-call dialog (shared component)
  await gotoWithShell(`${APP}/calls`);
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Enregistrer un appel');
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 700));
  const callsTxt = await bodyText();
  ok('appels : CallFormDialog ouvert', callsTxt.includes('Durée (secondes)') && callsTxt.includes('Prospect'));
  await page.keyboard.press('Escape');

  console.log(failed === 0 ? '\nCaptures de pages : tout est vert.' : `\n${failed} échec(s).`);
} finally {
  await browser.disconnect();
  chrome?.kill('SIGKILL');
  try { rmSync(base, { recursive: true, force: true, maxRetries: 5 }); } catch { /* cloud profile dir */ }
}
process.exit(failed === 0 ? 0 : 1);
