import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getSetting, nowIso, type Db } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { commissionOf, estimateFare } from '../lib/geo.js';
import { regionForPoint, type CountryCode } from '../lib/regions.js';
import { getRide, rideToJson, type RideRow } from '../lib/rides.js';
import type { Matcher } from '../matching.js';
import type { Hub } from '../realtime.js';

// Geriye dönük uyumluluk: çağrı yardımcıları lib/rides.ts'e taşındı
export { getRide, rideToJson } from '../lib/rides.js';

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1).max(200),
});

const requestSchema = z.object({
  pickup: pointSchema,
  drop: pointSchema,
});

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
});

/** Geçmiş listesi sayfa boyutu: varsayılan ve üst sınır. */
const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_MAX_LIMIT = 100;

/** Tarife ülkeye göre seçilir: ülkeye özel ayar yoksa genel ayar geçerlidir. */
function fareParams(db: Db, country: CountryCode) {
  return {
    baseFare: getSetting(db, 'base_fare', country),
    perKm: getSetting(db, 'per_km', country),
    minFare: getSetting(db, 'min_fare', country),
    roadFactor: config.roadFactor,
  };
}

/** URL'deki çağrı kimliğini pozitif tam sayıya çevirir; geçersizse null döner. */
function parseRideId(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9][0-9]{0,15}$/.test(raw)) return null;
  return Number(raw);
}

/** Sayfa boyutu: sayısal değilse varsayılan, her durumda [1, max] aralığına çekilir. */
function parseLimit(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : fallback;
  return Math.min(Math.max(n, 1), max);
}

