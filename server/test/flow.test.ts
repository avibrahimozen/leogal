import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

// Uçtan uca akış: kayıt -> onay -> çevrimiçi -> çağrı -> kabul -> tamamlama -> komisyon -> puanlama
const db = createDb(':memory:');
const { app } = createApp(db, { offerTimeoutMs: 60_000 });

const LEFKOSA = { lat: 35.1856, lng: 33.3823, address: 'Dereboyu, Lefkoşa' };
const ERCAN = { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' };

let passengerToken = '';
let driverToken = '';
let driver2Token = '';
let adminToken = '';
let driverId = 0;
let driver2Id = 0;
let rideId = 0;

beforeAll(async () => {
  const admin = await request(app)
    .post('/api/auth/login')
    .send({ phone: config.adminPhone, password: config.adminPassword });
  adminToken = admin.body.token;
});

describe('kayıt ve giriş', () => {
  it('yolcu kaydolur', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ phone: '+905428111111', name: 'Ayşe Yolcu', password: 'gizli123' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('passenger');
    passengerToken = res.body.token;
  });

  it('aynı telefonla ikinci kayıt reddedilir', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ phone: '+905428111111', name: 'Kopya', password: 'gizli123' });
    expect(res.status).toBe(409);
  });

  it('sürücü araç bilgileriyle kaydolur ve onay bekler', async () => {
    const res = await request(app).post('/api/auth/register-driver').send({
      phone: '+905428222222',
      name: 'Mehmet Şoför',
      password: 'gizli123',
      licenseNo: 'KKTC-123456',
      vehiclePlate: 'gm 001',
      vehicleModel: 'Toyota Corolla',
      city: 'Lefkoşa',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.driver.status).toBe('pending');
    expect(res.body.user.driver.vehiclePlate).toBe('GM 001');
    driverToken = res.body.token;
    driverId = res.body.user.id;
  });

  it('ikinci sürücü kaydolur', async () => {
    const res = await request(app).post('/api/auth/register-driver').send({
      phone: '+905428333333',
      name: 'Ali Şoför',
      password: 'gizli123',
      licenseNo: 'KKTC-654321',
      vehiclePlate: 'GM 002',
      vehicleModel: 'Honda Civic',
      city: 'Lefkoşa',
    });
    expect(res.status).toBe(201);
    driver2Token = res.body.token;
    driver2Id = res.body.user.id;
  });

  it('yanlış şifreyle giriş reddedilir', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ phone: '+905428111111', password: 'yanlis' });
    expect(res.status).toBe(401);
  });
});

