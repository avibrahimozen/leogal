// Kalite kontrolü: çıktı güncel mi, veri tutarlı mı, SEO parçaları yerinde mi, bağlantılar çalışıyor mu, çeviriler tam mı.
//   npm test
import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { build, loadData, OUT } from './build.js';
import { LANGS, localize } from './lib/i18n.js';

const errors = [];
const fail = (m) => errors.push(m);

const data = await loadData();

// 1. Veri tutarlılığı
const ids = new Set();
for (const sec of data.sections) {
  for (const it of sec.items) {
    if (it.separator) continue;
    if (ids.has(it.id)) fail(`Tekrarlanan ürün id: ${it.id}`);
    ids.add(it.id);
    if (sec.type === 'grams') {
      if (!Array.isArray(it.prices) || it.prices.length !== data.gramSizes.length) fail(`${it.id}: ${data.gramSizes.length} gramaj fiyatı bekleniyor`);
      for (const p of it.prices) if (p != null && !(Number.isInteger(p) && p > 0)) fail(`${it.id}: geçersiz fiyat ${p}`);
    } else if (!(Number.isInteger(it.price) && it.price > 0)) fail(`${it.id}: geçersiz fiyat ${it.price}`);
  }
  if (sec.feature) {
    if (ids.has(sec.feature.id)) fail(`Tekrarlanan ürün id: ${sec.feature.id}`);
    ids.add(sec.feature.id);
  }
}
for (const f of data.featured) if (!ids.has(f.id)) fail(`featured: bilinmeyen ürün "${f.id}"`);
const allergenKeys = new Set(Object.keys(data.allergenNames || {}));
for (const sec of data.sections) {
  const all = [...sec.items.filter((i) => !i.separator), ...(sec.feature ? [sec.feature] : [])];
  for (const it of all) {
    const isGrams = sec.type === 'grams' && it !== sec.feature;
    if (isGrams) {
      if (!Array.isArray(it.kcal) || it.kcal.length !== data.gramSizes.length) fail(`${it.id}: gramaj başına kalori dizisi eksik`);
      else it.kcal.forEach((k, i) => { if ((k == null) !== (it.prices[i] == null)) fail(`${it.id}: ${data.gramSizes[i]} gr için fiyat ve kalori birlikte olmalı`); });
    } else if (!Number.isInteger(it.kcal) || it.kcal < 0) fail(`${it.id}: kalori eksik`);
    for (const k of [...(it.allergens || []), ...(it.traces || [])]) if (!allergenKeys.has(k)) fail(`${it.id}: bilinmeyen alerjen "${k}"`);
    for (const k of it.allergens || []) if ((it.traces || []).includes(k)) fail(`${it.id}: "${k}" hem içerir hem eser listesinde`);
  }
}

// 2. Çeviriler: her dilde her arayüz metni, bölüm başlığı ve ürün adı var mı
const base = localize(data);
for (const lang of LANGS) {
  const d = localize(data, lang.code);
  for (const key of Object.keys(base.ui)) if (d.ui[key] == null) fail(`${lang.code}: arayüz metni eksik "${key}"`);
  if (lang.default) continue;
  for (const sec of d.sections) {
    const raw = data.sections.find((x) => x.id === sec.id);
    if (sec.title === raw.title) fail(`${lang.code}: bölüm başlığı çevrilmemiş "${sec.id}"`);
    for (const it of sec.items) {
      if (it.separator) continue;
      const r = raw.items.find((x) => x.id === it.id);
      if (it.name === r.name && !/^(Ayran|Fanta|Sprite|Fuse Tea)$/.test(r.name)) fail(`${lang.code}: ürün adı çevrilmemiş "${it.id}"`);
    }
  }
  if (d.business.faq.length !== data.business.faq.length) fail(`${lang.code}: SSS sayısı farklı`);
  if (d.business.perks.length !== data.business.perks.length) fail(`${lang.code}: vaat sayısı farklı`);
  if (d.business.wood.points.length !== data.business.wood.points.length) fail(`${lang.code}: odun ateşi madde sayısı farklı`);
  if (Object.keys(d.allergenNames).length !== Object.keys(data.allergenNames).length) fail(`${lang.code}: alerjen adları eksik`);
}

// 3. Çıktı güncel mi
await build({ check: true });
if (process.exitCode) { fail('Üretilen dosyalar güncel değil'); process.exitCode = 0; }

