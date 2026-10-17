/**
 * End-to-end check for the lead editor on the phoning page.
 *
 * The keyboard guard is the part worth automating: isTypingTarget only covers
 * fields, not buttons, so before it existed pressing Enter on the dialog submit
 * button also fired saveCall and logged a bogus call while advancing the queue.
 * A visual pass would never catch that.
 *
 *   CRM_EMAIL=... CRM_PASSWORD=... node scripts/verify-phoning.mjs
 *   API_URL=http://localhost:5173 node scripts/verify-phoning.mjs
 */
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'https://crm-app-beige-iota.vercel.app';
const [email, password] = [process.env.CRM_EMAIL, process.env.CRM_PASSWORD];
const ok = (c, m) => console.log(`  ${c ? 'OK   ' : 'ECHEC'} ${m}`) || c;
let fails = 0;
const check = (c, m) => { if (!ok(c, m)) fails++; };

// puppeteer.launch has started timing out waiting for the system Chrome's WS
// endpoint, so the browser is spawned here and puppeteer only connects. The
// bundled shell starts more reliably than the full application.
const CHROME_CANDIDATES = [
  '/Users/devops/.cache/puppeteer/chrome-headless-shell/mac-139.0.7258.138/chrome-headless-shell-mac-x64/chrome-headless-shell',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const profile = mkdtempSync(path.join(os.tmpdir(), 'crm-phoning-'));
let chrome = null;
let up = false;
let port = 9222;
outer:
for (const CHROME of CHROME_CANDIDATES) {
  for (const attempt of [9222, 9223, 9224]) {
    const spawned = spawn(CHROME, [
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
        chrome = spawned;
        port = attempt;
        up = true;
        break outer;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    spawned.kill('SIGKILL');
  }
}
if (!up) {
  console.error('DevTools Chrome injoignable (9222-9224)');
  rmSync(profile, { recursive: true, force: true, maxRetries: 10 });
  process.exit(2);
}
const browser = await puppeteer.connect({
  browserURL: `http://127.0.0.1:${port}`,
  defaultViewport: null,
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });

await page.goto(`${APP}/login`, { waitUntil: 'networkidle2' });
const inputs = await page.$$('input');
await inputs[0].type(email);
await inputs[1].type(password);
await Promise.all([page.click('button[type=submit]'), page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})]);
await new Promise(r => setTimeout(r, 2500));

await page.goto(`${APP}/phoning`, { waitUntil: 'networkidle2' });
await page.waitForSelector('table, .lg\\:col-span-2', { timeout: 25000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2500));

console.log('\n1. Bouton Modifier present sur la fiche');
const hasEditBtn = await page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => b.textContent.trim().includes('Modifier')));
check(hasEditBtn, 'bouton Modifier rendu');

console.log('\n2. Selecteur de stage propose');
const hasStageSelect = await page.evaluate(() => !!document.querySelector('#ph-stage'));
check(hasStageSelect, 'select #ph-stage present');
const stageOpts = await page.evaluate(() =>
  document.querySelector('#ph-stage') ? document.querySelector('#ph-stage').options.length : 0);
check(stageOpts === 7, `7 stages proposes (trouve ${stageOpts})`);

console.log('\n3. Raccourci E ouvre la modale');
await page.keyboard.press('e');
await new Promise(r => setTimeout(r, 900));
const dialogOpen = await page.evaluate(() => !!document.querySelector('[role=dialog]'));
check(dialogOpen, 'modale ouverte via E');
await page.screenshot({ path: `${process.env.SHOT_DIR || '.shots'}/phoning-edit.png` });

console.log('\n4. Le select stage du phoning est neutralise tant que la modale est ouverte');
// Choisir d'abord un resultat d'appel pour avoir un etat non trivial a verifier.
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 700));
await page.keyboard.press('1');   // "Pas decroche"
await new Promise(r => setTimeout(r, 700));
const readState = () => page.evaluate(() => {
  const sel = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Pas décroché'));
  const stage = document.querySelector('#ph-stage')?.value;
  return { picked: sel ? sel.className.includes('bg-primary') : null, stage };
});
const beforeState = await readState();
check(beforeState.picked === true, `resultat "Pas decroche" selectionne avant ouverture (stage=${beforeState.stage})`);

// Ouvre la modale puis tente de changer de resultat via le raccourci clavier.
await page.keyboard.press('e');
await new Promise(r => setTimeout(r, 900));
await page.keyboard.press('4');   // devrait selectionner "Interesse"
await page.keyboard.press('Enter'); // ne doit pas enregistrer l'appel
await new Promise(r => setTimeout(r, 900));
const during = await readState();
check(during.picked === true, `le resultat n'a pas change via le clavier (toujours ${during.picked})`);
check(during.stage === beforeState.stage, `le stage du phoning n'a pas derive (${beforeState.stage} -> ${during.stage})`);
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 800));

console.log('\n5. Entree dans la modale ne sauvegarde pas l\'appel');
// Rouvre la modale: le nettoyage du test 4 l'a deja fermee.
await page.keyboard.press('e');
await new Promise(r => setTimeout(r, 900));
// Compare the lead being worked on, not the timer, which keeps running.
const readLead = () => page.evaluate(() =>
  document.querySelector('[data-queue-current="true"] .font-medium')?.textContent?.trim() || '');
const leadBefore = await readLead();
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 1400));
const stillOpen = await page.evaluate(() => !!document.querySelector('[role=dialog]'));
check(stillOpen, 'la modale reste ouverte');
const leadAfter = await readLead();
check(leadBefore === leadAfter && leadBefore.length > 0,
  `meme lead dans la file (${leadBefore} -> ${leadAfter})`);

console.log('\n6. Echap ferme la modale');
await page.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 900));
const closed = await page.evaluate(() => !document.querySelector('[role=dialog]'));
check(closed, 'modale fermee');

console.log('\n7. Le champ stage est bien rempli et coherent');
const stageVal = await page.evaluate(() => document.querySelector('#ph-stage')?.value);
check(Boolean(stageVal), `stage courant = ${stageVal}`);

await browser.close();
if (chrome) chrome.kill('SIGKILL');
rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
console.log(fails === 0 ? '\nTout est vert.' : `\n${fails} controle(s) en échec.`);
process.exit(fails ? 1 : 0);