describe('sürücü onayı', () => {
  it('onaysız sürücü çevrimiçi olamaz', async () => {
    const res = await request(app)
      .post('/api/driver/status')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ online: true });
    expect(res.status).toBe(403);
  });

  it('admin bekleyen sürücüleri listeler', async () => {
    const res = await request(app)
      .get('/api/admin/drivers?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.drivers).toHaveLength(2);
  });

  it('yolcu admin uçlarına erişemez', async () => {
    const res = await request(app)
      .get('/api/admin/drivers')
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(res.status).toBe(403);
  });

  it('admin her iki sürücüyü onaylar', async () => {
    for (const id of [driverId, driver2Id]) {
      const res = await request(app)
        .post(`/api/admin/drivers/${id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    }
  });

  it('onaylı sürücü çevrimiçi olur ve konum bildirir', async () => {
    for (const token of [driverToken, driver2Token]) {
      const on = await request(app)
        .post('/api/driver/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ online: true });
      expect(on.status).toBe(200);
      const loc = await request(app)
        .post('/api/driver/location')
        .set('Authorization', `Bearer ${token}`)
        .send({ lat: 35.19, lng: 33.38 });
      expect(loc.status).toBe(200);
    }
  });
});

describe('çağrı akışı', () => {
  it('ücret tahmini herkese açık', async () => {
    const res = await request(app).post('/api/rides/estimate').send({ pickup: LEFKOSA, drop: ERCAN });
    expect(res.status).toBe(200);
    expect(res.body.fare).toBeGreaterThanOrEqual(150);
    expect(res.body.currency).toBe('TL');
  });

  it('yolcu çağrı oluşturur', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ pickup: LEFKOSA, drop: ERCAN });
    expect(res.status).toBe(201);
    expect(res.body.ride.status).toBe('requested');
    rideId = res.body.ride.id;
  });

  it('aktif çağrı varken ikinci çağrı reddedilir', async () => {
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ pickup: LEFKOSA, drop: ERCAN });
    expect(res.status).toBe(409);
  });

  it('ilk kabul eden sürücü çağrıyı alır', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/accept`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('accepted');
    expect(res.body.ride.driver.name).toBe('Mehmet Şoför');
  });

  it('ikinci sürücünün kabulü reddedilir', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/accept`)
      .set('Authorization', `Bearer ${driver2Token}`);
    expect(res.status).toBe(409);
  });

  it('yolcu aktif çağrısını görür', async () => {
    const res = await request(app).get('/api/rides/active').set('Authorization', `Bearer ${passengerToken}`);
    expect(res.body.ride.id).toBe(rideId);
    expect(res.body.ride.driver.vehiclePlate).toBe('GM 001');
  });

  it('sürücü vardı -> başlat -> tamamla akışı', async () => {
    const arrived = await request(app)
      .post(`/api/rides/${rideId}/arrived`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(arrived.body.ride.status).toBe('arrived');

    const started = await request(app)
      .post(`/api/rides/${rideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(started.body.ride.status).toBe('in_progress');

    // Yolculuk başladıktan sonra yolcu iptal edemez
    const cancel = await request(app)
      .post(`/api/rides/${rideId}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`);
    expect(cancel.status).toBe(409);

    const completed = await request(app)
      .post(`/api/rides/${rideId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(completed.body.ride.status).toBe('completed');
    expect(completed.body.ride.finalFare).toBeGreaterThan(0);
  });

  it('sıralı geçiş zorunlu: tamamlanan çağrı tekrar başlatılamaz', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/start`)
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(409);
  });
});

describe('komisyon ve kazanç', () => {
  it('tamamlanan çağrının komisyonu deftere işlenir', async () => {
    const res = await request(app).get('/api/driver/earnings').set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rideCount).toBe(1);
    expect(res.body.grossEarnings).toBeGreaterThan(0);
    // Varsayılan komisyon %15
    expect(res.body.totalCommission).toBeCloseTo(res.body.grossEarnings * 0.15, 1);
    expect(res.body.commissionDue).toBe(res.body.totalCommission);
    expect(res.body.netEarnings).toBeCloseTo(res.body.grossEarnings - res.body.totalCommission, 1);
  });

  it('admin ödeme kaydedince borç düşer', async () => {
    const before = await request(app).get('/api/driver/earnings').set('Authorization', `Bearer ${driverToken}`);
    const due = before.body.commissionDue;
    const settle = await request(app)
      .post(`/api/admin/drivers/${driverId}/settle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: due, note: 'Nakit tahsilat' });
    expect(settle.status).toBe(200);
    const after = await request(app).get('/api/driver/earnings').set('Authorization', `Bearer ${driverToken}`);
    expect(after.body.commissionDue).toBe(0);
  });

  it('admin istatistikleri komisyonu gösterir', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.completedRides).toBe(1);
    expect(res.body.totalCommission).toBeGreaterThan(0);
  });
});

describe('puanlama', () => {
  it('yolcu sürücüyü puanlar ve ortalama güncellenir', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/rate`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ rating: 5 });
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${driverToken}`);
    expect(me.body.user.driver.rating).toBe(5);
  });

  it('aynı yolculuk iki kez puanlanamaz', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/rate`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ rating: 1 });
    expect(res.status).toBe(409);
  });

  it('sürücü de yolcuyu puanlar', async () => {
    const res = await request(app)
      .post(`/api/rides/${rideId}/rate`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ rating: 4 });
    expect(res.status).toBe(200);
  });
});

describe('ayarlar ve kenar durumlar', () => {
  it('admin komisyon oranını değiştirir, tahmin güncellenir', async () => {
    const before = await request(app).post('/api/rides/estimate').send({ pickup: LEFKOSA, drop: ERCAN });
    const update = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ per_km: 50 });
    expect(update.status).toBe(200);
    const after = await request(app).post('/api/rides/estimate').send({ pickup: LEFKOSA, drop: ERCAN });
    expect(after.body.fare).toBeGreaterThan(before.body.fare);
    // Geri al
    await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ per_km: 25 });
  });

  it('yakında sürücü yoksa çağrı anında sürücü bulunamadı der', async () => {
    // Tüm sürücüleri çevrimdışı yap
    for (const token of [driverToken, driver2Token]) {
      await request(app)
        .post('/api/driver/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ online: false });
    }
    const res = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ pickup: LEFKOSA, drop: ERCAN });
    expect(res.status).toBe(200);
    expect(res.body.noDriver).toBe(true);
    expect(res.body.ride.status).toBe('cancelled');
    expect(res.body.ride.cancelReason).toBe('no_driver');
  });

  it('geçmişte tamamlanan ve iptal edilen çağrılar görünür', async () => {
    const res = await request(app).get('/api/rides/history').set('Authorization', `Bearer ${passengerToken}`);
    expect(res.body.rides.length).toBeGreaterThanOrEqual(2);
  });

  it('token olmadan korumalı uçlara erişilemez', async () => {
    const res = await request(app).get('/api/rides/active');
    expect(res.status).toBe(401);
  });
});
