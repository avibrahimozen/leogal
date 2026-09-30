import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface RateLimitOptions {
  /** Pencere uzunluğu (ms) */
  windowMs: number;
  /** Pencere içinde izin verilen en fazla istek sayısı */
  max: number;
  /** İsteği bir sayaca bağlayan anahtar (IP, telefon...). null/undefined dönerse istek sayılmaz. */
  keyFn: (req: Request) => string | null | undefined;
  /** Zaman kaynağı — testlerde sahte saat vermek için */
  now?: () => number;
}

export const RATE_LIMIT_MESSAGE = 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin';

/** Tüm sınırlayıcıların sayaçları; testlerin resetRateLimits() ile sıfırlayabilmesi için kayıt altındadır. */
const stores = new Set<Map<string, number[]>>();

/** Bütün sınırlayıcıların sayaçlarını sıfırlar (test yardımcısı). */
export function resetRateLimits(): void {
  for (const store of stores) store.clear();
}

/** İstemci IP'siyle anahtarlama. TRUST_PROXY=1 ise X-Forwarded-For'daki gerçek IP kullanılır. */
export function ipKey(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Bağımlılıksız, bellek içi kayan pencere (sliding window log) hız sınırlayıcı.
 *
 * Her anahtar için pencere içindeki istek zamanları tutulur; pencerede `max`
 * istek varsa 429 + Retry-After döner. Sayaç yalnızca izin verilen istekler
 * için artar (reddedilen istek cezayı uzatmaz). Tek süreçli MVP için yeterlidir;
 * birden fazla sunucu örneğinde paylaşımlı bir depo (örn. Redis) gerekir.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const store = new Map<string, number[]>();
  stores.add(store);
  const now = options.now ?? Date.now;
  let lastSweep = now();

  /** Penceresi tamamen boşalmış anahtarları periyodik olarak siler (bellek büyümesini önler). */
  function sweep(at: number): void {
    if (at - lastSweep < options.windowMs) return;
    lastSweep = at;
    for (const [key, hits] of store) {
      const last = hits[hits.length - 1];
      if (last === undefined || at - last >= options.windowMs) store.delete(key);
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.keyFn(req);
    if (key === null || key === undefined) {
      next();
      return;
    }
    const at = now();
    sweep(at);

    let hits = store.get(key);
    if (!hits) {
      hits = [];
      store.set(key, hits);
    }
    // Pencerenin dışında kalan eski istekleri düşür
    const cutoff = at - options.windowMs;
    while (hits.length > 0 && (hits[0] ?? Infinity) <= cutoff) hits.shift();

    if (hits.length >= options.max) {
      const oldest = hits[0] ?? at;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - at) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: RATE_LIMIT_MESSAGE });
      return;
    }
    hits.push(at);
    next();
  };
}
