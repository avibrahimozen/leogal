import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';
import { bearing, routeVia, straightRoute } from '../src/lib/routing.js';
import { loginAdmin, readyDriver } from './helpers.js';

// Testlerde yol rotalama kapalıdır (NODE_ENV=test): düz çizgi yedeği ve uçların şekli sınanır.
const db = createDb(':memory:');
const { app } = createApp(db);

const DEREBOYU = { lat: 35.1897, lng: 33.3573 };
const ERCAN = { lat: 35.1547, lng: 33.4961 };

describe('rotalama yedeği', () => {
  it('testlerde OSRM kapalıdır', () => {
    expect(config.routing.enabled).toBe(false);
  });

  it('routeVia düz çizgi yedeğine düşer ve yol çarpanını uygular', async () => {
    const r = await routeVia([DEREBOYU, ERCAN]);
    expect(r.source).toBe('straight');
    expect(r.points).toHaveLength(2);
    expect(r.durationMin).toBeNull();
    expect(r.distanceKm).toBe(straightRoute([DEREBOYU, ERCAN]).distanceKm);
    expect(r.distanceKm).toBeGreaterThan(10);
  });

  it('bearing: kuzey 0, doğu ~90', () => {
    expect(Math.round(bearing({ lat: 35, lng: 33 }, { lat: 36, lng: 33 }))).toBe(0);
    expect(Math.round(bearing({ lat: 35, lng: 33 }, { lat: 35, lng: 34 }))).toBe(90);
  });
});

describe('GET /api/public/route', () => {
  it('iki nokta için rota döner (yedek: düz)', async () => {
    const res = await request(app).get(`/api/public/route?points=${DEREBOYU.lat},${DEREBOYU.lng}|${ERCAN.lat},${ERCAN.lng}`);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('straight');
    expect(res.body.points).toHaveLength(2);
    expect(res.body.distanceKm).toBeGreaterThan(10);
  });

  it('tek nokta veya bozuk biçim 400', async () => {
    expect((await request(app).get('/api/public/route?points=35.1,33.3')).status).toBe(400);
    expect((await request(app).get('/api/public/route?points=abc')).status).toBe(400);
    expect((await request(app).get('/api/public/route')).status).toBe(400);
  });

  it('tahmin yanıtı süre alanı taşır (yedekte null)', async () => {
    const res = await request(app)
      .post('/api/rides/estimate')
      .send({ pickup: { ...DEREBOYU, address: 'Dereboyu' }, drop: { ...ERCAN, address: 'Ercan' } });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('durationMin', null);
    expect(res.body.fare).toBeGreaterThan(0);
  });
});

describe('sürücü yönü (heading)', () => {
  let adminToken = '';
  let driverToken = '';

  beforeAll(async () => {
    const admin = await request(app).post('/api/auth/login').send({ phone: config.adminPhone, password: config.adminPassword });
    adminToken = admin.body.token;
    const phone = '+905428770001';
    const otp = await request(app).post('/api/auth/otp/request').send({ phone });
    const ver = await request(app).post('/api/auth/otp/verify').send({ phone, code: otp.body.devCode });
    const reg = await request(app).post('/api/auth/register-driver').send({
      phone,
      name: 'Yönlü Şoför',
      password: 'gizli123',
      licenseNo: 'KKTC-9',
      vehiclePlate: 'GM 9',
      vehicleModel: 'Fiat Egea',
      city: 'Lefkoşa',
      verificationToken: ver.body.verificationToken,
    });
    driverToken = reg.body.token;
    await request(app).post(`/api/admin/drivers/${reg.body.user.id}/approve`).set('Authorization', `Bearer ${adminToken}`);
    await request(app).post('/api/driver/status').set('Authorization', `Bearer ${driverToken}`).send({ online: true });
  });

  it('REST konumla gelen yön, yakındaki taksilerde görünür', async () => {
    const loc = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 35.19, lng: 33.36, heading: 135 });
    expect(loc.status).toBe(200);
    const res = await request(app).get('/api/public/nearby-drivers?lat=35.19&lng=33.36');
    expect(res.body.count).toBe(1);
    expect(res.body.drivers[0].heading).toBe(135);
  });

  it('yön verilmezse son yön korunur, geçersiz yön reddedilir', async () => {
    await request(app).post('/api/driver/location').set('Authorization', `Bearer ${driverToken}`).send({ lat: 35.191, lng: 33.361 });
    const kept = await request(app).get('/api/public/nearby-drivers?lat=35.19&lng=33.36');
    expect(kept.body.drivers[0].heading).toBe(135);
    const bad = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 35.19, lng: 33.36, heading: 400 });
    expect(bad.status).toBe(400);
  });

  it('km ücreti varsayılanı 33 TL', async () => {
    const res = await request(app).get('/api/admin/settings').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.settings.per_km).toBe(33);
    const tr = await request(app).get('/api/admin/settings?country=TR').set('Authorization', `Bearer ${adminToken}`);
    expect(tr.body.settings.per_km).toBe(33);
  });
});

describe('tahmin tarifesi ve anonim taksi kimliği', () => {
  it('tahmin yanıtı tarife (açılış / km / asgari) ve mesafe kaynağını taşır', async () => {
    const res = await request(app)
      .post('/api/rides/estimate')
      .send({ pickup: { ...DEREBOYU, address: 'Dereboyu' }, drop: { ...ERCAN, address: 'Ercan' } });
    expect(res.status).toBe(200);
    expect(res.body.tariff).toEqual({ baseFare: 90, perKm: 33, minFare: 150 });
    expect(res.body.route).toBe('straight');
    // Ücret = açılış + km × mesafe, 5 TL'ye yuvarlı (asgarinin üstünde)
    const expected = Math.round((90 + 33 * res.body.distanceKm) / 5) * 5;
    expect(res.body.fare).toBe(Math.max(150, expected));
  });

  it('yakındaki taksiler yenilemeler arasında sabit, anonim bir kimlik taşır', async () => {
    const adminToken = await loginAdmin(app);
    const driver = await readyDriver(app, adminToken, 'Kimlik Şoför', 'GM 777', 35.19, 33.36);
    const first = await request(app).get('/api/public/nearby-drivers?lat=35.19&lng=33.36');
    const second = await request(app).get('/api/public/nearby-drivers?lat=35.19&lng=33.36');
    const a = (first.body.drivers as Array<{ id: string; vehicleModel: string }>).find((d) => d.vehicleModel === 'Toyota Corolla');
    const b = (second.body.drivers as Array<{ id: string }>).find((d) => d.id === a?.id);
    expect(a?.id).toMatch(/^[0-9a-f]{10}$/);
    expect(b).toBeDefined();
    expect(JSON.stringify(first.body)).not.toContain(`"id":${driver.id}`);
  });
});