// 4. Sayfa içeriği ve SEO (her dil)
const pages = [];
for (const lang of LANGS) {
  const d = localize(data, lang.code);
  pages.push({ lang: lang.code, kind: 'menu', rel: join(d.site.menuPath, 'index.html'), canonical: d.site.baseUrl + d.site.menuPath, data: d });
  pages.push({ lang: lang.code, kind: 'site', rel: join(d.site.sitePath, 'index.html'), canonical: d.site.baseUrl + d.site.sitePath, data: d });
  for (const a of d.site.menuAliases ?? []) pages.push({ lang: lang.code, kind: 'menu', rel: join(a, 'index.html'), canonical: d.site.baseUrl + d.site.menuPath, data: d, alias: true });
}
const hrefRe = /(?:href|src)="([^"]+)"/g;
for (const page of pages) {
  const abs = join(OUT, page.rel);
  const html = await readFile(abs, 'utf8');
  const must = [
    [`<html lang="${page.lang}">`, `lang="${page.lang}"`],
    ['<title>', 'title'],
    ['<meta name="description"', 'meta description'],
    [`<link rel="canonical" href="${page.canonical}">`, 'canonical'],
    ['hreflang="x-default"', 'hreflang'],
    ['property="og:title"', 'Open Graph başlığı'],
    ['application/ld+json', 'JSON-LD'],
    ['<h1', 'h1 başlığı'],
    [data.business.phoneDisplay, 'telefon numarası'],
    ['class="lang"', 'dil değiştirici'],
  ];
  for (const [needle, label] of must) if (!html.includes(needle)) fail(`${page.rel}: ${label} eksik`);
  for (const lang of LANGS) if (!html.includes(`hreflang="${lang.code}"`)) fail(`${page.rel}: hreflang ${lang.code} eksik`);

  const titles = html.match(/<title>(.*?)<\/title>/)?.[1] ?? '';
  if (titles.length > 70) fail(`${page.rel}: başlık ${titles.length} karakter, 70'i geçmemeli`);
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  if (desc.length > 160) fail(`${page.rel}: açıklama ${desc.length} karakter, 160'ı geçmemeli`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) fail(`${page.rel}: tam olarak bir h1 olmalı`);

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { fail(`${page.rel}: JSON-LD bozuk (${e.message})`); }
  }

  for (const m of html.matchAll(hrefRe)) {
    const href = m[1];
    if (/^(https?:|tel:|mailto:|#|data:)/.test(href)) continue;
    const target = join(dirname(abs), href.split('#')[0].split('?')[0] || 'index.html');
    const file = target.endsWith('/') || !/\.\w+$/.test(target) ? join(target, 'index.html') : target;
    await access(file).catch(() => fail(`${page.rel}: kırık bağlantı ${href}`));
  }

  // Menü sayfasında her ürün ve fiyat (o dildeki adıyla) görünüyor mu
  if (page.kind === 'menu') {
    for (const sec of page.data.sections) {
      for (const it of sec.items) {
        if (it.separator) continue;
        if (!html.includes(it.name.replace(/&/g, '&amp;'))) fail(`${page.rel}: ürün adı yok: ${it.name}`);
        const prices = sec.type === 'grams' ? it.prices.filter((p) => p != null) : [it.price];
        for (const p of prices) if (!html.includes(`${p} ₺`)) fail(`${page.rel}: fiyat yok: ${it.name} ${p} ₺`);
      }
    }
  }
}

// 5. Site haritası, CNAME, robots
const sitemap = await readFile(join(OUT, 'sitemap.xml'), 'utf8');
for (const page of pages) if (!sitemap.includes(`<loc>${page.canonical}</loc>`)) fail(`sitemap.xml: ${page.canonical} eksik`);
const cname = await readFile(join(OUT, 'CNAME'), 'utf8').catch(() => '');
if (data.site.domainActive && cname.trim() !== data.site.domain) fail(`CNAME dosyası "${data.site.domain}" olmalı`);
if (!data.site.domainActive && cname) fail('Alan adı kapalıyken CNAME dosyası olmamalı');
const robots = await readFile(join(OUT, 'robots.txt'), 'utf8').catch(() => '');
if (!robots.includes('Sitemap: ' + data.site.baseUrl + 'sitemap.xml')) fail('robots.txt sitemap satırı eksik');

if (errors.length) {
  console.error(`${errors.length} sorun:\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`Tamam: ${ids.size} ürün, ${LANGS.length} dil, ${pages.length} sayfa, sitemap.xml. Alan adı: ${data.site.domainActive ? data.site.domain + ' (açık)' : 'kapalı, ' + data.site.baseUrl}`);
