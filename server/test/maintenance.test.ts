import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { STALE_ONLINE_MS, startMaintenance, sweepStaleDrivers } from '../src/maintenance.js';
import {
  approveDriver,
  bearer,
  loginAdmin,
  readyDriver,
  registerDriver,
  sendLocation,
  setOnline,
  sleep,
  type Account,
} from './helpers.js';

// Düşen sürücü süpürmesi: konumu 5 dakikadan eski (veya hiç olmayan) çevrimiçi onaylı sürücüler çevrimdışı yapılır.
const db = createDb(':memory:');
const { app, hub, matcher } = createApp(db);

let adminToken = '';
let fresh: Account;
let stale: Account;
let noLocation: Account;

function isOnline(id: number): boolean {
  const row = db.prepare('SELECT is_online FROM drivers WHERE user_id = ?').get(id) as { is_online: number };
  return row.is_online === 1;
}

function setLocationAt(id: number, iso: string | null): void {
  db.prepare('UPDATE drivers SET location_at = ? WHERE user_id = ?').run(iso, id);
}

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

beforeAll(async () => {
  adminToken = await loginAdmin(app);
  fresh = await readyDriver(app, adminToken, 'Taze Şoför', 'GM 501');
  stale = await readyDriver(app, adminToken, 'Eski Şoför', 'GM 502');
  noLocation = await registerDriver(app, 'Konumsuz Şoför', 'GM 503');
  await approveDriver(app, adminToken, noLocation.id);
  await setOnline(app, noLocation.token, true);
});

afterAll(() => matcher.close());

describe('sweepStaleDrivers', () => {
  it('konumu eski veya olmayan çevrimiçi sürücüleri çevrimdışı yapar, tazeleri bırakır', async () => {
    setLocationAt(stale.id, minutesAgo(6));
    expect([fresh.id, stale.id, noLocation.id].every(isOnline)).toBe(true);

    const swept = sweepStaleDrivers(db);
    expect([...swept].sort((a, b) => a - b)).toEqual([stale.id, noLocation.id].sort((a, b) => a - b));
    expect(isOnline(fresh.id)).toBe(true);
    expect(isOnline(stale.id)).toBe(false);
    expect(isOnline(noLocation.id)).toBe(false);

    // İkinci süpürme yapacak iş bulamaz
    expect(sweepStaleDrivers(db)).toEqual([]);

    // Yönetici istatistiği de düşer
    const stats = await request(app).get('/api/admin/stats').set(bearer(adminToken));
    expect(stats.body.onlineDrivers).toBe(1);
  });

  it('eşik 5 dakikadır: 4 dakikalık konum taze sayılır', () => {
    setLocationAt(fresh.id, minutesAgo(4));
    expect(sweepStaleDrivers(db)).toEqual([]);
    expect(isOnline(fresh.id)).toBe(true);
    // Saat ileri alınınca aynı sürücü süpürülür
    expect(sweepStaleDrivers(db, Date.now() + STALE_ONLINE_MS)).toEqual([fresh.id]);
    expect(isOnline(fresh.id)).toBe(false);
  });

  it('tekrar çevrimiçi olup konum bildiren sürücü süpürülmez', async () => {
    await setOnline(app, stale.token, true);
    await sendLocation(app, stale.token, 35.19, 33.38);
    expect(sweepStaleDrivers(db)).toEqual([]);
    expect(isOnline(stale.id)).toBe(true);
  });
});

describe('startMaintenance', () => {
  it('hemen ve aralıkla süpürür, sürücüye durum olayı gönderir, stop() ile durur', async () => {
    const emit = vi.spyOn(hub, 'emitToUser');
    setLocationAt(stale.id, minutesAgo(10));
    const stop = startMaintenance(db, hub, { intervalMs: 30 });
    try {
      // İlk süpürme hemen çalışır
      expect(isOnline(stale.id)).toBe(false);
      expect(emit).toHaveBeenCalledWith(stale.id, 'driver:status', expect.objectContaining({ online: false }));

      // Aralıkla tekrar çalışır
      await setOnline(app, stale.token, true);
      setLocationAt(stale.id, minutesAgo(10));
      await sleep(120);
      expect(isOnline(stale.id)).toBe(false);
    } finally {
      stop();
    }

    // Durduktan sonra süpürme yapılmaz
    await setOnline(app, stale.token, true);
    setLocationAt(stale.id, minutesAgo(10));
    await sleep(120);
    expect(isOnline(stale.id)).toBe(true);
    emit.mockRestore();
  });
});