export function rideRoutes(db: Db, hub: Hub, matcher: Matcher): Router {
  const router = Router();

  function notifyRide(ride: RideRow, extra: Record<string, unknown> = {}): void {
    const payload = { rideId: ride.id, status: ride.status, ride: rideToJson(db, ride), ...extra };
    hub.emitToUser(ride.passenger_id, 'ride:update', payload);
    if (ride.driver_id) hub.emitToUser(ride.driver_id, 'ride:update', payload);
  }

  function notFound(res: Response): void {
    res.status(404).json({ error: 'Çağrı bulunamadı' });
  }

  /** Ücret tahmini — giriş gerektirmez ki kayıt öncesi de fiyat görülebilsin. */
  router.post('/estimate', (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Geçersiz konum bilgisi' });
      return;
    }
    const { pickup, drop } = parsed.data;
    // Tarife, alış noktasının ülkesine göre belirlenir
    const country = regionForPoint(pickup.lat, pickup.lng);
    const est = estimateFare(pickup.lat, pickup.lng, drop.lat, drop.lng, fareParams(db, country));
    res.json({ distanceKm: est.distanceKm, fare: est.fare, currency: 'TL', country });
  });

  /** Yolcu yeni çağrı oluşturur; uygun sürücülere teklif yayınlanır. */
  router.post('/', requireAuth('passenger'), (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Geçersiz konum bilgisi' });
      return;
    }
    const passengerId = req.user!.id;
    const active = db
      .prepare(
        "SELECT id FROM rides WHERE passenger_id = ? AND status IN ('requested','accepted','arrived','in_progress')",
      )
      .get(passengerId);
    if (active) {
      res.status(409).json({ error: 'Zaten aktif bir çağrınız var' });
      return;
    }
    const { pickup, drop } = parsed.data;
    const country = regionForPoint(pickup.lat, pickup.lng);
    const est = estimateFare(pickup.lat, pickup.lng, drop.lat, drop.lng, fareParams(db, country));
    const result = db
      .prepare(
        `INSERT INTO rides (passenger_id, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, est_distance_km, est_fare, country)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        passengerId,
        pickup.lat,
        pickup.lng,
        pickup.address,
        drop.lat,
        drop.lng,
        drop.address,
        est.distanceKm,
        est.fare,
        country,
      );
    const ride = getRide(db, Number(result.lastInsertRowid))!;
    const hasCandidates = matcher.broadcast(ride);
    if (!hasCandidates) {
      db.prepare(
        "UPDATE rides SET status = 'cancelled', cancel_reason = 'no_driver', cancelled_at = ? WHERE id = ?",
      ).run(nowIso(), ride.id);
      res.status(200).json({ ride: rideToJson(db, getRide(db, ride.id)!), noDriver: true });
      return;
    }
    res.status(201).json({ ride: rideToJson(db, ride) });
  });

  /** Yolcunun veya sürücünün aktif çağrısı. */
  router.get('/active', requireAuth('passenger', 'driver'), (req, res) => {
    const column = req.user!.role === 'driver' ? 'driver_id' : 'passenger_id';
    const ride = db
      .prepare(
        `SELECT * FROM rides WHERE ${column} = ? AND status IN ('requested','accepted','arrived','in_progress') ORDER BY id DESC LIMIT 1`,
      )
      .get(req.user!.id) as unknown as RideRow | undefined;
    res.json({ ride: ride ? rideToJson(db, ride) : null });
  });

  /**
   * Geçmiş çağrılar — id'ye göre azalan, anahtar tabanlı sayfalama.
   * ?limit=20 (varsayılan 50, en çok 100) ve ?before=<rideId> ile sonraki sayfa.
   * `nextBefore`: dönen en küçük id; sayfa dolmadıysa null (son sayfa).
   */
  router.get('/history', requireAuth('passenger', 'driver'), (req, res) => {
    const column = req.user!.role === 'driver' ? 'driver_id' : 'passenger_id';
    const limit = parseLimit(req.query.limit, HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT);
    let before: number | null = null;
    if (req.query.before !== undefined) {
      before = parseRideId(req.query.before);
      if (before === null) {
        res.status(400).json({ error: 'Geçersiz sayfalama parametresi' });
        return;
      }
    }
    const rides = db
      .prepare(`SELECT * FROM rides WHERE ${column} = ? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`)
      .all(req.user!.id, before, before, limit) as unknown as RideRow[];
    const last = rides[rides.length - 1];
    const nextBefore = rides.length === limit && last ? last.id : null;
    res.json({ rides: rides.map((r) => rideToJson(db, r)), nextBefore });
  });

  /** Sürücü teklifi kabul eder — ilk kabul eden kazanır. */
  router.post('/:id/accept', requireAuth('driver'), (req, res) => {
    const rideId = parseRideId(req.params.id);
    if (rideId === null) {
      notFound(res);
      return;
    }
    const driverId = req.user!.id;
    const driver = db
      .prepare('SELECT status, is_online FROM drivers WHERE user_id = ?')
      .get(driverId) as { status: string; is_online: number } | undefined;
    if (!driver || driver.status !== 'approved') {
      res.status(403).json({ error: 'Sürücü hesabınız onaylı değil' });
      return;
    }
    // Teklifler yalnızca çevrimiçi sürücülere gider; çevrimdışıyken kabul tutarsız bir yolculuk yaratır.
    if (driver.is_online !== 1) {
      res.status(409).json({ error: 'Çağrı kabul etmek için çevrimiçi olmalısınız' });
      return;
    }
    const busy = db
      .prepare("SELECT id FROM rides WHERE driver_id = ? AND status IN ('accepted','arrived','in_progress')")
      .get(driverId);
    if (busy) {
      res.status(409).json({ error: 'Zaten aktif bir çağrınız var' });
      return;
    }
    const changed = db
      .prepare(
        "UPDATE rides SET driver_id = ?, status = 'accepted', accepted_at = ? WHERE id = ? AND status = 'requested'",
      )
      .run(driverId, nowIso(), rideId).changes;
    if (changed !== 1) {
      res.status(409).json({ error: 'Çağrı artık müsait değil' });
      return;
    }
    matcher.settle(rideId, driverId);
    const ride = getRide(db, rideId)!;
    notifyRide(ride);
    res.json({ ride: rideToJson(db, ride) });
  });

  /** Sürücü alış noktasına vardı. */
  router.post('/:id/arrived', requireAuth('driver'), (req, res) => {
    transition(req.params.id, req.user!.id, 'accepted', 'arrived', 'arrived_at', res);
  });

  /** Yolculuk başladı. */
  router.post('/:id/start', requireAuth('driver'), (req, res) => {
    transition(req.params.id, req.user!.id, 'arrived', 'in_progress', 'started_at', res);
  });

  function transition(
    idParam: unknown,
    driverId: number,
    from: string,
    to: string,
    timestampColumn: string,
    res: Response,
  ): void {
    const rideId = parseRideId(idParam);
    if (rideId === null) {
      notFound(res);
      return;
    }
    const changed = db
      .prepare(`UPDATE rides SET status = ?, ${timestampColumn} = ? WHERE id = ? AND driver_id = ? AND status = ?`)
      .run(to, nowIso(), rideId, driverId, from).changes;
    if (changed !== 1) {
      res.status(409).json({ error: 'Bu işlem şu an yapılamaz' });
      return;
    }
    const ride = getRide(db, rideId)!;
    notifyRide(ride);
    res.json({ ride: rideToJson(db, ride) });
  }

  /** Yolculuk tamamlandı: nihai ücret kesinleşir, komisyon deftere işlenir. */
  router.post('/:id/complete', requireAuth('driver'), (req, res) => {
    const rideId = parseRideId(req.params.id);
    if (rideId === null) {
      notFound(res);
      return;
    }
    const driverId = req.user!.id;
    const ride = getRide(db, rideId);
    if (!ride || ride.driver_id !== driverId || ride.status !== 'in_progress') {
      res.status(409).json({ error: 'Bu işlem şu an yapılamaz' });
      return;
    }
    const finalFare = ride.est_fare;
    // Komisyon oranı da yolculuğun ülkesine göre; eski (ülkesiz) kayıtlarda alış noktasından türetilir
    const country = ride.country ?? regionForPoint(ride.pickup_lat, ride.pickup_lng);
    const rate = getSetting(db, 'commission_rate', country);
    const commission = commissionOf(finalFare, rate);
    // Koşullu güncelleme: aynı çağrı iki kez tamamlanıp komisyon iki kez işlenemez
    const changed = db
      .prepare(
        "UPDATE rides SET status = 'completed', completed_at = ?, final_fare = ?, commission = ? WHERE id = ? AND driver_id = ? AND status = 'in_progress'",
      )
      .run(nowIso(), finalFare, commission, rideId, driverId).changes;
    if (changed !== 1) {
      res.status(409).json({ error: 'Bu işlem şu an yapılamaz' });
      return;
    }
    db.prepare("INSERT INTO ledger (driver_id, ride_id, type, amount, note) VALUES (?, ?, 'commission', ?, ?)").run(
      driverId,
      rideId,
      commission,
      `Çağrı #${rideId} komisyonu (%${Math.round(rate * 100)})`,
    );
    const updated = getRide(db, rideId)!;
    notifyRide(updated);
    res.json({ ride: rideToJson(db, updated) });
  });

  /**
   * İptal — yolcu yolculuk başlamadan her aşamada, sürücü kabul sonrası vazgeçebilir.
   * Sürücü iptalinde çağrı (iptal eden hariç) yeniden yayınlanır: yolcuya tek bir
   * 'requested' olayı gider; aday yoksa 'sürücü bulunamadı' iptali bildirilir.
   */
  router.post('/:id/cancel', requireAuth('passenger', 'driver'), (req, res) => {
    const rideId = parseRideId(req.params.id);
    const ride = rideId === null ? undefined : getRide(db, rideId);
    if (rideId === null || !ride) {
      notFound(res);
      return;
    }
    const isPassenger = req.user!.role === 'passenger' && ride.passenger_id === req.user!.id;
    const isDriver = req.user!.role === 'driver' && ride.driver_id === req.user!.id;
    if (!isPassenger && !isDriver) {
      res.status(403).json({ error: 'Bu çağrı size ait değil' });
      return;
    }
    const cancellable = isPassenger ? ['requested', 'accepted', 'arrived'] : ['accepted', 'arrived'];
    if (!cancellable.includes(ride.status)) {
      res.status(409).json({ error: 'Bu aşamada iptal edilemez' });
      return;
    }

    if (isPassenger) {
      const changed = db
        .prepare(
          "UPDATE rides SET status = 'cancelled', cancel_reason = 'passenger_cancelled', cancelled_at = ? WHERE id = ? AND status IN ('requested','accepted','arrived')",
        )
        .run(nowIso(), rideId).changes;
      if (changed !== 1) {
        res.status(409).json({ error: 'Bu aşamada iptal edilemez' });
        return;
      }
      matcher.settle(rideId);
      const updated = getRide(db, rideId)!;
      notifyRide(updated, { cancelReason: 'passenger_cancelled' });
      res.json({ ride: rideToJson(db, updated) });
      return;
    }

    // Sürücü iptali: çağrı tek adımda 'requested'a döner (arada 'cancelled' yazılmaz).
    // Sürücüye kendi açısından iptal görünümü gider; yolcu yalnızca yeniden yayının sonucunu öğrenir.
    const driverId = req.user!.id;
    const reopened = db
      .prepare(
        "UPDATE rides SET status = 'requested', driver_id = NULL, accepted_at = NULL, arrived_at = NULL WHERE id = ? AND driver_id = ? AND status IN ('accepted','arrived')",
      )
      .run(rideId, driverId).changes;
    if (reopened !== 1) {
      res.status(409).json({ error: 'Bu aşamada iptal edilemez' });
      return;
    }
    db.prepare('UPDATE drivers SET cancellations = cancellations + 1 WHERE user_id = ?').run(driverId);
    const driverView = {
      ...rideToJson(db, ride),
      status: 'cancelled',
      cancelReason: 'driver_cancelled',
      cancelledAt: nowIso(),
    };
    hub.emitToUser(driverId, 'ride:update', {
      rideId,
      status: 'cancelled',
      ride: driverView,
      cancelReason: 'driver_cancelled',
    });

    const fresh = getRide(db, rideId)!;
    if (matcher.broadcast(fresh, { exclude: [driverId] })) {
      hub.emitToUser(fresh.passenger_id, 'ride:update', {
        rideId,
        status: 'requested',
        ride: rideToJson(db, fresh),
        reassigned: true,
        previousDriverCancelled: true,
      });
    } else {
      db.prepare(
        "UPDATE rides SET status = 'cancelled', cancel_reason = 'no_driver', cancelled_at = ? WHERE id = ?",
      ).run(nowIso(), rideId);
      notifyRide(getRide(db, rideId)!, { cancelReason: 'no_driver' });
    }
    res.json({ ride: driverView });
  });

  /** Karşılıklı puanlama (1-5). Yolcu sürücüyü, sürücü yolcuyu puanlar. */
  router.post('/:id/rate', requireAuth('passenger', 'driver'), (req, res) => {
    const parsed = rateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Puan 1-5 arası olmalı' });
      return;
    }
    const rideId = parseRideId(req.params.id);
    if (rideId === null) {
      notFound(res);
      return;
    }
    const ride = getRide(db, rideId);
    if (!ride || ride.status !== 'completed') {
      res.status(409).json({ error: 'Sadece tamamlanan yolculuklar puanlanabilir' });
      return;
    }
    const rating = parsed.data.rating;
    if (req.user!.role === 'passenger') {
      if (ride.passenger_id !== req.user!.id) {
        res.status(403).json({ error: 'Bu çağrı size ait değil' });
        return;
      }
      if (ride.passenger_rating !== null) {
        res.status(409).json({ error: 'Bu yolculuğu zaten puanladınız' });
        return;
      }
      db.prepare('UPDATE rides SET passenger_rating = ? WHERE id = ?').run(rating, rideId);
      db.prepare('UPDATE drivers SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE user_id = ?').run(
        rating,
        ride.driver_id,
      );
    } else {
      if (ride.driver_id !== req.user!.id) {
        res.status(403).json({ error: 'Bu çağrı size ait değil' });
        return;
      }
      if (ride.driver_rating !== null) {
        res.status(409).json({ error: 'Bu yolculuğu zaten puanladınız' });
        return;
      }
      db.prepare('UPDATE rides SET driver_rating = ? WHERE id = ?').run(rating, rideId);
    }
    res.json({ ride: rideToJson(db, getRide(db, rideId)!) });
  });

  return router;
}
