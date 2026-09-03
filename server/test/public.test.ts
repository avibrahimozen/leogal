import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

// Üyeliksiz "yakındaki taksiler" ucu: yalnızca onaylı + çevrimiçi + taze konumlu sürücüler,
// kimlik bilgisi olmadan ve yuvarlanmış konumla döner.
const db = createDb(':memory:');
const { app } = createApp(db);

const LEFKOSA = { lat: 35.1856, lng: 33.3823 };

async function registerDriver(phone: string, name: string): Promise<{ token: string; id: number }> {
  const otp = await request(app).post('/api/auth/otp/request').send({ phone });
  const ver = await request(app).post('/api/auth/otp/verify').send({ phone, code: otp.body.devCode });
  const res = await request(app).post('/api/auth/register-driver').send({
    phone,
    name,
    password: 'gizli123',
    licenseNo: 'KKTC-1',
    vehiclePlate: 'GM 1',
    vehicleModel: 'Toyota Corolla',
    city: 'Lefkoşa',
    verificationToken: ver.body.verificationToken,
  });
  return { token: res.body.token, id: res.body.user.id };
}

let adminToken = '';
let approved: { token: string; id: number };
let pending: { token: string; id: number };

beforeAll(async () => {
  const admin = await request(app)
    .post('/api/auth/login')
    .send({ phone: config.adminPhone, password: config.adminPassword });
  adminToken = admin.body.token;
  approved = await registerDriver('+905428700001', 'Onaylı Sürücü');
  pending = await registerDriver('+905428700002', 'Bekleyen Sürücü');
  await request(app).post(`/api/admin/drivers/${approved.id}/approve`).set('Authorization', `Bearer ${adminToken}`);
});

describe('yakındaki taksiler (üyeliksiz)', () => {
  it('kimse çevrimiçi değilken boş döner', async () => {
    const res = await request(app).get(`/api/public/nearby-drivers?lat=${LEFKOSA.lat}&lng=${LEFKOSA.lng}`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });

  it('çevrimiçi onaylı sürücü kimliksiz ve yuvarlanmış konumla görünür', async () => {
    await request(app).post('/api/driver/status').set('Authorization', `Bearer ${approved.token}`).send({ online: true });
    await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${approved.token}`)
      .send({ lat: 35.190123, lng: 33.360456 });

    const res = await request(app).get(`/api/public/nearby-drivers?lat=${LEFKOSA.lat}&lng=${LEFKOSA.lng}`);
    expect(res.body.count).toBe(1);
    const d = res.body.drivers[0];
    expect(d.lat).toBe(35.19);
    expect(d.lng).toBe(33.36);
    expect(d.vehicleModel).toBe('Toyota Corolla');
    expect(d.distanceKm).toBeGreaterThan(0);
    expect(d).not.toHaveProperty('name');
    expect(d).not.toHaveProperty('phone');
    expect(d).not.toHaveProperty('vehiclePlate');
  });

  it('onaysız sürücü konum bildirse de listelenmez', async () => {
    await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${pending.token}`)
      .send({ lat: 35.19, lng: 33.36 });
    const res = await request(app).get(`/api/public/nearby-drivers?lat=${LEFKOSA.lat}&lng=${LEFKOSA.lng}`);
    expect(res.body.count).toBe(1);
  });

  it('yarıçap dışındaki sürücü listelenmez', async () => {
    // Gazimağusa'dan bakınca Lefkoşa'daki sürücü 5 km yarıçapına girmez
    const res = await request(app).get('/api/public/nearby-drivers?lat=35.125&lng=33.95&radiusKm=5');
    expect(res.body.count).toBe(0);
  });

  it('konum verilmezse Lefkoşa merkez varsayılır', async () => {
    const res = await request(app).get('/api/public/nearby-drivers');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('çevrimdışı olunca listeden düşer', async () => {
    await request(app).post('/api/driver/status').set('Authorization', `Bearer ${approved.token}`).send({ online: false });
    const res = await request(app).get(`/api/public/nearby-drivers?lat=${LEFKOSA.lat}&lng=${LEFKOSA.lng}`);
    expect(res.body.count).toBe(0);
  });
});
