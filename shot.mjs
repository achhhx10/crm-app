import puppeteer from 'puppeteer';

const APP = 'https://crm-app-beige-iota.vercel.app';
const [email, password] = [process.env.CRM_EMAIL, process.env.CRM_PASSWORD];

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
// The PWA service worker can hold a stale shell and render the "hors ligne"
// screen even with a live session, which silently invalidates screenshots.
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

const shot = async (name, full = false) => {
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: `.shots/${name}.png`, fullPage: full });
  console.log(`  ${name}.png`);
};

await page.goto(`${APP}/login`, { waitUntil: 'networkidle2' });
await page.waitForSelector('input[type=email]', { timeout: 20000 }).catch(async () => {
  await page.waitForSelector('input[name=email]', { timeout: 20000 });
});
const inputs = await page.$$('input');
await inputs[0].type(email);
await inputs[1].type(password);
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {}),
]);
await new Promise(r => setTimeout(r, 2500));

for (const [route, name, full] of [
  ['/', 'dashboard', true],
  ['/contacts', 'contacts', false],
]) {
  await page.goto(`${APP}${route}`, { waitUntil: 'networkidle2' });
  await shot(name, full);
}

// Wait for the table to actually render: networkidle2 can resolve before React
// paints, which silently produced an all-null measurement.
await page.waitForSelector('table', { timeout: 20000 });

// Measure the table instead of trusting the screenshot: the "Dernier appel"
// column used to overlap itself once the columns were squeezed.
const metrics = await page.evaluate(() => {
  const table = document.querySelector('table');
  const card = table?.closest('.overflow-x-auto');
  const headers = [...(table?.querySelectorAll('thead th') ?? [])].map(th => ({
    text: th.textContent.trim().slice(0, 14),
    width: Math.round(th.getBoundingClientRect().width),
  }));
  const bars = [...document.querySelectorAll('.overflow-x-auto')]
    .map(e => Math.round(e.scrollWidth - e.clientWidth));
  const filterBar = [...document.querySelectorAll('select')].pop()?.closest('.flex');
  return {
    filterBarHeight: filterBar ? Math.round(filterBar.getBoundingClientRect().height) : null,
    tableWidth: Math.round(table?.getBoundingClientRect().width ?? 0),
    minWidth: table?.style.minWidth || null,
    containerOverflowX: card ? Math.round(card.scrollWidth - card.clientWidth) : null,
    headers,
    otherScrollOverflow: bars,
  };
});
console.log(JSON.stringify(metrics, null, 2));

await browser.close();
