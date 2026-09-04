import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { getSetting, nowIso, type Db } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { commissionOf, estimateFare } from '../lib/geo.js';
import { regionForPoint, type CountryCode } from '../lib/regions.js';
import type { Matcher, RideRow } from '../matching.js';
import type { Hub } from '../realtime.js';

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

/** Tarife ülkeye göre seçilir: ülkeye özel ayar yoksa genel ayar geçerlidir. */
function fareParams(db: Db, country: CountryCode) {
  return {
    baseFare: getSetting(db, 'base_fare', country),
    perKm: getSetting(db, 'per_km', country),
    minFare: getSetting(db, 'min_fare', country),
    roadFactor: config.roadFactor,
  };
}

/** rides.country sütunu: ülke sütunu eklenmeden önceki kayıtlarda NULL. */
export type RideRowWithCountry = RideRow & { country: CountryCode | null };

export function getRide(db: Db, id: number): RideRowWithCountry | undefined {
  return db.prepare('SELECT * FROM rides WHERE id = ?').get(id) as unknown as RideRowWithCountry | undefined;
}

export function rideToJson(db: Db, ride: RideRow & { country?: CountryCode | null }) {
  let driver: Record<string, unknown> | null = null;
  if (ride.driver_id) {
    const row = db
      .prepare(
        `SELECT u.name, d.vehicle_plate, d.vehicle_model, d.rating_sum, d.rating_count, d.lat, d.lng, u.phone
         FROM users u JOIN drivers d ON d.user_id = u.id WHERE u.id = ?`,
      )
      .get(ride.driver_id) as unknown as {
      name: string;
      phone: string;
      vehicle_plate: string;
      vehicle_model: string;
      rating_sum: number;
      rating_count: number;
      lat: number | null;
      lng: number | null;
    };
    driver = {
      id: ride.driver_id,
      name: row.name,
      phone: row.phone,
      vehiclePlate: row.vehicle_plate,
      vehicleModel: row.vehicle_model,
      rating: row.rating_count > 0 ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : null,
      lat: row.lat,
      lng: row.lng,
    };
  }
  const passenger = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(ride.passenger_id) as unknown as {
    name: string;
    phone: string;
  };
  return {
    id: ride.id,
    status: ride.status,
    pickup: { lat: ride.pickup_lat, lng: ride.pickup_lng, address: ride.pickup_address },
    drop: { lat: ride.drop_lat, lng: ride.drop_lng, address: ride.drop_address },
    estDistanceKm: ride.est_distance_km,
    estFare: ride.est_fare,
    country: ride.country ?? null,
    finalFare: ride.final_fare,
    cancelReason: ride.cancel_reason,
    passengerRating: ride.passenger_rating,
    driverRating: ride.driver_rating,
    requestedAt: ride.requested_at,
    acceptedAt: ride.accepted_at,
    arrivedAt: ride.arrived_at,
    startedAt: ride.started_at,
    completedAt: ride.completed_at,
    cancelledAt: ride.cancelled_at,
    driver,
    passenger: { id: ride.passenger_id, name: passenger.name, phone: passenger.phone },
  };
}

