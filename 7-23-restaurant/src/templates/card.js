// Basılabilir masa kartları: A6 (105 × 148 mm), logo, slogan, QR menü, telefon, saatler, adres.
// Tek şablon üç dosya üretir: numarasız kart, 1..N masa numaralı kartlar ve A4 kâğıda 4'lü yerleşim.
// Yazı tipleri ve QR kod dosyaya gömülüdür; kart internet olmadan da aynı basılır.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSETS_DIR, logo } from '../lib/assets.js';
import { esc } from '../lib/seo.js';

const FONTS_DIR = join(ASSETS_DIR, 'fonts');
const QR_FILE = join(ASSETS_DIR, '..', '..', 'qr', 'menu-qr.svg');

// Kart yalnızca Türkçe basılır; metinler burada.
const T = {
  title: 'Masa Kartı',
  scan: 'Menü için okutun',
  table: 'Masa',
  delivery: 'Alo Paket',
  daily: 'Her gün',
  qrLabel: 'QR menü kodu',
};

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
// Google Fonts'tan alınan woff2 dosyaları (SIL Open Font License). Source Sans 3 değişken yazı tipidir (200–900).
const FONTS = [
  ['Bebas Neue', '400', 'bebas-neue-400-latin-ext.woff2', LATIN_EXT],
  ['Bebas Neue', '400', 'bebas-neue-400-latin.woff2', LATIN],
  ['Source Sans 3', '200 900', 'source-sans-3-latin-ext.woff2', LATIN_EXT],
  ['Source Sans 3', '200 900', 'source-sans-3-latin.woff2', LATIN],
];

let fontCss = null;
function fonts() {
  fontCss ??= FONTS.map(([family, weight, file, range]) => {
    const b64 = readFileSync(join(FONTS_DIR, file)).toString('base64');
    return `@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: block; src: url(data:font/woff2;base64,${b64}) format('woff2'); unicode-range: ${range}; }`;
  }).join('\n');
  return fontCss;
}

let qrSvg = null;
/** qr/menu-qr.svg (segno çıktısı) içindeki çizgi yolunu, sessiz bölge olmadan kare bir SVG olarak döndürür. */
function qr() {
  if (qrSvg) return qrSvg;
  const src = readFileSync(QR_FILE, 'utf8');
  const d = src.match(/<path class="qrline"[^>]*\sd="([^"]+)"/)?.[1];
  const scale = Number(src.match(/scale\((\d+)\)/)?.[1]);
  const width = Number(src.match(/\swidth="(\d+)"/)?.[1]);
  const border = Number(d?.match(/^M(\d+)\s/)?.[1]);
  if (!d || !scale || !width || Number.isNaN(border)) throw new Error('qr/menu-qr.svg okunamadı: beklenen segno çizgi biçimi değil');
  const modules = width / scale - 2 * border;
  qrSvg = `<svg class="qr" viewBox="${border} ${border} ${modules} ${modules}" shape-rendering="crispEdges" role="img" aria-label="${T.qrLabel}"><path stroke="#141210" d="${d}"/></svg>`;
  return qrSvg;
}

const CARD_CSS = `
  :root {
    --komur: #141210; --koz: #ffcc00; --kul: #6f675f; --pide: #f3ead9; --cizgi: #d9d2c6;
    --display: "Bebas Neue", "Arial Narrow", Impact, sans-serif;
    --body: "Source Sans 3", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: var(--body); color: var(--komur); }
  .card {
    width: 105mm; height: 148mm; background: #fff; overflow: hidden; position: relative;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    display: grid; grid-template-rows: auto 1fr auto; text-align: center;
  }
  .top { background: var(--komur); color: var(--pide); padding: 4.5mm 8mm 3.5mm; display: grid; justify-items: center; gap: 2.2mm; }
  .top .logo { width: 29mm; height: auto; display: block; }
  .top .slogan { font-size: 4mm; line-height: 1.2; font-style: italic; color: #a89f94; margin: 0; }
  .top .slogan b { color: var(--pide); font-style: normal; font-weight: 600; }
  /* Masa numarası: başlığın alt kenarına oturan sarı rozet; yarısı koyu, yarısı beyaz zeminde. */
  .top .masa {
    position: relative; z-index: 1; margin: 0.8mm 0 -8.6mm;
    display: inline-grid; grid-auto-flow: column; align-items: baseline; gap: 2mm;
    padding: 1.2mm 4.5mm 0.9mm; background: var(--koz); color: var(--komur);
    border: 0.6mm solid #fff; border-radius: 2.4mm; font-family: var(--display); line-height: 1;
  }
  .top .masa .k { font-size: 5mm; letter-spacing: .14em; }
  .top .masa .n { font-size: 10.5mm; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
  .mid { display: grid; align-content: center; justify-items: center; gap: 3mm; padding: 3mm 8mm; min-height: 0; }
  .card[data-table] .mid { padding-top: 10mm; }
  /* "rakam" biçemi: rozette yalnızca büyük numara, "Masa" yazısı yok. */
  .card[data-style="rakam"] .top .logo { width: 27mm; }
  .card[data-style="rakam"] .masa { margin-bottom: -12mm; padding: 1.2mm 6mm 0.6mm; min-width: 24mm; justify-content: center; }
  .card[data-style="rakam"] .masa .n { font-size: 15mm; }
  .card[data-style="rakam"] .mid { padding-top: 13.5mm; gap: 2.5mm; }
  .card[data-style="rakam"] .mid .qr { width: 40mm; height: 40mm; }
  .mid .t { font-family: var(--display); font-size: 7mm; line-height: 1; letter-spacing: .04em; }
  .mid .qr { width: 41mm; height: 41mm; display: block; }
  .bot { border-top: 1px dashed var(--cizgi); padding: 3.5mm 8mm 4mm; display: grid; gap: 1mm; }
  .bot .k { font-size: 3.1mm; letter-spacing: .16em; text-transform: uppercase; color: var(--kul); }
  .bot .v { font-family: var(--display); font-size: 8.2mm; line-height: 1; letter-spacing: .05em; white-space: nowrap; }
  .bot .h { font-size: 3.1mm; color: var(--kul); line-height: 1.3; }
`;

