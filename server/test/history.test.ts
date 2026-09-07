import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request, { type Response as HttpResponse } from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { bearer, registerPassenger, requestRide, type Account } from './helpers.js';

// Geçmiş sayfalama: id'ye göre azalan, anahtar tabanlı (?limit & ?before); nextBefore ile devam edilir.
const db = createDb(':memory:');
const { app, matcher } = createApp(db);

let passenger: Account;
let bulkPassenger: Account;
const createdIds: number[] = [];

beforeAll(async () => {
  passenger = await registerPassenger(app, 'Sayfa Yolcu');
  // Çevrimiçi sürücü yok: her çağrı anında 'sürücü bulunamadı' ile kapanır; hızlı geçmiş üretimi
  for (let i = 0; i < 5; i++) {
    const res = await requestRide(app, passenger.token);
    expect(res.status).toBe(200);
    expect(res.body.noDriver).toBe(true);
    createdIds.push(res.body.ride.id);
  }
  bulkPassenger = await registerPassenger(app, 'Toplu Yolcu');
  const insert = db.prepare(
    `INSERT INTO rides (passenger_id, status, cancel_reason, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, est_distance_km, est_fare)
     VALUES (?, 'cancelled', 'no_driver', 35.18, 33.38, 'A', 35.15, 33.49, 'B', 10, 300)`,
  );
  for (let i = 0; i < 120; i++) insert.run(bulkPassenger.id);
});

afterAll(() => matcher.close());

function history(token: string, query = '') {
  return request(app).get(`/api/rides/history${query}`).set(bearer(token));
}

function ids(res: HttpResponse): number[] {
  return res.body.rides.map((r: { id: number }) => r.id);
}

describe('geçmiş sayfalama', () => {
  it('varsayılan: en yeni önce, sayfa dolmadıysa nextBefore null', async () => {
    const res = await history(passenger.token);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([...createdIds].reverse());
    expect(res.body.nextBefore).toBeNull();
  });

  it('limit ve before ile sayfa sayfa gezilir', async () => {
    const desc = [...createdIds].reverse();
    const page1 = await history(passenger.token, '?limit=2');
    expect(ids(page1)).toEqual(desc.slice(0, 2));
    expect(page1.body.nextBefore).toBe(desc[1]);

    const page2 = await history(passenger.token, `?limit=2&before=${page1.body.nextBefore}`);
    expect(ids(page2)).toEqual(desc.slice(2, 4));
    expect(page2.body.nextBefore).toBe(desc[3]);

    const page3 = await history(passenger.token, `?limit=2&before=${page2.body.nextBefore}`);
    expect(ids(page3)).toEqual(desc.slice(4));
    expect(page3.body.nextBefore).toBeNull();

    const empty = await history(passenger.token, `?limit=2&before=${desc[4]}`);
    expect(ids(empty)).toEqual([]);
    expect(empty.body.nextBefore).toBeNull();
  });

  it('başka yolcunun çağrıları görünmez', async () => {
    const res = await history(passenger.token, '?limit=100');
    expect(ids(res)).toHaveLength(5);
  });

  it('limit en çok 100, 0 ise 1, sayı değilse varsayılan 50', async () => {
    const capped = await history(bulkPassenger.token, '?limit=1000');
    expect(capped.body.rides).toHaveLength(100);
    expect(capped.body.nextBefore).toBe(ids(capped)[99]);
    const rest = await history(bulkPassenger.token, `?limit=1000&before=${capped.body.nextBefore}`);
    expect(rest.body.rides).toHaveLength(20);
    expect(rest.body.nextBefore).toBeNull();

    const one = await history(bulkPassenger.token, '?limit=0');
    expect(one.body.rides).toHaveLength(1);
    const dflt = await history(bulkPassenger.token, '?limit=abc');
    expect(dflt.body.rides).toHaveLength(50);
    expect(dflt.body.nextBefore).toBe(ids(dflt)[49]);
  });

  it('geçersiz before 400 döner', async () => {
    for (const bad of ['abc', '0', '-1', '1.5', '']) {
      const res = await history(passenger.token, `?before=${bad}`);
      expect(res.status, `before=${bad}`).toBe(400);
    }
  });
});
