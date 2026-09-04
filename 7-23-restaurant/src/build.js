// Menü verisinden tüm sayfaları ve SEO dosyalarını üretir.
//   node src/build.js          -> dosyaları yazar
//   node src/build.js --check  -> yazmaz; diskteki çıktı güncel değilse hata verir
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMenu } from './templates/menu.js';
import { renderSite } from './templates/site.js';
import { renderNotFound } from './templates/notfound.js';
import { sitemapXml, robotsTxt } from './lib/seo.js';
import { STATIC_ASSETS, ASSETS_DIR } from './lib/assets.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Yayın kökü: depo kökü. GitHub Pages ve özel alan adı buradan servis edilir. */
export const OUT = join(ROOT, '..');
const DATA = join(ROOT, 'src', 'data', 'menu.json');

export async function loadData() {
  const data = JSON.parse(await readFile(DATA, 'utf8'));
  // Alan adı anahtarı: domainActive true olana kadar sayfalar github.io adresini kullanır ve CNAME üretilmez.
  // Böylece DNS hazır olmadan github.io adresleri özel alan adına yönlendirilip kırılmaz.
  data.site.baseUrl = data.site.domainActive ? data.site.domainBaseUrl : data.site.legacyBaseUrl;
  return data;
}

/** Çıktı dosyalarını (yol -> içerik) üretir; diske yazmaz. */
export async function render(data = null) {
  data ??= await loadData();
  const s = data.site;
  const out = new Map();
  out.set(join(s.sitePath, 'index.html'), renderSite(data));
  out.set(join(s.menuPath, 'index.html'), renderMenu(data));
  // Basılı QR kodların adresi: aynı menü, canonical /menu/ adresini gösterir.
  for (const alias of s.menuAliases ?? []) out.set(join(alias, 'index.html'), renderMenu(data, { path: alias }));
  out.set('404.html', renderNotFound(data));
  // lastmod veri dosyasındaki "updated" alanından gelir; fiyat değiştirince o tarihi güncelleyin.
  out.set('sitemap.xml', sitemapXml(data, data.updated));
  out.set('robots.txt', robotsTxt(data));
  for (const name of STATIC_ASSETS) out.set(join('assets', name), await readFile(join(ASSETS_DIR, name)));
  if (s.domainActive) out.set('CNAME', s.domain + '\n');
  return out;
}

export async function build({ check = false } = {}) {
  const data = await loadData();
  const files = await render(data);
  const stale = [];
  // Alan adı kapalıyken eski bir CNAME kalmış olmamalı.
  if (!data.site.domainActive) {
    const cname = join(OUT, 'CNAME');
    if (check) { if (await readFile(cname, 'utf8').catch(() => null) !== null) stale.push('CNAME (silinmeli)'); }
    else await rm(cname, { force: true });
  }
  for (const [rel, content] of files) {
    const abs = join(OUT, rel);
    const binary = Buffer.isBuffer(content);
    if (check) {
      const current = await readFile(abs, binary ? undefined : 'utf8').catch(() => null);
      const same = binary ? current !== null && Buffer.compare(current, content) === 0 : current === content;
      if (!same) stale.push(rel);
      continue;
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
    console.log(`yazıldı  ${rel}  (${content.length.toLocaleString('tr-TR')} ${binary ? 'bayt' : 'karakter'})`);
  }
  if (check) {
    if (stale.length) {
      console.error(`Güncel değil: ${stale.join(', ')}\n"npm run build" çalıştırıp çıktıyı commit edin.`);
      process.exitCode = 1;
    } else {
      console.log('Çıktı güncel.');
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build({ check: process.argv.includes('--check') }).catch((e) => { console.error(e); process.exit(1); });
}