function slogan(text) {
  const i = text.indexOf(', ');
  const [a, b] = i === -1 ? ['', text] : [text.slice(0, i + 1), text.slice(i + 2)];
  return `${esc(a)} <b>${esc(b)}</b>`.trim();
}

/**
 * Tek kart. table: 1..N masa numarası ya da null (numarasız kart).
 * style: 'masa' (rozette "Masa 12") | 'rakam' (rozette yalnızca büyük "12").
 */
export function card(data, { table = null, style = 'masa' } = {}) {
  const b = data.business;
  const masa = table == null ? '' : `
    <div class="masa" aria-label="${T.table} ${table}">${style === 'rakam' ? '' : `<span class="k">${T.table}</span>`}<span class="n">${table}</span></div>`;
  const attrs = table == null ? '' : ` data-table="${table}"${style === 'masa' ? '' : ` data-style="${style}"`}`;
  return `<div class="card"${attrs}>
  <div class="top">
    ${logo('dark', { label: `${b.name} logosu` })}
    <p class="slogan">${slogan(b.slogan)}</p>${masa}
  </div>
  <div class="mid">
    <div class="t">${T.scan}</div>
    ${qr()}
  </div>
  <div class="bot">
    <div class="k">${T.delivery}</div>
    <div class="v">${esc(b.phoneDisplay)}</div>
    <div class="h">${T.daily} ${esc(b.hours.opens)} – ${esc(b.hours.closes)}<br>${esc(b.address.short)}, ${esc(b.address.district)}</div>
  </div>
</div>`;
}

function doc({ title, css, body }) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${fonts()}
${CARD_CSS}
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

const A6_CSS = `
  /* Her sayfada bir kart (A6 dikey). Ekranda kartlar yan yana önizlenir. */
  @page { size: 105mm 148mm; margin: 0; }
  body { background: #4a4440; padding: 24px; display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; }
  .page { width: 105mm; height: 148mm; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
  @media print {
    body { background: #fff; padding: 0; display: block; }
    .page { box-shadow: none; page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
  }
`;

const A4_CSS = `
  /* A4 kâğıda 4 kart (2 × 2); kesim çizgileri kartların arasındadır. */
  @page { size: 210mm 297mm; margin: 0; }
  body { background: #4a4440; padding: 24px; display: grid; justify-content: center; gap: 24px; }
  .sheet { position: relative; width: 210mm; height: 297mm; background: #fff; box-shadow: 0 12px 40px rgba(0,0,0,.35); display: grid; grid-template-columns: 105mm 105mm; grid-auto-rows: 148.5mm; align-content: start; }
  .sheet .card { margin: 0.25mm 0 0; }
  .sheet .cut { position: absolute; border: 0 dashed #9b9389; pointer-events: none; }
  .sheet .cut.v { left: 105mm; top: 0; bottom: 0; border-left-width: 0.2mm; }
  .sheet .cut.h { top: 148.5mm; left: 0; right: 0; border-top-width: 0.2mm; }
  @media print {
    body { background: #fff; padding: 0; display: block; }
    .sheet { box-shadow: none; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
  }
`;

/** A6 belge: verilen masa numaralarının her biri için bir sayfa ([null] = numarasız tek kart). */
export function renderCards(data, { tables, style = 'masa' }) {
  const title = tables.length === 1 && tables[0] == null ? `${T.title} · ${data.business.name}` : `${T.title}ları 1–${tables.length} · ${data.business.name}`;
  const body = tables.map((t) => `<section class="page">\n${card(data, { table: t, style })}\n</section>`).join('\n');
  return doc({ title, css: A6_CSS, body });
}

/** A4 belge: aynı kartlar sayfa başına dört tane. */
export function renderSheets(data, { tables, style = 'masa' }) {
  const sheets = [];
  for (let i = 0; i < tables.length; i += 4) {
    const cards = tables.slice(i, i + 4).map((t) => card(data, { table: t, style })).join('\n');
    sheets.push(`<section class="sheet">\n${cards}\n<div class="cut v"></div><div class="cut h"></div>\n</section>`);
  }
  return doc({ title: `${T.title}ları A4 · ${data.business.name}`, css: A4_CSS, body: sheets.join('\n') });
}
