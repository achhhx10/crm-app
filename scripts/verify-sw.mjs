/**
 * Offline-boot verification for the PWA service worker config.
 *
 * Unlike capture-pages.mjs this script KEEPS the service worker active so that
 * the offline navigation chain is exercised for real: precache route ->
 * NetworkFirst('pages') with networkTimeoutSeconds -> navigateFallback
 * '/index.html'. The app shell must boot on a deep route (referrals) while the
 * network is emulated offline - never the "Connexion requise" offline page.
 *
 * Requires a production build (SW is disabled on the dev server).
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'https://crm-app-beige-iota.vercel.app';
const [email, password] = [process.env.CRM_EMAIL, process.env.CRM_PASSWORD];
const CHROME_CANDIDATES = [
  '/Users/devops/.cache/puppeteer/chrome-headless-shell/mac-139.0.7258.138/chrome-headless-shell-mac-x64/chrome-headless-shell',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

mkdirSync('.shots', { recursive: true });
const base = mkdtempSync(path.join(os.tmpdir(), 'crm-sw-'));

let chrome = null;
let up = false;
outer:
for (const CHROME of CHROME_CANDIDATES) {
  process.stderr.write(`essai ${path.basename(CHROME)}\n`);
  for (const attempt of [9236, 9237, 9238]) {
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

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${cond || !detail ? '' : ` — ${detail}`}`);
  if (!cond) failed += 1;
};

// 1 — Login (online)
await page.goto(`${APP}/login`, { waitUntil: 'networkidle2', timeout: 45000 });
const inputs = await page.$$('input');
await inputs[0].type(email);
await inputs[1].type(password);
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
]);
await new Promise(r => setTimeout(r, 2000));
ok('connexion : token stocké', await page.evaluate(() => !!localStorage.getItem('crm_token')));

// 2 — Service worker actif ( PAS de bypass ici )
const swActive = await page.evaluate(async () => {
  for (let i = 0; i < 30; i++) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && navigator.serviceWorker.controller) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
});
ok('sw : enregistré et contrôleur actif', swActive);
if (!swActive) {
  await browser.close();
  for (const dir of [`${base}-9236`, `${base}-9237`, `${base}-9238`]) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
  process.exit(1);
}

// 3 — Offline : deep route doit booter via precache, pas offline.html
const bodyText = () => page.evaluate(() => document.body.innerText);
const checkPage = async (label, screenshot) => {
  const txt = await bodyText();
  const booted = /recommandation/i.test(txt) || /chargement/i.test(txt);
  ok(label, booted && !txt.includes('Connexion requise'), 'page non bootée');
  await page.screenshot({ path: screenshot });
};

await page.setOfflineMode(true);
await new Promise(r => setTimeout(r, 300));
try {
  await page.goto(`${APP}/referrals`, { waitUntil: 'networkidle2', timeout: 30000 });
} catch { /* les fetches API restent en échec hors-ligne : networkidle2 ne se calme pas */ }
await page.waitForSelector('aside', { timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 1500));
await checkPage('offline : /referrals booté (shell parlant)', '.shots/verify-sw-offline-referrals.png');

// 4 — Reload toujours offline : le boot doit tenir
await page.reload({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
await page.waitForSelector('aside', { timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 1500));
await checkPage('offline : reload /referrals booté aussi', '.shots/verify-sw-offline-reload.png');

// 5 — Retour en ligne : l'app reste saine
await page.setOfflineMode(false);
await new Promise(r => setTimeout(r, 1000));
await page.goto(`${APP}/referrals`, { waitUntil: 'networkidle2', timeout: 45000 });
await page.waitForSelector('aside', { timeout: 20000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2000));
const onlineTxt = await bodyText();
ok('online : /referrals sain après offline', onlineTxt.includes('recommandation') || onlineTxt.includes('Recommandation'));

await browser.close();
rmSync(base, { recursive: true, force: true, maxRetries: 5 });
if (failed) {
  console.log(`verify-sw : ${failed} échec(s)`);
  process.exit(1);
}
console.log('verify-sw : tout est vert.');
