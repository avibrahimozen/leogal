// Logo ve statik varlıklar. SVG'ler sayfalara satır içi gömülür; dosya kopyaları assets/ altına yazılır.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

/** Çıktıya (assets/) kopyalanan dosyalar; sayfalar ve schema.org bunlara mutlak adresle bağlanır. */
export const STATIC_ASSETS = ['logo-light.svg', 'logo-dark.svg', 'og.png'];

const cache = new Map();
function read(name) {
  if (!cache.has(name)) cache.set(name, readFileSync(join(ASSETS_DIR, name), 'utf8').trim());
  return cache.get(name);
}

/**
 * Satır içi logo.
 *   variant: 'dark' (koyu zemin: krem + sarı) | 'light' (açık zemin: siyah + sarı)
 *   mark:    true ise yalnızca üst kısım (saat yayı + döner)
 */
export function logo(variant = 'dark', { mark = false, className = '', label = '7/23 Gece Döner' } = {}) {
  const file = mark ? `logo-mark-${variant}.svg` : `logo-${variant}.svg`;
  return read(file)
    .replace(/class="[^"]*"/, `class="${mark ? 'logo-mark' : 'logo'}${className ? ' ' + className : ''}"`)
    .replace(/aria-label="[^"]*"/, `aria-label="${label}"`);
}
