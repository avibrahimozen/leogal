import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { candidateScore, effectiveRating, isLowRated } from '../src/lib/ranking.js';
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

// Puanlama: yorum, yolcu ortalaması, puana göre eşleştirme önceliği, yönetici görünümleri
const db = createDb(':memory:');
const { app, hub, matcher } = createApp(db, { offerTimeoutMs: 60_000 });
const emit = vi.spyOn(hub, 'emitToUser');

let adminToken = '';
let passenger: Account;
let driver: Account;

function setRating(driverId: number, sum: number, count: number): void {
  db.prepare('UPDATE drivers SET rating_sum = ?, rating_count = ? WHERE user_id = ?').run(sum, count, driverId);
}

async function completeRide(passengerToken: string, driverToken: string): Promise<number> {
  const res = await requestRide(app, passengerToken);
  const id = res.body.ride.id as number;
  for (const step of ['accept', 'arrived', 'start', 'complete']) {
    expect((await rideAction(app, driverToken, id, step)).status).toBe(200);
  }
  return id;
}

beforeAll(async () => {
  adminToken = await loginAdmin(app);
  passenger = await registerPassenger(app, 'Puan Yolcu');
  driver = await readyDriver(app, adminToken, 'Puan Şoför', 'GM 501');
});

describe('lib/ranking', () => {
  it('yeterli puanı olmayan sürücü nötr (4.5) sayılır, ceza almaz', () => {
    expect(effectiveRating({ ratingSum: 0, ratingCount: 0 })).toBe(4.5);
    expect(effectiveRating({ ratingSum: 2, ratingCount: 1 })).toBe(4.5);
    expect(candidateScore(1, { ratingSum: 0, ratingCount: 0 })).toBe(1.25);
    expect(isLowRated({ ratingSum: 1, ratingCount: 1 })).toBe(false);
  });

  it('yüksek puan aynı mesafede öne geçer; düşük puan ek ceza alır', () => {
    expect(candidateScore(1, { ratingSum: 15, ratingCount: 3 })).toBe(1); // 5.0
    expect(candidateScore(1, { ratingSum: 12, ratingCount: 3 })).toBe(1.5); // 4.0 → +0.5 km
    expect(isLowRated({ ratingSum: 9, ratingCount: 3 })).toBe(true); // 3.0 < 3.5
    expect(candidateScore(1, { ratingSum: 9, ratingCount: 3 })).toBe(5); // 1 + 1 + 3
  });
});

describe('puana göre eşleştirme önceliği', () => {
  it('uzak ama yüksek puanlı sürücü, yakın ama düşük puanlı sürücünün önüne geçer', async () => {
    const near = await readyDriver(app, adminToken, 'Yakın Düşük', 'GM 502', 35.19, 33.38);
    const far = await readyDriver(app, adminToken, 'Uzak Yüksek', 'GM 503', 35.196, 33.38);
    setRating(near.id, 9, 3); // 3.0 — düşük
    setRating(far.id, 15, 3); // 5.0

    const candidates = matcher.findCandidates(35.188, 33.38);
    const order = candidates.map((c) => c.driverId);
    expect(order).toContain(near.id);
    expect(order).toContain(far.id);
    expect(order.indexOf(far.id)).toBeLessThan(order.indexOf(near.id));
    // Puansız (nötr) ve en yakın sürücü hepsinin önünde
    expect(order[0]).toBe(driver.id);

    const nearC = candidates.find((c) => c.driverId === near.id)!;
    const farC = candidates.find((c) => c.driverId === far.id)!;
    expect(nearC.distanceKm).toBeLessThan(farC.distanceKm);
    expect(nearC.score).toBeGreaterThan(farC.score);

    await setOnline(app, near.token, false);
    await setOnline(app, far.token, false);
  });
});

describe('puan ve yorum', () => {
  let rideId = 0;

  it('yolcu puan ve yorum bırakır; yorum kırpılır ve yolculukta görünür', async () => {
    rideId = await completeRide(passenger.token, driver.token);
    const res = await request(app)
      .post(`/api/rides/${rideId}/rate`)
      .set(bearer(passenger.token))
      .send({ rating: 5, comment: '  Çok nazikti, teşekkürler  ' });
    expect(res.status).toBe(200);
    expect(res.body.ride.passengerRating).toBe(5);
    expect(res.body.ride.passengerComment).toBe('Çok nazikti, teşekkürler');
    expect(res.body.ride.driverComment).toBeNull();
  });

  it("sürücü yolcuyu puanlar; yolcunun ortalaması yolculuk JSON'unda, /me'de ve yeni teklifte görünür", async () => {
    const res = await request(app).post(`/api/rides/${rideId}/rate`).set(bearer(driver.token)).send({ rating: 4 });
    expect(res.status).toBe(200);
    expect(res.body.ride.passenger.rating).toBe(4);
    expect(res.body.ride.passenger.ratingCount).toBe(1);

    const me = await request(app).get('/api/auth/me').set(bearer(passenger.token));
    expect(me.body.user.passenger).toEqual({ rating: 4, ratingCount: 1 });
    const driverMe = await request(app).get('/api/auth/me').set(bearer(driver.token));
    expect(driverMe.body.user.passenger).toBeUndefined();

    emit.mockClear();
    const req = await requestRide(app, passenger.token);
    expect(req.status).toBe(201);
    const offer = emit.mock.calls.find(([, ev]) => ev === 'ride:offer')?.[2] as { passengerRating: number | null } | undefined;
    expect(offer?.passengerRating).toBe(4);
    expect((await rideAction(app, passenger.token, req.body.ride.id, 'cancel')).status).toBe(200);
  });

  it('boş yorum kaydedilmez; 200 karakterden uzun yorum reddedilir', async () => {
    const id2 = await completeRide(passenger.token, driver.token);
    const long = await request(app)
      .post(`/api/rides/${id2}/rate`)
      .set(bearer(passenger.token))
      .send({ rating: 3, comment: 'a'.repeat(201) });
    expect(long.status).toBe(400);
    const ok = await request(app).post(`/api/rides/${id2}/rate`).set(bearer(passenger.token)).send({ rating: 3, comment: '   ' });
    expect(ok.status).toBe(200);
    expect(ok.body.ride.passengerComment).toBeNull();
  });

  it('yönetici: yolculukta iki yönlü puan ve yorum; sürücüde puan sayısı ve düşük puan işareti; istatistikte sayı', async () => {
    const rides = await request(app).get('/api/admin/rides').set(bearer(adminToken));
    const row = (rides.body.rides as Array<Record<string, unknown>>).find((r) => r.id === rideId);
    expect(row).toMatchObject({
      passengerRating: 5,
      driverRating: 4,
      passengerComment: 'Çok nazikti, teşekkürler',
      driverComment: null,
    });

    const before = await request(app).get('/api/admin/drivers').set(bearer(adminToken));
    const mine = (before.body.drivers as Array<Record<string, unknown>>).find((d) => d.id === driver.id)!;
    expect(mine.ratingCount).toBe(2); // 5 ve 3
    expect(mine.rating).toBe(4);
    expect(mine.lowRating).toBe(false);

    setRating(driver.id, 6, 3); // 2.0
    const after = await request(app).get('/api/admin/drivers').set(bearer(adminToken));
    expect((after.body.drivers as Array<Record<string, unknown>>).find((d) => d.id === driver.id)!.lowRating).toBe(true);
    const stats = await request(app).get('/api/admin/stats').set(bearer(adminToken));
    expect(stats.body.lowRatedDrivers).toBeGreaterThanOrEqual(1);
  });
});
