// Menü verisinden tüm sayfaları ve SEO dosyalarını üretir.
//   node src/build.js          -> dosyaları yazar
//   node src/build.js --check  -> yazmaz; diskteki çıktı güncel değilse hata verir
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMenu } from './templates/menu.js';
import { renderSite } from './templates/site.js';
import { sitemapXml } from './lib/seo.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src', 'data', 'menu.json');

export async function loadData() {
  return JSON.parse(await readFile(DATA, 'utf8'));
}

/** Çıktı dosyalarını (yol -> içerik) üretir; diske yazmaz. */
export async function render(data = null) {
  data ??= await loadData();
  const s = data.site;
  const out = new Map();
  out.set(join(s.menuPath, 'index.html'), renderMenu(data));
  out.set(join(s.sitePath, 'index.html'), renderSite(data));
  // lastmod veri dosyasındaki "updated" alanından gelir; fiyat değiştirince o tarihi güncelleyin.
  out.set('sitemap.xml', sitemapXml(data, data.updated));
  return out;
}

export async function build({ check = false } = {}) {
  const files = await render();
  const stale = [];
  for (const [rel, content] of files) {
    const abs = join(ROOT, rel);
    if (check) {
      const current = await readFile(abs, 'utf8').catch(() => null);
      if (current !== content) stale.push(rel);
      continue;
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
    console.log(`yazıldı  ${rel}  (${content.length.toLocaleString('tr-TR')} karakter)`);
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
