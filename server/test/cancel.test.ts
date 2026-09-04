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
  setOnline,
  type Account,
} from './helpers.js';

// Sürücü iptali: çağrı, iptal eden sürücü hariç yeniden yayınlanır ve yolcuya tek olay gider;
// sürücünün iptal sayacı artar. Aday yoksa yolcu 'sürücü bulunamadı' alır.
const db = createDb(':memory:');
const { app, hub, matcher } = createApp(db, { offerTimeoutMs: 60_000 });
const emit = vi.spyOn(hub, 'emitToUser');

let adminToken = '';
let passenger: Account;
let otherPassenger: Account;
let driverA: Account;
let driverB: Account;

interface RideUpdate {
  rideId: number;
  status: string;
  cancelReason?: string;
  reassigned?: boolean;
  previousDriverCancelled?: boolean;
  ride: { id: number; status: string; driver: unknown; cancelReason: string | null };
}

/** Spy kayıtlarından belirli kullanıcıya giden belirli olayın yüklerini süzer. */
function payloadsFor<T>(userId: number, event: string): T[] {
  return emit.mock.calls.filter(([uid, ev]) => uid === userId && ev === event).map(([, , payload]) => payload as T);
}

function offersFor(rideId: number): number[] {
  return emit.mock.calls
    .filter(([, ev, payload]) => ev === 'ride:offer' && (payload as { rideId: number }).rideId === rideId)
    .map(([uid]) => uid);
}

function rideRow(id: number) {
  return db.prepare('SELECT status, driver_id, cancel_reason, accepted_at FROM rides WHERE id = ?').get(id) as {
    status: string;
    driver_id: number | null;
    cancel_reason: string | null;
    accepted_at: string | null;
  };
}

function cancellationsOf(driverId: number): number {
  const row = db.prepare('SELECT cancellations FROM drivers WHERE user_id = ?').get(driverId) as {
    cancellations: number;
  };
  return row.cancellations;
}

beforeAll(async () => {
  adminToken = await loginAdmin(app);
  passenger = await registerPassenger(app, 'Ayşe Yolcu');
  otherPassenger = await registerPassenger(app, 'Başka Yolcu');
  driverA = await readyDriver(app, adminToken, 'Ali Şoför', 'GM 401');
  driverB = await readyDriver(app, adminToken, 'Veli Şoför', 'GM 402', 35.191, 33.381);
});

afterAll(() => {
  matcher.close();
  emit.mockRestore();
});

