// Çok dilli veri: Türkçe temel veriyi seçilen dile göre yerelleştirir.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const I18N = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'i18n.json'), 'utf8'));

export const LANGS = I18N.langs;
export const DEFAULT_LANG = LANGS.find((l) => l.default) || LANGS[0];

/** "{district}" gibi yer tutucuları doldurur. */
export function fmt(s, vars = {}) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

/**
 * Verinin dile göre yerelleştirilmiş kopyası: iş metinleri, bölüm ve ürün adları, öne çıkanlar.
 * Döndürülen nesnede ayrıca: lang (dil kaydı), ui (arayüz metinleri), kcalUnit.
 */
export function localize(data, code = DEFAULT_LANG.code) {
  const lang = LANGS.find((l) => l.code === code);
  if (!lang) throw new Error(`Bilinmeyen dil: ${code}`);
  const out = structuredClone(data);
  out.lang = lang;
  out.ui = I18N.ui[code];
  out.kcalUnit = I18N.kcal[code] || 'kcal';
  out.site = { ...out.site, locale: lang.locale, sitePath: lang.sitePath, menuPath: lang.menuPath, menuAliases: lang.default ? out.site.menuAliases : [] };
  if (lang.default) return out;

  out.business = deepMerge(out.business, I18N.business[code] || {});
  out.allergenNames = { ...out.allergenNames, ...((I18N.business[code] || {}).allergenNames || {}) };
  out.nutritionNotice = (I18N.business[code] || {}).nutritionNotice || out.nutritionNotice;
  const secs = I18N.sections[code] || {};
  const items = I18N.items[code] || {};
  for (const sec of out.sections) {
    Object.assign(sec, secs[sec.id] || {});
    for (const it of sec.items) if (!it.separator && items[it.id]) Object.assign(it, items[it.id]);
    if (sec.feature && items[sec.feature.id]) Object.assign(sec.feature, items[sec.feature.id]);
  }
  const feats = I18N.featured[code] || {};
  out.featured = out.featured.map((f) => ({ ...f, ...(feats[f.id] || {}) }));
  return out;
}

/** Dil listesi: her dil için site ve menü yolları (dil değiştirici ve hreflang için). */
export function alternates(kind) {
  return LANGS.map((l) => ({ code: l.code, label: l.label, path: kind === 'menu' ? l.menuPath : l.sitePath, default: !!l.default }));
}
