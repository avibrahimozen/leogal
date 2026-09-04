import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

// Çok duraklı çağrılar: tahmin, oluşturma, yolculuk sırasında durak güncelleme, sınırlar
const db = createDb(':memory:');
const { app } = createApp(db, { offerTimeoutMs: 60_000 });

const DEREBOYU = { lat: 35.1897, lng: 33.3573, address: 'Dereboyu, Lefkoşa' };
const GIRNE_KAPISI = { lat: 35.1786, lng: 33.3609, address: 'Girne Kapısı' };
const YDU = { lat: 35.2263, lng: 33.3233, address: 'Yakın Doğu Üniversitesi' };
const HASTANE = { lat: 35.1651, lng: 33.3465, address: 'Lefkoşa Devlet Hastanesi' };
const ERCAN = { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' };

async function verifyPhone(phone: string): Promise<string> {
  const req = await request(app).post('/api/auth/otp/request').send({ phone });
  const ver = await request(app).post('/api/auth/otp/verify').send({ phone, code: req.body.devCode });
  return ver.body.verificationToken as string;
}

let passengerToken = '';
let driverToken = '';
let otherPassengerToken = '';
let rideId = 0;
let directFare = 0;

beforeAll(async () => {
  const admin = await request(app)
    .post('/api/auth/login')
    .send({ phone: config.adminPhone, password: config.adminPassword });
  const adminToken = admin.body.token as string;

  const p = await request(app).post('/api/auth/register').send({
    phone: '+905428800001',
    name: 'Duraklı Yolcu',
    password: 'gizli123',
    verificationToken: await verifyPhone('+905428800001'),
  });
  passengerToken = p.body.token;
  const p2 = await request(app).post('/api/auth/register').send({
    phone: '+905428800003',
    name: 'Başka Yolcu',
    password: 'gizli123',
    verificationToken: await verifyPhone('+905428800003'),
  });
  otherPassengerToken = p2.body.token;

  const d = await request(app).post('/api/auth/register-driver').send({
    phone: '+905428800002',
    name: 'Durak Şoförü',
    password: 'gizli123',
    licenseNo: 'KKTC-1',
    vehiclePlate: 'GM 1',
    vehicleModel: 'Toyota Corolla',
    city: 'Lefkoşa',
    verificationToken: await verifyPhone('+905428800002'),
  });
  driverToken = d.body.token;
  await request(app).post(`/api/admin/drivers/${d.body.user.id}/approve`).set('Authorization', `Bearer ${adminToken}`);
  await request(app).post('/api/driver/status').set('Authorization', `Bearer ${driverToken}`).send({ online: true });
  await request(app).post('/api/driver/location').set('Authorization', `Bearer ${driverToken}`).send({ lat: 35.19, lng: 33.36 });
});

describe('çok duraklı çağrı', () => {
  it('duraklı tahmin, doğrudan tahminden pahalı ve uzundur', async () => {
    const direct = await request(app).post('/api/rides/estimate').send({ pickup: DEREBOYU, drop: ERCAN });
    const withStops = await request(app)
      .post('/api/rides/estimate')
      .send({ pickup: DEREBOYU, drop: ERCAN, stops: [YDU, HASTANE] });
    expect(withStops.status).toBe(200);
    expect(withStops.body.stopCount).toBe(2);
    expect(withStops.body.distanceKm).toBeGreaterThan(direct.body.distanceKm);
    expect(withStops.body.fare).toBeGreaterThan(direct.body.fare);
    directFare = direct.body.fare;
  });

  it('6 durak reddedilir', async () => {
    const res = await request(app)
      .post('/api/rides/estimate')
      .send({ pickup: DEREBOYU, drop: ERCAN, stops: [YDU, HASTANE, GIRNE_KAPISI, YDU, HASTANE, GIRNE_KAPISI] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('En fazla 5 durak');
  });

  it('duraklı çağrı oluşturulur ve sürücüye duraklarla ulaşır', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ pickup: DEREBOYU, drop: ERCAN, stops: [GIRNE_KAPISI] });
    expect(res.status).toBe(201);
    expect(res.body.ride.stops).toHaveLength(1);
    expect(res.body.ride.stops[0].address).toBe('Girne Kapısı');
    expect(res.body.ride.estFare).toBeGreaterThanOrEqual(directFare);
    rideId = res.body.ride.id;
  });

  it('başka yolcu durak değiştiremez', async () => {
    const res = await request(app)
      .put(`/api/rides/${rideId}/stops`)
      .set('Authorization', `Bearer ${otherPassengerToken}`)
      .send({ stops: [YDU] });
    expect(res.status).toBe(403);
  });

  it('yolcu beklerken durak ekler, ücret yeniden hesaplanır', async () => {
    const before = await request(app).get('/api/rides/active').set('Authorization', `Bearer ${passengerToken}`);
    const res = await request(app)
      .put(`/api/rides/${rideId}/stops`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ stops: [GIRNE_KAPISI, YDU, HASTANE] });
    expect(res.status).toBe(200);
    expect(res.body.ride.stops).toHaveLength(3);
    expect(res.body.ride.estFare).toBeGreaterThan(before.body.ride.estFare);
  });

  it('sürücü kabul eder ve aktif çağrıda durakları görür', async () => {
    const accept = await request(app).post(`/api/rides/${rideId}/accept`).set('Authorization', `Bearer ${driverToken}`);
    expect(accept.status).toBe(200);
    const active = await request(app).get('/api/rides/active').set('Authorization', `Bearer ${driverToken}`);
    expect(active.body.ride.stops.map((s: { address: string }) => s.address)).toEqual([
      'Girne Kapısı',
      'Yakın Doğu Üniversitesi',
      'Lefkoşa Devlet Hastanesi',
    ]);
  });

  it('yolculuk sürerken durak çıkarılabilir ve 5. durak eklenebilir, 6. reddedilir', async () => {
    await request(app).post(`/api/rides/${rideId}/arrived`).set('Authorization', `Bearer ${driverToken}`);
    await request(app).post(`/api/rides/${rideId}/start`).set('Authorization', `Bearer ${driverToken}`);
    const fewer = await request(app)
      .put(`/api/rides/${rideId}/stops`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ stops: [YDU] });
    expect(fewer.status).toBe(200);
    expect(fewer.body.ride.stops).toHaveLength(1);
    const five = await request(app)
      .put(`/api/rides/${rideId}/stops`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ stops: [YDU, HASTANE, GIRNE_KAPISI, YDU, HASTANE] });
    expect(five.status).toBe(200);
    expect(five.body.ride.stops).toHaveLength(5);
    const six = await request(app)
      .put(`/api/rides/${rideId}/stops`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ stops: [YDU, HASTANE, GIRNE_KAPISI, YDU, HASTANE, GIRNE_KAPISI] });
    expect(six.status).toBe(400);
  });

  it('tamamlanınca nihai ücret duraklı rotayı yansıtır, sonra durak eklenemez', async () => {
    const active = await request(app).get('/api/rides/active').set('Authorization', `Bearer ${passengerToken}`);
    const complete = await request(app).post(`/api/rides/${rideId}/complete`).set('Authorization', `Bearer ${driverToken}`);
    expect(complete.status).toBe(200);
    expect(complete.body.ride.finalFare).toBe(active.body.ride.estFare);
    expect(complete.body.ride.stops).toHaveLength(5);
    const late = await request(app)
      .put(`/api/rides/${rideId}/stops`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ stops: [] });
    expect(late.status).toBe(409);
  });

  it('duraksız çağrı boş durak listesi döner (geriye uyumluluk)', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ pickup: DEREBOYU, drop: ERCAN });
    expect([200, 201]).toContain(res.status);
    expect(res.body.ride.stops).toEqual([]);
  });
});