describe('sürücü iptali ve yeniden yayın', () => {
  it('sürücü iptal edince çağrı diğer sürücülere yeniden yayınlanır; yolcuya tek olay gider', async () => {
    const res = await requestRide(app, passenger.token);
    expect(res.status).toBe(201);
    const rideId = res.body.ride.id as number;
    expect((await rideAction(app, driverA.token, rideId, 'accept')).status).toBe(200);

    emit.mockClear();
    const cancel = await rideAction(app, driverA.token, rideId, 'cancel');
    expect(cancel.status).toBe(200);
    // Sürücüye kendi açısından iptal edilmiş görünüm döner
    expect(cancel.body.ride).toMatchObject({ id: rideId, status: 'cancelled', cancelReason: 'driver_cancelled' });

    // Yolcu: 'cancelled' değil, yalnızca tek bir 'requested' olayı
    const passengerUpdates = payloadsFor<RideUpdate>(passenger.id, 'ride:update').filter((p) => p.rideId === rideId);
    expect(passengerUpdates).toHaveLength(1);
    expect(passengerUpdates[0]).toMatchObject({
      rideId,
      status: 'requested',
      reassigned: true,
      previousDriverCancelled: true,
      ride: { id: rideId, status: 'requested', driver: null },
    });

    // İptal eden sürücü: uygulaması sıfırlansın diye 'cancelled' olayı alır
    const driverUpdates = payloadsFor<RideUpdate>(driverA.id, 'ride:update').filter((p) => p.rideId === rideId);
    expect(driverUpdates).toHaveLength(1);
    expect(driverUpdates[0]).toMatchObject({
      rideId,
      status: 'cancelled',
      cancelReason: 'driver_cancelled',
      ride: { id: rideId, status: 'cancelled', cancelReason: 'driver_cancelled' },
    });

    // Teklif yalnızca diğer sürücüye gider; iptal eden sürücüye aynı çağrı tekrar teklif edilmez
    expect(offersFor(rideId)).toEqual([driverB.id]);

    expect(rideRow(rideId)).toMatchObject({ status: 'requested', driver_id: null, accepted_at: null });
    expect(cancellationsOf(driverA.id)).toBe(1);

    // Diğer sürücü çağrıyı alabilir
    const accept = await rideAction(app, driverB.token, rideId, 'accept');
    expect(accept.status).toBe(200);
    expect(accept.body.ride.driver.name).toBe('Veli Şoför');
    // Temizlik
    expect((await rideAction(app, passenger.token, rideId, 'cancel')).status).toBe(200);
  });

  it('yeniden yayında aday yoksa yolcuya sürücü bulunamadı iptali gider', async () => {
    await setOnline(app, driverB.token, false);
    const res = await requestRide(app, passenger.token);
    expect(res.status).toBe(201);
    const rideId = res.body.ride.id as number;
    expect((await rideAction(app, driverA.token, rideId, 'accept')).status).toBe(200);

    emit.mockClear();
    const cancel = await rideAction(app, driverA.token, rideId, 'cancel');
    expect(cancel.status).toBe(200);
    expect(cancel.body.ride).toMatchObject({ id: rideId, status: 'cancelled', cancelReason: 'driver_cancelled' });

    const passengerUpdates = payloadsFor<RideUpdate>(passenger.id, 'ride:update').filter((p) => p.rideId === rideId);
    expect(passengerUpdates).toHaveLength(1);
    expect(passengerUpdates[0]).toMatchObject({
      rideId,
      status: 'cancelled',
      cancelReason: 'no_driver',
      ride: { id: rideId, status: 'cancelled', cancelReason: 'no_driver' },
    });
    expect(passengerUpdates[0]).not.toHaveProperty('reassigned');

    const driverUpdates = payloadsFor<RideUpdate>(driverA.id, 'ride:update').filter((p) => p.rideId === rideId);
    expect(driverUpdates).toHaveLength(1);
    expect(driverUpdates[0]).toMatchObject({ status: 'cancelled', cancelReason: 'driver_cancelled' });
    expect(offersFor(rideId)).toEqual([]);

    expect(rideRow(rideId)).toMatchObject({ status: 'cancelled', driver_id: null, cancel_reason: 'no_driver' });
    expect(cancellationsOf(driverA.id)).toBe(2);

    // Yolcu yeni çağrı açabilir
    const active = await request(app).get('/api/rides/active').set(bearer(passenger.token));
    expect(active.body.ride).toBeNull();
    await setOnline(app, driverB.token, true);
  });

  it('yönetici listesinde iptal sayısı görünür', async () => {
    const res = await request(app).get('/api/admin/drivers?status=approved').set(bearer(adminToken));
    expect(res.status).toBe(200);
    const byId = new Map<number, number>(
      res.body.drivers.map((d: { id: number; cancellations: number }) => [d.id, d.cancellations]),
    );
    expect(byId.get(driverA.id)).toBe(2);
    expect(byId.get(driverB.id)).toBe(0);
  });
});

