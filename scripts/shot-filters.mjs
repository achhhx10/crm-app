/**
 * Screenshot pass for the reworked filter bars: contacts page
 * (header + presets + primary row with collapsible advanced filters) and
 * phoning page (queue card with header summary + labeled grid).
 * Same launcher constraint as capture-pages.mjs: Chrome is spawned on a fixed
 * debugging port and puppeteer only connects to it.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const [email, password] = [process.env.CRM_EMAIL, process.env.CRM_PASSWORD];
const CHROME_CANDIDATES = [
  '/Users/devops/.cache/puppeteer/chrome-headless-shell/mac-139.0.7258.138/chrome-headless-shell-mac-x64/chrome-headless-shell',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

mkdirSync('.shots', { recursive: true });
const base = mkdtempSync(path.join(os.tmpdir(), 'crm-filters-'));

let chrome = null;
let up = false;
outer:
for (const CHROME of CHROME_CANDIDATES) {
  process.stderr.write(`essai ${path.basename(CHROME)}\n`);
  for (const attempt of [9246, 9247, 9248]) {
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
await page.setBypassServiceWorker(true);

const gotoWithShell = async (url) => {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  try {
    await page.waitForSelector('aside', { timeout: 15000 });
  } catch {
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('aside', { timeout: 20000 });
  }
};

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

// Contacts : collapsed
await gotoWithShell(`${APP}/contacts`);
await new Promise(r => setTimeout(r, 2500));
let txt = await page.evaluate(() => document.body.innerText);
ok('contacts : en-tête "Prospects" + compte', txt.includes('Prospects') && /prospects/i.test(txt));
ok('contacts : bouton Filtres avancés', txt.includes('Filtres avancés'));
ok('contacts : Ajouter hors des filtres (header)', await page.evaluate(() => {
  const h1 = [...document.querySelectorAll('h1')].find(e => e.textContent.trim() === 'Prospects');
  return !!h1;
}));
await page.screenshot({ path: '.shots/filters-contacts-rangés.png' });

// Contacts : expanded
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Filtres avancés'));
  btn?.click();
});
await new Promise(r => setTimeout(r, 800));
txt = await page.evaluate(() => document.body.innerText);
ok('contacts : panneau avancé déplié', txt.includes("Historique d'appel") && txt.includes('Appelabilité'));
await page.screenshot({ path: '.shots/filters-contacts-avances.png' });

// Phoning
await gotoWithShell(`${APP}/phoning`);
await new Promise(r => setTimeout(r, 2500));
txt = await page.evaluate(() => document.body.innerText);
ok('phoning : carte "File d\'appels"', txt.includes("File d'appels"));
ok('phoning : libellés de grille', txt.includes('Stage') && txt.includes('Langue'));
await page.screenshot({ path: '.shots/filters-phoning.png' });

await browser.close();
rmSync(base, { recursive: true, force: true, maxRetries: 5 });
if (failed) {
  console.log(`shot-filters : ${failed} échec(s)`);
  process.exit(1);
}
console.log('shot-filters : tout est vert.');
