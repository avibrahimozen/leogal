// Şablonların ortak parçaları: göreli yol, dil değiştirici.
import { esc } from './seo.js';
import { alternates, fmt } from './i18n.js';
import { flags } from './icons.js';

/** Sayfa yolundan köke çıkış öneki: 'en/menu/' -> '../../', '' -> ''. */
export function up(path) {
  const depth = String(path).split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

/** Bir sayfadan başka bir sayfaya göreli bağlantı. */
export function rel(fromPath, toPath) {
  return up(fromPath) + toPath || './';
}

/** Bayraklı dil değiştirici. kind: 'site' | 'menu'. */
export function langSwitcher(data, kind, fromPath) {
  const cur = data.lang.code;
  const links = alternates(kind).map((a) => {
    const on = a.code === cur;
    return `<a href="${esc(rel(fromPath, a.path))}" hreflang="${a.code}" lang="${a.code}" title="${esc(a.label)}"${on ? ' class="on" aria-current="true"' : ''}>${flags[a.code]}<span>${a.code.toUpperCase()}</span></a>`;
  });
  return `<nav class="lang" aria-label="${esc(data.ui.language)}">${links.join('')}</nav>`;
}

/** Yapımcı satırı: "... {studio}'te özenle üretilmiştir." Stüdyo adı bağlantıdır. */
export function madeBy(data) {
  const st = data.studio;
  if (!st?.name || !st?.url) return '';
  const link = `<a href="${esc(st.url)}" target="_blank" rel="noopener">${esc(st.name)}</a>`;
  return `<p class="made">${fmt(esc(data.ui.madeBy), { studio: link })}</p>`;
}

/** Yapımcı satırı için ortak CSS. */
export const MADE_CSS = `
  .made { margin: 0; font-size: 13px; line-height: 1.4; color: var(--kul-koyu); }
  .made a { color: var(--kul); text-decoration: none; border-bottom: 1px solid currentColor; }
  .made a:hover { color: var(--koz); }
`;

/** Dil değiştirici için ortak CSS. */
export const LANG_CSS = `
  .lang { display: flex; gap: 4px; }
  .lang a { display: inline-flex; align-items: center; gap: 5px; text-decoration: none; padding: 5px 8px; border-radius: 6px; border: 1px solid transparent; color: var(--kul); font-size: 12px; font-weight: 700; letter-spacing: .06em; line-height: 1; }
  .lang a svg { width: 20px; height: 14px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.35); flex: 0 0 auto; }
  .lang a:hover { color: var(--pide); }
  .lang a.on { border-color: var(--koz); color: var(--pide); }
`;
