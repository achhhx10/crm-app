import puppeteer from 'puppeteer';

const APP = 'https://crm-app-beige-iota.vercel.app';
const [email, password] = [process.env.CRM_EMAIL, process.env.CRM_PASSWORD];

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
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
  ['/phoning', 'phoning', false],
  ['/', 'dashboard', true],
]) {
  await page.goto(`${APP}${route}`, { waitUntil: 'networkidle2' });
  await shot(name, full);
}

await browser.close();
