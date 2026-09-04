import { Router } from 'express';
import { z } from 'zod';
import { setSetting, type Db } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { defaultSettings } from '../config.js';
import type { Hub } from '../realtime.js';
import { getDemandHint } from './public.js';

const settingsSchema = z.object({
  base_fare: z.coerce.number().positive().optional(),
  per_km: z.coerce.number().positive().optional(),
  min_fare: z.coerce.number().positive().optional(),
  commission_rate: z.coerce.number().min(0).max(0.5).optional(),
});

const settlementSchema = z.object({
  amount: z.number().positive(),
  note: z.string().max(200).optional(),
});

export function adminRoutes(db: Db, hub: Hub): Router {
  const router = Router();
  router.use(requireAuth('admin'));

  /** Sürücü listesi; ?status=pending ile onay bekleyenler filtrelenir. */
  router.get('/drivers', (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.phone, u.created_at, d.license_no, d.vehicle_plate, d.vehicle_model, d.city, d.status, d.is_online, d.rating_sum, d.rating_count, d.cancellations, d.lat, d.lng, d.location_at,
           (SELECT COALESCE(SUM(CASE WHEN l.type = 'commission' THEN l.amount ELSE -l.amount END), 0) FROM ledger l WHERE l.driver_id = u.id) AS commission_due
         FROM users u JOIN drivers d ON d.user_id = u.id
         WHERE (? IS NULL OR d.status = ?)
         ORDER BY u.created_at DESC`,
      )
      .all(status, status) as unknown as Array<Record<string, unknown>>;
    res.json({
      drivers: rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        licenseNo: r.license_no,
        vehiclePlate: r.vehicle_plate,
        vehicleModel: r.vehicle_model,
        city: r.city,
        status: r.status,
        isOnline: r.is_online === 1,
        lat: r.lat,
        lng: r.lng,
        locationAt: r.location_at,
        rating:
          (r.rating_count as number) > 0
            ? Math.round(((r.rating_sum as number) / (r.rating_count as number)) * 10) / 10
            : null,
        commissionDue: r.commission_due,
        cancellations: r.cancellations,
        createdAt: r.created_at,
      })),
    });
  });

  /** Son yolculuklar — panelin yolculuk tablosu için. */
  router.get('/rides', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = db
      .prepare(
        `SELECT r.id, r.status, r.pickup_address, r.drop_address, r.est_distance_km, r.est_fare, r.final_fare, r.commission, r.cancel_reason, r.requested_at, r.completed_at,
           pu.name AS passenger_name, du.name AS driver_name, d.vehicle_plate
         FROM rides r
         JOIN users pu ON pu.id = r.passenger_id
         LEFT JOIN users du ON du.id = r.driver_id
         LEFT JOIN drivers d ON d.user_id = r.driver_id
         ORDER BY r.id DESC LIMIT ?`,
      )
      .all(limit) as unknown as Array<Record<string, unknown>>;
    res.json({
      rides: rows.map((r) => ({
        id: r.id,
        status: r.status,
        pickupAddress: r.pickup_address,
        dropAddress: r.drop_address,
        estDistanceKm: r.est_distance_km,
        estFare: r.est_fare,
        finalFare: r.final_fare,
        commission: r.commission,
        cancelReason: r.cancel_reason,
        requestedAt: r.requested_at,
        completedAt: r.completed_at,
        passengerName: r.passenger_name,
        driverName: r.driver_name,
        vehiclePlate: r.vehicle_plate,
      })),
    });
  });

  function setDriverStatus(driverId: number, status: 'approved' | 'rejected' | 'suspended'): boolean {
    const changed = db.prepare('UPDATE drivers SET status = ? WHERE user_id = ?').run(status, driverId).changes;
    if (changed === 1) {
      hub.emitToUser(driverId, 'driver:status', { status });
    }
    return changed === 1;
  }

  router.post('/drivers/:id/approve', (req, res) => {
    if (!setDriverStatus(Number(req.params.id), 'approved')) {
      res.status(404).json({ error: 'Sürücü bulunamadı' });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/drivers/:id/reject', (req, res) => {
    if (!setDriverStatus(Number(req.params.id), 'rejected')) {
      res.status(404).json({ error: 'Sürücü bulunamadı' });
      return;
    }
    res.json({ ok: true });
  });

  router.post('/drivers/:id/suspend', (req, res) => {
    if (!setDriverStatus(Number(req.params.id), 'suspended')) {
      res.status(404).json({ error: 'Sürücü bulunamadı' });
      return;
    }
    res.json({ ok: true });
  });

  /** Sürücünün komisyon ödemesini deftere işle (borcu düşer). */
  router.post('/drivers/:id/settle', (req, res) => {
    const parsed = settlementSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Geçersiz tutar' });
      return;
    }
    const driverId = Number(req.params.id);
    const exists = db.prepare('SELECT user_id FROM drivers WHERE user_id = ?').get(driverId);
    if (!exists) {
      res.status(404).json({ error: 'Sürücü bulunamadı' });
      return;
    }
    db.prepare("INSERT INTO ledger (driver_id, type, amount, note) VALUES (?, 'settlement', ?, ?)").run(
      driverId,
      parsed.data.amount,
      parsed.data.note ?? 'Komisyon ödemesi alındı',
    );
    res.json({ ok: true });
  });

  /** Son yolcu konum sorgusu (sahte taksi simülatörü botları buraya taşır). */
  router.get('/demand-hint', (_req, res) => {
    res.json({ hint: getDemandHint() });
  });

  /** Platform istatistikleri. */
  router.get('/stats', (_req, res) => {
    const stats = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE role = 'passenger') AS passengers,
           (SELECT COUNT(*) FROM drivers WHERE status = 'approved') AS approved_drivers,
           (SELECT COUNT(*) FROM drivers WHERE status = 'pending') AS pending_drivers,
           (SELECT COUNT(*) FROM drivers WHERE is_online = 1) AS online_drivers,
           (SELECT COUNT(*) FROM rides WHERE status = 'completed') AS completed_rides,
           (SELECT COALESCE(SUM(final_fare), 0) FROM rides WHERE status = 'completed') AS gross_volume,
           (SELECT COALESCE(SUM(commission), 0) FROM rides WHERE status = 'completed') AS total_commission`,
      )
      .get() as unknown as Record<string, number>;
    res.json({
      passengers: stats.passengers,
      approvedDrivers: stats.approved_drivers,
      pendingDrivers: stats.pending_drivers,
      onlineDrivers: stats.online_drivers,
      completedRides: stats.completed_rides,
      grossVolume: stats.gross_volume,
      totalCommission: stats.total_commission,
    });
  });

  /** Ücret / komisyon ayarları. */
  router.get('/settings', (_req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as unknown as Array<{
      key: string;
      value: string;
    }>;
    const settings: Record<string, number> = {};
    for (const key of Object.keys(defaultSettings)) {
      const row = rows.find((r) => r.key === key);
      settings[key] = Number(row?.value ?? defaultSettings[key as keyof typeof defaultSettings]);
    }
    res.json({ settings });
  });

  router.put('/settings', (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Geçersiz ayar değeri' });
      return;
    }
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) setSetting(db, key, String(value));
    }
    res.json({ ok: true });
  });

  return router;
}
