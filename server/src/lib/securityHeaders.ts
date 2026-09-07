import type { RequestHandler } from 'express';

/**
 * Yönetim paneli (/admin) için içerik güvenlik politikası.
 *
 * Panel tek dosyadır ve satır içi <script>/<style> kullanır; bu yüzden
 * 'unsafe-inline' şimdilik gereklidir. Takip işi: script/style'ı ayrı
 * dosyalara taşıyıp 'unsafe-inline'ı kaldırmak (veya nonce kullanmak).
 * Leaflet (unpkg) ve OpenStreetMap karo sunucusuna izin verilir.
 */
export const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com",
  "img-src 'self' data: https://unpkg.com https://tile.openstreetmap.org",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** API (JSON) yanıtları için: tarayıcı bu yanıtları belge olarak açsa bile hiçbir şey yüklenemez. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/**
 * Web uygulaması (kökte sunulan Expo web paketi) için içerik güvenlik politikası.
 *  - script: yalnızca kendi paketimiz (index.html satır içi betik içermez)
 *  - style: react-native-web stilleri çalışma anında <style> ile ekler → 'unsafe-inline' gerekli
 *  - img: araç görseli/ikonlar (self, data), OpenStreetMap karoları
 *  - connect: API + Socket.IO (aynı köken; ws/wss bazı tarayıcılarda 'self' ile eşleşmediğinden
 *    açıkça izinli — betik zaten yalnızca kendi paketimiz olduğundan sızıntı riski yok) ve
 *    Nominatim adres arama
 *  - font: @expo/vector-icons yazı tipleri paketle birlikte gelir
 */
export const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "connect-src 'self' ws: wss: https://nominatim.openstreetmap.org",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Yol → (CSP, Permissions-Policy). Yalnızca web uygulaması konum erişimi isteyebilir. */
export function policiesFor(reqPath: string): { csp: string; permissions: string } {
  const closed = 'camera=(), microphone=(), geolocation=(), payment=(), usb=()';
  if (reqPath.startsWith('/api')) return { csp: API_CSP, permissions: closed };
  if (reqPath.startsWith('/admin')) return { csp: ADMIN_CSP, permissions: closed };
  return { csp: WEB_CSP, permissions: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()' };
}

/**
 * Temel güvenlik başlıkları (helmet bağımlılığı olmadan).
 *  - nosniff: JSON/HTML'in başka türde yorumlanmasını engeller
 *  - X-Frame-Options / frame-ancestors: clickjacking
 *  - Referrer-Policy: URL'lerin üçüncü taraflara sızmaması
 *  - Permissions-Policy: gereksiz tarayıcı yetenekleri kapalı; konum yalnızca web uygulamasına açık
 *  - Cache-Control: no-store — token içeren API yanıtları önbelleklenmez
 *  - HSTS: yalnızca güvenli (HTTPS) bağlantılarda; TRUST_PROXY=1 ile X-Forwarded-Proto dikkate alınır
 */
export function securityHeaders(): RequestHandler {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const policy = policiesFor(req.path);
    res.setHeader('Permissions-Policy', policy.permissions);
    res.setHeader('Content-Security-Policy', policy.csp);
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}
