import { Router } from 'express';
import { z } from 'zod';
import { nowIso, type Db } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import type { Hub } from '../realtime.js';

const statusSchema = z.object({ online: z.boolean() });
const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
});

export function driverRoutes(db: Db, hub: Hub): Router {
  const router = Router();

  /** Çevrimiçi / çevrimdışı geçişi. Sadece onaylı sürücüler çevrimiçi olabilir. */
  router.post('/status', requireAuth('driver'), (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Geçersiz istek' });
      return;
    }
    const driver = db.prepare('SELECT status FROM drivers WHERE user_id = ?').get(req.user!.id) as
      | { status: string }
      | undefined;
    if (!driver) {
      res.status(404).json({ error: 'Sürücü kaydı bulunamadı' });
      return;
    }
    if (parsed.data.online && driver.status !== 'approved') {
      res.status(403).json({
        error:
          driver.status === 'pending'
            ? 'Hesabınız henüz onay bekliyor. Onaylandığında bildirim alacaksınız.'
            : 'Sürücü hesabınız aktif değil',
      });
      return;
    }
    db.prepare('UPDATE drivers SET is_online = ? WHERE user_id = ?').run(parsed.data.online ? 1 : 0, req.user!.id);
    res.json({ online: parsed.data.online });
  });

  /** REST üzerinden konum güncelleme (socket bağlantısı yoksa yedek yol). */
  router.post('/location', requireAuth('driver'), (req, res) => {
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Geçersiz konum' });
      return;
    }
    hub.updateDriverLocation(req.user!.id, parsed.data.lat, parsed.data.lng, parsed.data.heading ?? null);
    res.json({ ok: true });
  });

  /** Kazanç özeti: brüt hasılat, komisyon borcu, net kazanç, defter dökümü. */
  router.get('/earnings', requireAuth('driver'), (req, res) => {
    const driverId = req.user!.id;
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS ride_count, COALESCE(SUM(final_fare), 0) AS gross, COALESCE(SUM(commission), 0) AS commission
         FROM rides WHERE driver_id = ? AND status = 'completed'`,
      )
      .get(driverId) as unknown as { ride_count: number; gross: number; commission: number };
    const balance = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN type = 'commission' THEN amount ELSE -amount END), 0) AS due
         FROM ledger WHERE driver_id = ?`,
      )
      .get(driverId) as unknown as { due: number };
    const entries = db
      .prepare('SELECT id, ride_id, type, amount, note, created_at FROM ledger WHERE driver_id = ? ORDER BY id DESC LIMIT 50')
      .all(driverId) as unknown as Array<{
      id: number;
      ride_id: number | null;
      type: string;
      amount: number;
      note: string | null;
      created_at: string;
    }>;
    res.json({
      rideCount: totals.ride_count,
      grossEarnings: totals.gross,
      totalCommission: totals.commission,
      netEarnings: Math.round((totals.gross - totals.commission) * 100) / 100,
      commissionDue: Math.round(balance.due * 100) / 100,
      ledger: entries.map((e) => ({
        id: e.id,
        rideId: e.ride_id,
        type: e.type,
        amount: e.amount,
        note: e.note,
        createdAt: e.created_at,
      })),
      updatedAt: nowIso(),
    });
  });

  return router;
}
