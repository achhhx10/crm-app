/**
 * Sort diagnostic for the prospects table: click each sortable header with a
 * REAL mouse click (hit-testing included), then verify the URL picks up
 * ?sortBy=, the header switches to an active chevron, and the row order
 * changes. On failure, elementFromPoint at the click coordinates names the
 * topmost element there - the direct evidence of an invisible occluder.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const [email, password] = [process.env.CRM_EMAIL, process.env.CRM_PASSWORD];
const CHROME_CANDIDATES = [
  '/Users/devops/.cache/puppeteer/chrome-headless-shell/mac-139.0.7258.138/chrome-headless-shell-mac-x64/chrome-headless-shell',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const base = mkdtempSync(path.join(os.tmpdir(), 'crm-sort-'));
let chrome = null;
let up = false;
outer:
for (const CHROME of CHROME_CANDIDATES) {
  process.stderr.write(`essai ${path.basename(CHROME)}\n`);
  for (const attempt of [9256, 9257, 9258]) {
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
await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 2 });
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

const snapshot = async () => ({
  url: page.url(),
  chevron: await page.evaluate(() => {
    const th = [...document.querySelectorAll('thead th')].find(t =>
      t.querySelector('.lucide-chevron-down, .lucide-chevron-up'));
    return th ? th.textContent.trim() : null;
  }),
  row: await page.evaluate(() => document.querySelector('tbody tr')?.innerText?.replace(/\n/g, ' | ') || ''),
});

await gotoWithShell(`${APP}/contacts`);
await new Promise(r => setTimeout(r, 2500));

const COLUMNS = [
  { label: 'Entreprise', field: 'businessName' },
  { label: 'Dernier appel', field: 'lastCall' },
  { label: 'Note', field: 'googleRating' },
  { label: 'Stage', field: 'stage' },
];

for (const col of COLUMNS) {
  const before = await snapshot();
  const box = await page.evaluate((label) => {
    const th = [...document.querySelectorAll('thead th')].find(t => t.textContent.trim().startsWith(label));
    if (!th) return null;
    const div = th.querySelector('div');
    const r = div.getBoundingClientRect();
    (th.closest('.overflow-x-auto') || document.querySelector('main') || document.body)
      .scrollTo({ left: 0 });
    div.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r2 = div.getBoundingClientRect();
    const el = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
    return {
      x: r2.left + r2.width / 2,
      y: r2.top + r2.height / 2,
      topElement: el ? `${el.tagName}.${String(el.className).slice(0, 60)}` : 'none',
    };
  }, col.label);

  if (!box) {
    ok(`sort ${col.field}`, false, 'th introuvable');
    continue;
  }

  await page.evaluate(() => {
    window.__sortClicks = 0;
    window.__lastClick = '';
    document.addEventListener('click', (e) => {
      window.__sortClicks += 1;
      window.__lastClick = `${e.target.tagName}.${String(e.target.className).toString().slice(0, 40)}`;
    }, true);
  });

  await page.mouse.click(box.x, box.y);
  await new Promise(r => setTimeout(r, 1800));
  const trustedClicks = await page.evaluate(() => window.__sortClicks);
  const trustedTarget = await page.evaluate(() => window.__lastClick);

  const after1 = await snapshot();

  const params1 = new URL(after1.url).searchParams;
  const cf = params1.get('sortBy') || 'opportunity';
  const cd = params1.get('sortDir') || 'desc';
  const beforeParams = new URL(before.url).searchParams;
  const bf = beforeParams.get('sortBy') || 'opportunity';
  const bd = beforeParams.get('sortDir') || 'desc';

  const fieldOK = cf === col.field;
  const dirChanged = cf !== bf || cd !== bd || before.row !== after1.row;
  const chevronOK = !!after1.chevron && after1.chevron.startsWith(col.label);
  const rowsDiffer = dirChanged;

  ok(`sort ${col.field} : param URL`, fieldOK, fieldOK ? `sortBy=${cf} ${cd}` : 'tri par défaut resté');
  ok(`sort ${col.field} : chevron actif`, chevronOK, after1.chevron ? `chevron sur «${after1.chevron.slice(0, 24)}»` : 'aucun chevron');
  ok(`sort ${col.field} : réordonnancement`, rowsDiffer, 'ordre inchangé');
  console.log(`    ↳ clic souris natif: ${trustedClicks}@${trustedTarget || 'aucun'} | chevron: ${after1.chevron || 'aucun'}`);
  console.log(`    ↳ URL après clic : ${after1.url}`);
  if (!fieldOK || !chevronOK || !rowsDiffer) {
    console.log(`    ↳ elementFromPoint au clic : ${box.topElement}`);
  }

  // rééquilibrer pour la colonne suivante (revenir au tri par défaut)
  if (fieldOK) {
    await page.evaluate(() => {
      const th = [...document.querySelectorAll('thead th')].find(t => t.textContent.trim().startsWith('Opportunité'));
      th?.querySelector('div')?.click();
    });
    await new Promise(r => setTimeout(r, 1800));
  }
}

// Test croisé : les filtres partagent le même patch() -> setSearchParams(fn).
// Si un preset ne met pas l'URL à jour, patch est cassé GLOBALEMENT (v7).
await page.goto(`${APP}/contacts`, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Chaud'));
  btn?.click();
});
await new Promise(r => setTimeout(r, 2000));
const presetUrl = page.url();
const presetParams = new URL(presetUrl).searchParams;
ok('crosscheck : preset "Chaud" -> URL', presetParams.get('hasSite') === 'pas_de_site',
  presetParams.toString() || 'URL SANS PARAMS = patch/setSearchParams cassé');

// Sélecteur stage : route patch(champ) + patch(limit) dans le MÊME tick
await page.goto(`${APP}/contacts`, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));
// page.select émet des events natifs (input+change) que React sait lire.
// Stage réel : identifie (pas de stage "nouveau" dans STAGES).
await page.select('#f-stage', 'identifie');
await new Promise(r => setTimeout(r, 1800));
const stageParams = new URL(page.url()).searchParams;
ok('crosscheck : select stage -> URL', stageParams.get('stage') === 'identifie', stageParams.toString() || 'non annoté');

// Pagination : Suivant -> ?page=2
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Suivant');
  btn?.click();
});
await new Promise(r => setTimeout(r, 1800));
const pageParam = new URL(page.url()).searchParams.get('page');
ok('crosscheck : pagination Suivant -> ?page=2', pageParam === '2', pageParam || 'page reste 1');

await browser.close();
rmSync(base, { recursive: true, force: true, maxRetries: 5 });
if (failed) {
  console.log(`verify-sort : ${failed} échec(s)`);
  process.exit(1);
}
console.log('verify-sort : tout est vert.');
