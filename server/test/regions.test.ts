import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';
import { commissionOf } from '../src/lib/geo.js';
import { COUNTRIES, isValidCity, regionForPoint } from '../src/lib/regions.js';

// Bölgeler: KKTC + Türkiye. Şehir doğrulama, ülkeye özel tarife ve herkese açık bölge listesi.
const db = createDb(':memory:');
const { app } = createApp(db, { offerTimeoutMs: 60_000 });

const LEFKOSA = { lat: 35.1856, lng: 33.3823, address: 'Dereboyu, Lefkoşa' };
const ERCAN = { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' };
const KIZILAY = { lat: 39.9208, lng: 32.8541, address: 'Kızılay, Ankara' };
const ESENBOGA = { lat: 40.1281, lng: 32.9951, address: 'Esenboğa Havalimanı' };

let adminToken = '';

/** SMS doğrulama akışını tamamlayıp kayıt için gereken token'ı döner. */
async function verifyPhone(phone: string): Promise<string> {
  const req = await request(app).post('/api/auth/otp/request').send({ phone });
  const ver = await request(app).post('/api/auth/otp/verify').send({ phone, code: req.body.devCode });
  return ver.body.verificationToken as string;
}

async function registerDriver(phone: string, extra: Record<string, unknown>) {
  return request(app)
    .post('/api/auth/register-driver')
    .send({
      phone,
      name: 'Test Şoför',
      password: 'gizli123',
      licenseNo: 'TEST-1',
      vehiclePlate: 'TS 1',
      vehicleModel: 'Fiat Egea',
      verificationToken: await verifyPhone(phone),
      ...extra,
    });
}

async function estimate(pickup: typeof LEFKOSA, drop: typeof LEFKOSA) {
  const res = await request(app).post('/api/rides/estimate').send({ pickup, drop });
  expect(res.status).toBe(200);
  return res.body as { fare: number; distanceKm: number; country: string; currency: string };
}

function adminGet(path: string) {
  return request(app).get(path).set('Authorization', `Bearer ${adminToken}`);
}

function adminPut(path: string, body: Record<string, unknown>) {
  return request(app).put(path).set('Authorization', `Bearer ${adminToken}`).send(body);
}

beforeAll(async () => {
  const admin = await request(app)
    .post('/api/auth/login')
    .send({ phone: config.adminPhone, password: config.adminPassword });
  adminToken = admin.body.token;
});

describe('regionForPoint', () => {
  it('KKTC şehir merkezleri Kıbrıs kutusuna düşer', () => {
    expect(regionForPoint(35.1856, 33.3823)).toBe('KKTC'); // Lefkoşa
    expect(regionForPoint(35.3364, 33.3182)).toBe('KKTC'); // Girne
    expect(regionForPoint(35.125, 33.95)).toBe('KKTC'); // Gazimağusa
    expect(regionForPoint(35.1988, 32.9917)).toBe('KKTC'); // Güzelyurt
    expect(regionForPoint(35.65, 34.55)).toBe('KKTC'); // Karpaz ucu
  });

  it('Türkiye şehirleri TR döner (kıyıya yakın Mersin dahil)', () => {
    expect(regionForPoint(39.9208, 32.8541)).toBe('TR'); // Ankara
    expect(regionForPoint(41.0082, 28.9784)).toBe('TR'); // İstanbul
    expect(regionForPoint(36.8969, 30.7133)).toBe('TR'); // Antalya
    expect(regionForPoint(36.8121, 34.6415)).toBe('TR'); // Mersin: boylam kutuda ama enlem dışında
  });

  it('kutu sınırı dahildir', () => {
    expect(regionForPoint(35.75, 34.65)).toBe('KKTC');
    expect(regionForPoint(35.76, 34.65)).toBe('TR');
    expect(regionForPoint(34.5, 32.2)).toBe('KKTC');
    expect(regionForPoint(34.49, 32.2)).toBe('TR');
  });
});

describe('şehir listeleri', () => {
  it('KKTC 6 ilçe, Türkiye 81 il', () => {
    expect(COUNTRIES.KKTC.cities).toHaveLength(6);
    expect(COUNTRIES.TR.cities).toHaveLength(81);
    expect(new Set(COUNTRIES.TR.cities).size).toBe(81);
  });

  it('Türkiye illeri Türkçe alfabetik sırada (ı < i, Ç/Ş/Ü doğru yerde)', () => {
    const cities = COUNTRIES.TR.cities;
    const sorted = [...cities].sort(new Intl.Collator('tr').compare);
    expect(cities).toEqual(sorted);
    expect(cities.indexOf('Kırıkkale')).toBeLessThan(cities.indexOf('Kilis'));
    expect(cities.indexOf('Iğdır')).toBeLessThan(cities.indexOf('İstanbul'));
    expect(cities.indexOf('Çorum')).toBeLessThan(cities.indexOf('Denizli'));
    expect(cities.indexOf('Şırnak')).toBeLessThan(cities.indexOf('Tekirdağ'));
  });

  it('isValidCity ülkeye göre ve birebir yazımla doğrular', () => {
    expect(isValidCity('KKTC', 'Girne')).toBe(true);
    expect(isValidCity('TR', 'Girne')).toBe(false);
    expect(isValidCity('TR', 'İzmir')).toBe(true);
    expect(isValidCity('TR', 'Izmir')).toBe(false);
    expect(isValidCity('KKTC', 'Ankara')).toBe(false);
  });
});

describe('sürücü kaydında ülke ve şehir', () => {
  it('ülke verilmezse KKTC varsayılır', async () => {
    const res = await registerDriver('+905428800001', { city: 'Lefkoşa' });
    expect(res.status).toBe(201);
    expect(res.body.user.driver.country).toBe('KKTC');
    expect(res.body.user.driver.city).toBe('Lefkoşa');
  });

  it('Türkiye ili ile kayıt kabul edilir', async () => {
    const res = await registerDriver('+905428800002', { country: 'TR', city: 'İzmir' });
    expect(res.status).toBe(201);
    expect(res.body.user.driver.country).toBe('TR');
    expect(res.body.user.driver.city).toBe('İzmir');
    expect(res.body.user.driver.status).toBe('pending');
  });

  it('Türkiye seçilip KKTC şehri verilirse reddedilir', async () => {
    const res = await registerDriver('+905428800003', { country: 'TR', city: 'Girne' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Türkiye için geçerli bir şehir seçin');
  });

  it('KKTC seçilip Türkiye ili verilirse reddedilir', async () => {
    const res = await registerDriver('+905428800004', { country: 'KKTC', city: 'Ankara' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Kuzey Kıbrıs için geçerli bir şehir seçin');
  });

  it('bilinmeyen ülke reddedilir', async () => {
    const res = await registerDriver('+905428800005', { country: 'DE', city: 'Berlin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Geçersiz ülke (KKTC veya TR)');
  });

  it('giriş ve yönetici listesi ülkeyi gösterir', async () => {
    const login = await request(app).post('/api/auth/login').send({ phone: '+905428800002', password: 'gizli123' });
    expect(login.body.user.driver.country).toBe('TR');

    const list = await adminGet('/api/admin/drivers?status=pending');
    expect(list.status).toBe(200);
    const izmir = list.body.drivers.find((d: { city: string }) => d.city === 'İzmir');
    expect(izmir.country).toBe('TR');
    const lefkosa = list.body.drivers.find((d: { city: string }) => d.city === 'Lefkoşa');
    expect(lefkosa.country).toBe('KKTC');
  });
});

describe('ülkeye özel tarife', () => {
  it('tahmin alış noktasının ülkesini döner', async () => {
    expect((await estimate(LEFKOSA, ERCAN)).country).toBe('KKTC');
    expect((await estimate(KIZILAY, ESENBOGA)).country).toBe('TR');
  });

  it('ilk açılışta Türkiye için yer tutucu tarife tohumlanır, komisyon genelden gelir', async () => {
    const res = await adminGet('/api/admin/settings?country=TR');
    expect(res.status).toBe(200);
    expect(res.body.country).toBe('TR');
    expect(res.body.settings).toEqual({ base_fare: 42, per_km: 28, min_fare: 150, commission_rate: 0.15 });
    expect(res.body.overrides.sort()).toEqual(['base_fare', 'min_fare', 'per_km']);
  });

  it('ülke verilmezse genel ayarlar döner', async () => {
    const res = await adminGet('/api/admin/settings');
    expect(res.status).toBe(200);
    expect(res.body.country).toBeNull();
    expect(res.body.overrides).toEqual([]);
    expect(res.body.settings.per_km).toBe(25);
  });

  it('KKTC için özel değer yoksa genel ayarlar geçerlidir', async () => {
    const res = await adminGet('/api/admin/settings?country=KKTC');
    expect(res.body.overrides).toEqual([]);
    expect(res.body.settings).toEqual({ base_fare: 90, per_km: 25, min_fare: 150, commission_rate: 0.15 });
  });

  it('geçersiz ülke 400 döner', async () => {
    expect((await adminGet('/api/admin/settings?country=XX')).status).toBe(400);
    expect((await adminPut('/api/admin/settings?country=XX', { per_km: 1 })).status).toBe(400);
  });

  it('Türkiye tarifesi değişince yalnızca Türkiye tahmini değişir', async () => {
    const trBefore = await estimate(KIZILAY, ESENBOGA);
    const kktcBefore = await estimate(LEFKOSA, ERCAN);

    const put = await adminPut('/api/admin/settings?country=TR', { per_km: 100 });
    expect(put.status).toBe(200);

    const trAfter = await estimate(KIZILAY, ESENBOGA);
    const kktcAfter = await estimate(LEFKOSA, ERCAN);
    expect(trAfter.fare).toBeGreaterThan(trBefore.fare);
    expect(kktcAfter.fare).toBe(kktcBefore.fare);

    const settings = await adminGet('/api/admin/settings?country=TR');
    expect(settings.body.settings.per_km).toBe(100);
    expect(settings.body.overrides).toContain('per_km');
  });

  it('null gönderilince özel değer kaldırılır ve genel tarifeye dönülür', async () => {
    const put = await adminPut('/api/admin/settings?country=TR', { per_km: null });
    expect(put.status).toBe(200);
    const res = await adminGet('/api/admin/settings?country=TR');
    expect(res.body.overrides).not.toContain('per_km');
    expect(res.body.settings.per_km).toBe(25); // genel değer
    expect(res.body.settings.base_fare).toBe(42); // diğer özel değerler durur
  });

  it('genel ayar değişince özel değeri olmayan ülkeler etkilenir', async () => {
    await adminPut('/api/admin/settings', { per_km: 30 });
    expect((await adminGet('/api/admin/settings?country=TR')).body.settings.per_km).toBe(30);
    expect((await adminGet('/api/admin/settings?country=KKTC')).body.settings.per_km).toBe(30);
    // Genel ayarda null yok sayılır, silinmez
    await adminPut('/api/admin/settings', { per_km: null });
    expect((await adminGet('/api/admin/settings')).body.settings.per_km).toBe(30);
    await adminPut('/api/admin/settings', { per_km: 25 });
  });
});

describe("Türkiye'de yolculuk: ücret ve komisyon TR tarifesiyle", () => {
  let passengerToken = '';
  let driverToken = '';
  let rideId = 0;

  beforeAll(async () => {
    const passenger = await request(app).post('/api/auth/register').send({
      phone: '+905428800010',
      name: 'Ankara Yolcu',
      password: 'gizli123',
      verificationToken: await verifyPhone('+905428800010'),
    });
    passengerToken = passenger.body.token;

    const driver = await registerDriver('+905428800011', { country: 'TR', city: 'Ankara', vehiclePlate: '06 ULK 1' });
    driverToken = driver.body.token;
    await request(app).post(`/api/admin/drivers/${driver.body.user.id}/approve`).set('Authorization', `Bearer ${adminToken}`);
    await request(app).post('/api/driver/status').set('Authorization', `Bearer ${driverToken}`).send({ online: true });
    await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: KIZILAY.lat, lng: KIZILAY.lng });

    await adminPut('/api/admin/settings?country=TR', { commission_rate: 0.2 });
  });

  it('çağrı TR ülkesiyle kaydedilir ve tahminle aynı ücreti taşır', async () => {
    const est = await estimate(KIZILAY, ESENBOGA);
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ pickup: KIZILAY, drop: ESENBOGA });
    expect(res.status).toBe(201);
    expect(res.body.ride.country).toBe('TR');
    expect(res.body.ride.estFare).toBe(est.fare);
    rideId = res.body.ride.id;
  });

  it('tamamlanınca komisyon Türkiye oranıyla (%20) hesaplanır', async () => {
    for (const step of ['accept', 'arrived', 'start']) {
      const res = await request(app).post(`/api/rides/${rideId}/${step}`).set('Authorization', `Bearer ${driverToken}`);
      expect(res.status, step).toBe(200);
    }
    const done = await request(app).post(`/api/rides/${rideId}/complete`).set('Authorization', `Bearer ${driverToken}`);
    expect(done.status).toBe(200);
    const ride = done.body.ride;
    expect(ride.status).toBe('completed');
    expect(ride.country).toBe('TR');
    const row = db.prepare('SELECT commission, country FROM rides WHERE id = ?').get(rideId) as {
      commission: number;
      country: string;
    };
    expect(row.country).toBe('TR');
    expect(row.commission).toBe(commissionOf(ride.finalFare, 0.2));
    expect(row.commission).not.toBe(commissionOf(ride.finalFare, 0.15));
    // Genel komisyon oranı değişmedi
    expect((await adminGet('/api/admin/settings')).body.settings.commission_rate).toBe(0.15);
  });
});

describe('veritabanı geçişi (ülke sütunları)', () => {
  it('eski şemadaki drivers/rides tablolarına country sütunu eklenir, mevcut sürücüler KKTC olur', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ulak-migrate-'));
    const file = path.join(dir, 'old.db');
    try {
      // Ülke sütunları eklenmeden önceki şemayı taklit et
      const old = new DatabaseSync(file);
      old.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          password_hash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
        CREATE TABLE drivers (user_id INTEGER PRIMARY KEY, license_no TEXT NOT NULL, vehicle_plate TEXT NOT NULL,
          vehicle_model TEXT NOT NULL, city TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', is_online INTEGER NOT NULL DEFAULT 0,
          lat REAL, lng REAL, location_at TEXT, rating_sum INTEGER NOT NULL DEFAULT 0, rating_count INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE rides (id INTEGER PRIMARY KEY AUTOINCREMENT, passenger_id INTEGER NOT NULL, driver_id INTEGER, status TEXT NOT NULL DEFAULT 'requested',
          pickup_lat REAL NOT NULL, pickup_lng REAL NOT NULL, pickup_address TEXT NOT NULL, drop_lat REAL NOT NULL, drop_lng REAL NOT NULL, drop_address TEXT NOT NULL,
          est_distance_km REAL NOT NULL, est_fare REAL NOT NULL, final_fare REAL, commission REAL, cancel_reason TEXT, passenger_rating INTEGER, driver_rating INTEGER,
          requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), accepted_at TEXT, arrived_at TEXT, started_at TEXT, completed_at TEXT, cancelled_at TEXT);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO users (id, phone, name, password_hash, role) VALUES (1, '+905000000001', 'Eski Sürücü', 'x', 'driver');
        INSERT INTO drivers (user_id, license_no, vehicle_plate, vehicle_model, city) VALUES (1, 'L', 'GM 1', 'Corolla', 'Girne');
        INSERT INTO rides (passenger_id, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, est_distance_km, est_fare)
          VALUES (1, 35.18, 33.38, 'A', 35.19, 33.39, 'B', 1, 150);
      `);
      old.close();

      const migrated = createDb(file);
      const driverCols = (migrated.prepare('PRAGMA table_info(drivers)').all() as Array<{ name: string }>).map((c) => c.name);
      const rideCols = (migrated.prepare('PRAGMA table_info(rides)').all() as Array<{ name: string }>).map((c) => c.name);
      expect(driverCols).toContain('country');
      expect(rideCols).toContain('country');
      const driver = migrated.prepare('SELECT country FROM drivers WHERE user_id = 1').get() as { country: string };
      expect(driver.country).toBe('KKTC');
      const ride = migrated.prepare('SELECT country FROM rides LIMIT 1').get() as { country: string | null };
      expect(ride.country).toBeNull();
      // Türkiye yer tutucu tarifesi bir kez tohumlanır; kaldırıldıktan sonra yeniden açılışta geri gelmez
      expect(migrated.prepare("SELECT value FROM settings WHERE key = 'TR:per_km'").get()).toBeTruthy();
      migrated.prepare("DELETE FROM settings WHERE key = 'TR:per_km'").run();
      migrated.close();

      const reopened = createDb(file);
      expect(reopened.prepare("SELECT value FROM settings WHERE key = 'TR:per_km'").get()).toBeUndefined();
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('GET /api/public/regions', () => {
  it('girişsiz erişilir; ülke ve şehir listelerini döner', async () => {
    const res = await request(app).get('/api/public/regions');
    expect(res.status).toBe(200);
    expect(res.body.countries).toHaveLength(2);
    const [kktc, tr] = res.body.countries;
    expect(kktc).toMatchObject({ code: 'KKTC', name: 'Kuzey Kıbrıs' });
    expect(kktc.cities).toEqual(['Lefkoşa', 'Girne', 'Gazimağusa', 'Güzelyurt', 'İskele', 'Lefke']);
    expect(tr).toMatchObject({ code: 'TR', name: 'Türkiye' });
    expect(tr.cities).toHaveLength(81);
    expect(tr.cities).toContain('İstanbul');
    expect(tr.cities[0]).toBe('Adana');
    expect(tr.cities[80]).toBe('Zonguldak');
  });
});
