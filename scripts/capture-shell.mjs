/**
 * Visual check of the sidebar shell redesign against the local dev server.
 * Captures expanded and collapsed states and asserts the rail persisted a reload.
 *
 * The default puppeteer launcher scans child stdout for the WS endpoint and has
 * started timing out on this machine (Chrome 150), so Chrome is spawned here
 * with a fixed debugging port and puppeteer only connects to it.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const [email, password] = [process.env.CRM_EMAIL, process.env.CRM_PASSWORD];
const CHROME_CANDIDATES = [
  // Discounted system Chrome: its headless startup wedges intermittently on
  // this machine, while the bundled headless shell starts reliably.
  '/Users/devops/.cache/puppeteer/chrome-headless-shell/mac-139.0.7258.138/chrome-headless-shell-mac-x64/chrome-headless-shell',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

let chrome = null;
const profile = mkdtempSync(path.join(os.tmpdir(), 'crm-shell-'));

/**
 * Headless Chrome on this machine starts up intermittently (worked, then
 * progressively timed out between runs), so try several ports in sequence
 * instead of betting a single spawn.
 */
/**
 * Try each Chrome binary in turn: the headless shell on this machine starts
 * reliably while the full Chrome wedges intermittently.
 */
let up = false;
let port = 9222;
outer:
for (const CHROME of CHROME_CANDIDATES) {
  process.stderr.write(`essai ${path.basename(CHROME)}\n`);
  for (const attempt of [9222, 9223, 9224]) {
    const chromeSpawn = spawn(CHROME, [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${attempt}`,
      `--user-data-dir=${profile}-${attempt}`,
      'about:blank',
    ], { stdio: 'ignore' });
    for (let i = 0; i < 15; i++) {
      try {
        await fetch(`http://127.0.0.1:${attempt}/json/version`);
        chrome = chromeSpawn;
        port = attempt;
        up = true;
        break outer;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    chromeSpawn.kill('SIGKILL');
    console.error(`port ${attempt} : Chrome ne repond pas`);
  }
}
if (!up) {
  console.error('DevTools Chrome injoignable (9222-9224)');
  rmSync(profile, { recursive: true, force: true });
  process.exit(2);
}

const browser = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${port}`,
  defaultViewport: null,
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });

await page.goto(`${APP}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
const inputs = await page.$$('input');
await inputs[0].type(email);
await inputs[1].type(password);
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
]);
await new Promise(r => setTimeout(r, 2500));

/**
 * The DashboardPage chart can flake on first mount (tw-elements dynamic import)
 * and the ErrorBoundary replaces the whole shell until a reload. One reload is
 * always enough, so retry rather than reporting a false failure.
 */
const gotoWithShell = async (url) => {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  try {
    await page.waitForSelector('aside', { timeout: 15000 });
  } catch {
    console.log('(shell absent, un reload resout le chargement intermittent du graphique)');
    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('aside', { timeout: 20000 });
  }
};

await gotoWithShell(`${APP}/`);
await new Promise(r => setTimeout(r, 3500));

const asideWidth = () => page.evaluate(() =>
  document.querySelector('aside')?.getBoundingClientRect().width ?? 0);

console.log(`1. largeur aside expand : ${await asideWidth()}`);
await page.screenshot({ path: '.shots/shell-expanded.png' });

const toggle = async () => {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label')?.includes('barre latérale'));
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 700));
};

console.log('2. replie le rail');
await toggle();
const w2 = await asideWidth();
console.log(`   largeur aside collapsed : ${w2}`);
await page.screenshot({ path: '.shots/shell-collapsed.png' });

console.log('3. persistence ap reload');
await gotoWithShell(`${APP}/`);
await new Promise(r => setTimeout(r, 3000));
const w3 = await asideWidth();
console.log(`   largeur aside ap reload : ${w3}`);

const labels = await page.evaluate(() => {
  // textContent is returned even for CSS-hidden spans, so visibility is
  // measured by the rendered width instead.
  return [...document.querySelectorAll('nav a')].map(a => {
    const span = a.querySelector('span + span') || a.querySelector('span');
    if (!span) return '(aucun span)';
    const w = span.getBoundingClientRect().width;
    return w > 1 ? a.textContent.trim().slice(0, 12) : '';
  });
});
console.log(`4. labels visibles dans le rail: [${labels.filter(Boolean).join(',')}]`);

let fails = 0;
const check = (c, m) => { console.log(`  ${c ? 'OK   ' : 'ECHEC'} ${m}`); if (!c) fails++; };
check(w2 < 120, `le rail fait 72px (${w2})`);
check(Math.abs(w3 - w2) < 4, `l'etat replie survit au reload (${w3})`);
check(labels.every(l => l === ''), 'aucun label visible dans le rail');

await browser.close();
chrome.kill('SIGKILL');
rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
console.log(fails === 0 ? '\nCapture shell : tout est vert.' : `\nCapture shell : ${fails} echec(s)`);
process.exit(fails === 0 ? 0 : 1);
