import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config, rateLimits } from '../config.js';
import type { Db } from '../db.js';
import { haversineKm } from '../lib/geo.js';
import { COUNTRIES, COUNTRY_CODES } from '../lib/regions.js';
import { ipKey, rateLimit } from '../lib/rateLimit.js';
import { routeVia, type LatLng } from '../lib/routing.js';

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).default(35.1856),
  lng: z.coerce.number().min(-180).max(180).default(33.3823),
  radiusKm: z.coerce.number().min(1).max(100).default(25),
});

/**
 * Son 'yakındaki taksiler' sorgusunun konumu — talep ipucu.
 * Sahte taksi simülatörü (npm run bots) bunu okuyup botları yolcunun çevresine taşır.
 */
let lastDemand: { lat: number; lng: number; at: string } | null = null;
export function getDemandHint() {
  return lastDemand;
}

/** Konumu ~100 m hassasiyete indirger: sürücünün tam yerini ifşa etmeden yoğunluğu gösterir. */
function blur(coord: number): number {
  return Math.round(coord * 1000) / 1000;
}

/**
 * Üyelik gerektirmeyen uçlar. Uygulamaya girmeden "yakınımda taksi var mı?"
 * sorusuna cevap verir; kimlik bilgisi (isim, plaka, telefon) dönmez.
 */
/** Sürücü kimliğini dışarı sızdırmadan, süreç boyunca sabit kalan kısa anonim kimlik. */
function anonId(userId: number): string {
  return createHash('sha256').update(`${config.jwtSecret}:nearby:${userId}`).digest('hex').slice(0, 10);
}

export function publicRoutes(db: Db): Router {
  const router = Router();

  // Girişsiz uç: toplu kazıma / sürücü takibine karşı IP başına hız sınırı
  const nearbyByIp = rateLimit({ ...rateLimits.nearbyPerIp, keyFn: ipKey });

  router.get('/nearby-drivers', nearbyByIp, (req, res) => {
    const parsed = nearbySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Geçersiz konum' });
      return;
    }
    const { lat, lng, radiusKm } = parsed.data;
    if (typeof req.query.lat === 'string' && typeof req.query.lng === 'string') {
      lastDemand = { lat, lng, at: new Date().toISOString() };
    }
    const freshAfter = new Date(Date.now() - config.driverLocationTtlMs).toISOString();
    const rows = db
      .prepare(
        `SELECT user_id, lat, lng, heading, vehicle_model FROM drivers
         WHERE status = 'approved' AND is_online = 1 AND lat IS NOT NULL AND location_at >= ?`,
      )
      .all(freshAfter) as unknown as Array<{ user_id: number; lat: number; lng: number; heading: number | null; vehicle_model: string }>;

    const drivers = rows
      .map((r) => ({
        // Kalıcı ama anonim kimlik: uygulama aynı taksiyi yenilemeler arasında eşleyip kaydırarak taşır
        id: anonId(r.user_id),
        lat: blur(r.lat),
        lng: blur(r.lng),
        vehicleModel: r.vehicle_model,
        heading: r.heading ?? null,
        distanceKm: Math.round(haversineKm(lat, lng, r.lat, r.lng) * 10) / 10,
      }))
      .filter((d) => d.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 50);

    res.json({ count: drivers.length, drivers });
  });

  /**
   * Yol rotası: ?points=lat,lng|lat,lng|... (2–7 nokta). OSRM'den gerçek yol geometrisi,
   * mesafe ve süre; servis yoksa düz çizgi (source: 'straight'). Uygulama rota çizgisini
   * ve sürücü→yolcu yolunu bununla çizer.
   */
  const routeByIp = rateLimit({ ...rateLimits.routePerIp, keyFn: ipKey });
  router.get('/route', routeByIp, async (req, res, next) => {
    try {
      const raw = typeof req.query.points === 'string' ? req.query.points : '';
      const points: LatLng[] = [];
      for (const part of raw.split('|')) {
        const [lat, lng] = part.split(',').map(Number);
        if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
        points.push({ lat, lng });
      }
      if (points.length < 2 || points.length > 7) {
        res.status(400).json({ error: 'points: 2–7 nokta, biçim lat,lng|lat,lng' });
        return;
      }
      res.json(await routeVia(points));
    } catch (e) {
      next(e);
    }
  });

  /** Hizmet verilen ülkeler ve şehir listeleri — mobil uygulamanın tek kaynağı. */
  router.get('/regions', (_req, res) => {
    res.json({
      countries: COUNTRY_CODES.map((code) => ({
        code,
        name: COUNTRIES[code].name,
        cities: COUNTRIES[code].cities,
      })),
    });
  });

  return router;
}
