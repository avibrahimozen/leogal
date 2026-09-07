import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import {
  bearer,
  loginAdmin,
  readyDriver,
  registerPassenger,
  requestRide,
  rideAction,
  sleep,
  type Account,
} from './helpers.js';

// Teklif zaman aşımı: kimse kabul etmezse çağrı 'sürücü bulunamadı' ile otomatik iptal olur;
// sunucu yeniden başlasa bile bekleyen çağrılar askıda kalmaz.
const OFFER_TIMEOUT_MS = 150;
const db = createDb(':memory:');
const { app, hub, matcher } = createApp(db, { offerTimeoutMs: OFFER_TIMEOUT_MS });
const emit = vi.spyOn(hub, 'emitToUser');

let passenger: Account;
let driver: Account;

function rideRow(id: number) {
  return db.prepare('SELECT status, cancel_reason FROM rides WHERE id = ?').get(id) as {
    status: string;
    cancel_reason: string | null;
  };
}

beforeAll(async () => {
  const adminToken = await loginAdmin(app);
  passenger = await registerPassenger(app, 'Sabırlı Yolcu');
  driver = await readyDriver(app, adminToken, 'Zaman Şoför', 'GM 301');
});

afterAll(() => {
  matcher.close();
  emit.mockRestore();
});

describe('teklif zaman aşımı', () => {
  it('kimse kabul etmezse çağrı sürücü bulunamadı ile iptal edilir', async () => {
    emit.mockClear();
    const res = await requestRide(app, passenger.token);
    expect(res.status).toBe(201);
    const rideId = res.body.ride.id as number;
    expect(emit).toHaveBeenCalledWith(driver.id, 'ride:offer', expect.objectContaining({ rideId }));

    await sleep(OFFER_TIMEOUT_MS * 3);

    expect(rideRow(rideId)).toEqual({ status: 'cancelled', cancel_reason: 'no_driver' });
    // Yolcuya tam çağrı nesnesiyle iptal olayı gider (uygulama payload.ride okur)
    expect(emit).toHaveBeenCalledWith(
      passenger.id,
      'ride:update',
      expect.objectContaining({
        rideId,
        status: 'cancelled',
        cancelReason: 'no_driver',
        ride: expect.objectContaining({ id: rideId, status: 'cancelled', cancelReason: 'no_driver' }),
      }),
    );
    // Teklif alan sürücüye teklifin kapandığı bildirilir
    expect(emit).toHaveBeenCalledWith(driver.id, 'ride:offer_closed', { rideId });

    const active = await request(app).get('/api/rides/active').set(bearer(passenger.token));
    expect(active.body.ride).toBeNull();
  });

  it('süresi dolan çağrı artık kabul edilemez', async () => {
    const last = db
      .prepare("SELECT id FROM rides WHERE status = 'cancelled' ORDER BY id DESC LIMIT 1")
      .get() as { id: number };
    const res = await rideAction(app, driver.token, last.id, 'accept');
    expect(res.status).toBe(409);
  });

  it('zaman aşımından sonra yolcu yeni çağrı isteyebilir', async () => {
    const res = await requestRide(app, passenger.token);
    expect(res.status).toBe(201);
    expect(res.body.ride.status).toBe('requested');
    // Temizlik: yolcu iptal eder
    const cancel = await rideAction(app, passenger.token, res.body.ride.id, 'cancel');
    expect(cancel.status).toBe(200);
  });

  it('kabul edilen çağrı zaman aşımına uğramaz', async () => {
    const res = await requestRide(app, passenger.token);
    const rideId = res.body.ride.id as number;
    expect((await rideAction(app, driver.token, rideId, 'accept')).status).toBe(200);
    await sleep(OFFER_TIMEOUT_MS * 3);
    expect(rideRow(rideId).status).toBe('accepted');
    // Temizlik
    await rideAction(app, passenger.token, rideId, 'cancel');
  });
});

describe('yeniden başlatma sonrası bekleyen çağrılar', () => {
  it('süresi dolmuş çağrı açılışta, taze olan süresi dolunca iptal edilir', async () => {
    const db2 = createDb(':memory:');
    const insertUser = db2.prepare("INSERT INTO users (phone, name, password_hash, role) VALUES (?, ?, 'x', 'passenger')");
    const p1 = Number(insertUser.run('+905420000001', 'Eski Yolcu').lastInsertRowid);
    const p2 = Number(insertUser.run('+905420000002', 'Taze Yolcu').lastInsertRowid);
    const insertRide = db2.prepare(
      `INSERT INTO rides (passenger_id, status, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, est_distance_km, est_fare, requested_at)
       VALUES (?, 'requested', 35.18, 33.38, 'A', 35.15, 33.49, 'B', 10, 300, ?)`,
    );
    const stale = Number(insertRide.run(p1, new Date(Date.now() - 60_000).toISOString()).lastInsertRowid);
    const fresh = Number(insertRide.run(p2, new Date().toISOString()).lastInsertRowid);

    const ctx = createApp(db2, { offerTimeoutMs: OFFER_TIMEOUT_MS });
    try {
      const row = (id: number) =>
        db2.prepare('SELECT status, cancel_reason FROM rides WHERE id = ?').get(id) as {
          status: string;
          cancel_reason: string | null;
        };
      expect(row(stale)).toEqual({ status: 'cancelled', cancel_reason: 'no_driver' });
      expect(row(fresh).status).toBe('requested');
      await sleep(OFFER_TIMEOUT_MS * 3);
      expect(row(fresh)).toEqual({ status: 'cancelled', cancel_reason: 'no_driver' });
    } finally {
      ctx.matcher.close();
      db2.close();
    }
  });
});
