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
 * Temel güvenlik başlıkları (helmet bağımlılığı olmadan).
 *  - nosniff: JSON/HTML'in başka türde yorumlanmasını engeller
 *  - X-Frame-Options / frame-ancestors: clickjacking
 *  - Referrer-Policy: URL'lerin üçüncü taraflara sızmaması
 *  - Permissions-Policy: panelin ihtiyaç duymadığı tarayıcı yetenekleri kapalı
 *  - Cache-Control: no-store — token içeren API yanıtları önbelleklenmez
 *  - HSTS: yalnızca güvenli (HTTPS) bağlantılarda; TRUST_PROXY=1 ile X-Forwarded-Proto dikkate alınır
 */
export function securityHeaders(): RequestHandler {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Content-Security-Policy', req.path.startsWith('/admin') ? ADMIN_CSP : API_CSP);
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}