export function rideRoutes(db: Db, hub: Hub, matcher: Matcher): Router {
  const router = Router();

  function notifyRide(ride: RideRow, extra: Record<string, unknown> = {}): void {
    const payload = { rideId: ride.id, status: ride.status, ride: rideToJson(db, ride), ...extra };
    hub.emitToUser(ride.passenger_id, 'ride:update', payload);
    if (ride.driver_id) hub.emitToUser(ride.driver_id, 'ride:update', payload);
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

  /** Geçmiş çağrılar. */
  router.get('/history', requireAuth('passenger', 'driver'), (req, res) => {
    const column = req.user!.role === 'driver' ? 'driver_id' : 'passenger_id';
    const rides = db
      .prepare(`SELECT * FROM rides WHERE ${column} = ? ORDER BY id DESC LIMIT 50`)
      .all(req.user!.id) as unknown as RideRow[];
    res.json({ rides: rides.map((r) => rideToJson(db, r)) });
  });

  /** Sürücü teklifi kabul eder — ilk kabul eden kazanır. */
  router.post('/:id/accept', requireAuth('driver'), (req, res) => {
    const rideId = Number(req.params.id);
    const driverId = req.user!.id;
    const driver = db
      .prepare("SELECT status, is_online FROM drivers WHERE user_id = ?")
      .get(driverId) as { status: string; is_online: number } | undefined;
    if (!driver || driver.status !== 'approved') {
      res.status(403).json({ error: 'Sürücü hesabınız onaylı değil' });
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
    idParam: string | undefined,
    driverId: number,
    from: string,
    to: string,
    timestampColumn: string,
    res: Parameters<Parameters<Router['post']>[1]>[1],
  ): void {
    const rideId = Number(idParam);
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
    const rideId = Number(req.params.id);
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
    db.prepare(
      "UPDATE rides SET status = 'completed', completed_at = ?, final_fare = ?, commission = ? WHERE id = ?",
    ).run(nowIso(), finalFare, commission, rideId);
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

  /** İptal — yolcu her aşamada (yolculuk başlamadan), sürücü kabul sonrası vazgeçebilir. */
  router.post('/:id/cancel', requireAuth('passenger', 'driver'), (req, res) => {
    const rideId = Number(req.params.id);
    const ride = getRide(db, rideId);
    if (!ride) {
      res.status(404).json({ error: 'Çağrı bulunamadı' });
      return;
    }
    const isPassenger = req.user!.role === 'passenger' && ride.passenger_id === req.user!.id;
    const isDriver = req.user!.role === 'driver' && ride.driver_id === req.user!.id;
    if (!isPassenger && !isDriver) {
      res.status(403).json({ error: 'Bu çağrı size ait değil' });
      return;
    }
    const cancellable = isPassenger
      ? ['requested', 'accepted', 'arrived']
      : ['accepted', 'arrived'];
    if (!cancellable.includes(ride.status)) {
      res.status(409).json({ error: 'Bu aşamada iptal edilemez' });
      return;
    }
    const reason = isPassenger ? 'passenger_cancelled' : 'driver_cancelled';
    db.prepare("UPDATE rides SET status = 'cancelled', cancel_reason = ?, cancelled_at = ? WHERE id = ?").run(
      reason,
      nowIso(),
      rideId,
    );
    matcher.settle(rideId);
    const updated = getRide(db, rideId)!;
    notifyRide(updated, { cancelReason: reason });
    // Sürücü iptal ederse çağrı yeniden yayınlanır ki yolcu beklemede kalmasın.
    if (isDriver) {
      const reopened = db
        .prepare(
          "UPDATE rides SET status = 'requested', driver_id = NULL, accepted_at = NULL, arrived_at = NULL, cancel_reason = NULL, cancelled_at = NULL WHERE id = ?",
        )
        .run(rideId).changes;
      if (reopened === 1) {
        const fresh = getRide(db, rideId)!;
        if (!matcher.broadcast(fresh)) {
          db.prepare(
            "UPDATE rides SET status = 'cancelled', cancel_reason = 'no_driver', cancelled_at = ? WHERE id = ?",
          ).run(nowIso(), rideId);
          notifyRide(getRide(db, rideId)!);
        } else {
          hub.emitToUser(fresh.passenger_id, 'ride:update', {
            rideId,
            status: 'requested',
            ride: rideToJson(db, fresh),
            reassigned: true,
          });
        }
      }
    }
    res.json({ ride: rideToJson(db, getRide(db, rideId)!) });
  });

  /** Karşılıklı puanlama (1-5). Yolcu sürücüyü, sürücü yolcuyu puanlar. */
  router.post('/:id/rate', requireAuth('passenger', 'driver'), (req, res) => {
    const parsed = rateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Puan 1-5 arası olmalı' });
      return;
    }
    const rideId = Number(req.params.id);
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
