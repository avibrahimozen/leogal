// Masa kartlarını PDF ve PNG olarak dışa aktarır (headless Chromium).
//   npm i -D playwright && npx playwright install chromium
//   npm run pdf
// Playwright başka bir yerde kuruluysa: PLAYWRIGHT_PATH=/yol/node_modules/playwright npm run pdf
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadData } from './build.js';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const spec of ['playwright', process.env.PLAYWRIGHT_PATH].filter(Boolean)) {
    try { return require(spec); } catch { /* sıradakini dene */ }
  }
  console.error('Playwright bulunamadı. Kurulum: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const data = await loadData();
const sample = Math.min(12, data.tables); // önizleme PNG'si için örnek masa
const JOBS = [
  { html: 'masa-karti.html', pdf: 'qr/masa-karti.pdf', png: 'qr/masa-karti.png', pngSelector: '.card' },
  { html: 'masa-kartlari.html', pdf: 'qr/masa-kartlari.pdf', png: 'qr/masa-karti-numarali.png', pngSelector: `.card[data-table="${sample}"]` },
  { html: 'masa-kartlari-a4.html', pdf: 'qr/masa-kartlari-a4.pdf' },
];

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
try {
  for (const job of JOBS) {
    const page = await browser.newPage({ deviceScaleFactor: 3 });
    await page.goto(pathToFileURL(join(ROOT, job.html)).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: join(ROOT, job.pdf), printBackground: true, preferCSSPageSize: true });
    if (job.png) {
      const el = await page.$(job.pngSelector);
      if (!el) throw new Error(`${job.html}: ${job.pngSelector} bulunamadı`);
      await el.screenshot({ path: join(ROOT, job.png) });
    }
    await page.close();
    console.log(`yazıldı  ${job.pdf}${job.png ? ', ' + job.png : ''}`);
  }
} finally {
  await browser.close();
}