describe('iptal yetkisi ve durum makinesi', () => {
  it('başka sürücü veya başka yolcu çağrıyı iptal edemez', async () => {
    const res = await requestRide(app, passenger.token);
    const rideId = res.body.ride.id as number;
    expect((await rideAction(app, driverA.token, rideId, 'accept')).status).toBe(200);
    expect((await rideAction(app, driverB.token, rideId, 'cancel')).status).toBe(403);
    expect((await rideAction(app, otherPassenger.token, rideId, 'cancel')).status).toBe(403);
    expect(cancellationsOf(driverB.id)).toBe(0);

    // Yolcu iptal edince sürücüye de haber gider
    emit.mockClear();
    expect((await rideAction(app, passenger.token, rideId, 'cancel')).status).toBe(200);
    expect(payloadsFor<RideUpdate>(driverA.id, 'ride:update')[0]).toMatchObject({
      rideId,
      status: 'cancelled',
      cancelReason: 'passenger_cancelled',
    });
  });

  it('yolculuk sırasında yolcu istediği an bitirebilir: ücret ve komisyon işlenmez, sürücüye haber gider', async () => {
    const res = await requestRide(app, passenger.token);
    const rideId = res.body.ride.id as number;
    expect((await rideAction(app, driverA.token, rideId, 'accept')).status).toBe(200);
    expect((await rideAction(app, driverA.token, rideId, 'arrived')).status).toBe(200);
    expect((await rideAction(app, driverA.token, rideId, 'start')).status).toBe(200);
    emit.mockClear();

    const ended = await rideAction(app, passenger.token, rideId, 'cancel');
    expect(ended.status).toBe(200);
    expect(ended.body.ride.status).toBe('cancelled');
    expect(ended.body.ride.cancelReason).toBe('passenger_ended');
    expect(ended.body.ride.finalFare).toBeNull();
    expect(rideRow(rideId)).toMatchObject({ status: 'cancelled', cancel_reason: 'passenger_ended' });
    const ledger = db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE ride_id = ?').get(rideId) as { n: number };
    expect(ledger.n).toBe(0);
    // Sürücü anında öğrenir; yeniden yayın olmaz
    const toDriver = payloadsFor<RideUpdate>(driverA.id, 'ride:update');
    expect(toDriver).toHaveLength(1);
    expect(toDriver[0]).toMatchObject({ rideId, status: 'cancelled', cancelReason: 'passenger_ended' });
    expect(offersFor(rideId)).toEqual([]);
    // Bitmiş yolculuk tamamlanamaz
    expect((await rideAction(app, driverA.token, rideId, 'complete')).status).toBe(409);
  });

  it('yolculuk sırasında sürücü de bitirebilir: iptal sayacı artmaz, yolcuya haber gider, komisyon yok', async () => {
    const before = cancellationsOf(driverA.id);
    const res = await requestRide(app, passenger.token);
    const rideId = res.body.ride.id as number;
    expect((await rideAction(app, driverA.token, rideId, 'accept')).status).toBe(200);
    expect((await rideAction(app, driverA.token, rideId, 'arrived')).status).toBe(200);
    expect((await rideAction(app, driverA.token, rideId, 'start')).status).toBe(200);
    emit.mockClear();

    const ended = await rideAction(app, driverA.token, rideId, 'cancel');
    expect(ended.status).toBe(200);
    expect(ended.body.ride.cancelReason).toBe('driver_ended');
    expect(rideRow(rideId)).toMatchObject({ status: 'cancelled', cancel_reason: 'driver_ended', driver_id: driverA.id });
    expect(cancellationsOf(driverA.id)).toBe(before);
    const toPassenger = payloadsFor<RideUpdate>(passenger.id, 'ride:update');
    expect(toPassenger).toHaveLength(1);
    expect(toPassenger[0]).toMatchObject({ rideId, status: 'cancelled', cancelReason: 'driver_ended' });
    expect(toPassenger[0]!.reassigned).toBeUndefined();
    const ledger = db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE ride_id = ?').get(rideId) as { n: number };
    expect(ledger.n).toBe(0);
    // İkinci bitirme denemesi 409
    expect((await rideAction(app, passenger.token, rideId, 'cancel')).status).toBe(409);
  });

  it('tamamlama tek seferliktir', async () => {
    const res = await requestRide(app, passenger.token);
    const rideId = res.body.ride.id as number;
    expect((await rideAction(app, driverA.token, rideId, 'accept')).status).toBe(200);
    expect((await rideAction(app, driverA.token, rideId, 'arrived')).status).toBe(200);
    expect((await rideAction(app, driverA.token, rideId, 'start')).status).toBe(200);

    expect((await rideAction(app, driverA.token, rideId, 'complete')).status).toBe(200);
    // Tamamlanmış yolculuk artık bitirilemez / iptal edilemez
    expect((await rideAction(app, passenger.token, rideId, 'cancel')).status).toBe(409);
    expect((await rideAction(app, driverA.token, rideId, 'cancel')).status).toBe(409);
    // Aynı çağrı ikinci kez tamamlanamaz: komisyon deftere iki kez işlenmez
    expect((await rideAction(app, driverA.token, rideId, 'complete')).status).toBe(409);
    const ledger = db
      .prepare("SELECT COUNT(*) AS n FROM ledger WHERE ride_id = ? AND type = 'commission'")
      .get(rideId) as { n: number };
    expect(ledger.n).toBe(1);
  });

  it('çevrimdışı sürücü çağrı kabul edemez', async () => {
    await setOnline(app, driverB.token, false);
    const res = await requestRide(app, passenger.token);
    expect(res.status).toBe(201);
    const rideId = res.body.ride.id as number;
    const offline = await rideAction(app, driverB.token, rideId, 'accept');
    expect(offline.status).toBe(409);
    expect(offline.body.error).toContain('çevrimiçi');
    expect((await rideAction(app, driverA.token, rideId, 'accept')).status).toBe(200);
    await rideAction(app, passenger.token, rideId, 'cancel');
    await setOnline(app, driverB.token, true);
  });

  it('geçersiz çağrı kimliği 404 döner', async () => {
    expect((await rideAction(app, passenger.token, 'abc', 'cancel')).status).toBe(404);
    expect((await rideAction(app, driverA.token, 'abc', 'accept')).status).toBe(404);
    expect((await rideAction(app, driverA.token, '0', 'arrived')).status).toBe(404);
    expect((await rideAction(app, driverA.token, '1.5', 'complete')).status).toBe(404);
    const rate = await request(app).post('/api/rides/abc/rate').set(bearer(passenger.token)).send({ rating: 5 });
    expect(rate.status).toBe(404);
  });
});
