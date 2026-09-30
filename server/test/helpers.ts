import request from 'supertest';
import type { Express } from 'express';
import { config } from '../src/config.js';

// Testlerde ortak kayıt/onay/çağrı yardımcıları. Her test dosyası kendi bellek içi
// veritabanını kullanır; telefonlar dosya içinde benzersiz üretilir.

export const LEFKOSA = { lat: 35.1856, lng: 33.3823, address: 'Dereboyu, Lefkoşa' };
export const ERCAN = { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' };

export interface Account {
  id: number;
  token: string;
  phone: string;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Koşul sağlanana dek kısa aralıklarla bekler (asenkron soket etkileri için). */
export async function waitUntil(check: () => boolean, timeoutMs = 2000, stepMs = 10): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitUntil: koşul zamanında sağlanmadı');
    await sleep(stepMs);
  }
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

let phoneSeq = 0;
/** Dosya içinde benzersiz telefon üretir (OTP yeniden gönderme bekleme süresine takılmamak için). */
export function nextPhone(): string {
  phoneSeq += 1;
  return `+90542${7000000 + phoneSeq}`;
}

function ensure(status: number, expected: number, what: string, body: unknown): void {
  if (status !== expected) throw new Error(`${what} başarısız (${status}): ${JSON.stringify(body)}`);
}

/** SMS doğrulama akışını tamamlayıp kayıt için gereken token'ı döner (console modunda devCode yanıtta gelir). */
export async function verifyPhone(app: Express, phone: string): Promise<string> {
  const req = await request(app).post('/api/auth/otp/request').send({ phone });
  ensure(req.status, 200, 'OTP isteği', req.body);
  const ver = await request(app).post('/api/auth/otp/verify').send({ phone, code: req.body.devCode });
  ensure(ver.status, 200, 'OTP doğrulama', ver.body);
  return ver.body.verificationToken as string;
}

export async function loginAdmin(app: Express): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ phone: config.adminPhone, password: config.adminPassword });
  ensure(res.status, 200, 'yönetici girişi', res.body);
  return res.body.token as string;
}

export async function registerPassenger(app: Express, name = 'Test Yolcu'): Promise<Account> {
  const phone = nextPhone();
  const res = await request(app).post('/api/auth/register').send({
    phone,
    name,
    password: 'gizli123',
    verificationToken: await verifyPhone(app, phone),
  });
  ensure(res.status, 201, 'yolcu kaydı', res.body);
  return { id: res.body.user.id, token: res.body.token, phone };
}

export async function registerDriver(app: Express, name = 'Test Sürücü', plate = 'GM 100'): Promise<Account> {
  const phone = nextPhone();
  const res = await request(app).post('/api/auth/register-driver').send({
    phone,
    name,
    password: 'gizli123',
    licenseNo: `KKTC-${phone.slice(-6)}`,
    vehiclePlate: plate,
    vehicleModel: 'Toyota Corolla',
    city: 'Lefkoşa',
    verificationToken: await verifyPhone(app, phone),
  });
  ensure(res.status, 201, 'sürücü kaydı', res.body);
  return { id: res.body.user.id, token: res.body.token, phone };
}

export async function approveDriver(app: Express, adminToken: string, driverId: number): Promise<void> {
  const res = await request(app).post(`/api/admin/drivers/${driverId}/approve`).set(bearer(adminToken));
  ensure(res.status, 200, 'sürücü onayı', res.body);
}

export async function setOnline(app: Express, token: string, online: boolean): Promise<void> {
  const res = await request(app).post('/api/driver/status').set(bearer(token)).send({ online });
  ensure(res.status, 200, 'çevrimiçi durumu', res.body);
}

export async function sendLocation(app: Express, token: string, lat: number, lng: number): Promise<void> {
  const res = await request(app).post('/api/driver/location').set(bearer(token)).send({ lat, lng });
  ensure(res.status, 200, 'konum bildirimi', res.body);
}

/** Kayıt + onay + çevrimiçi + konum: teklif alabilecek hazır sürücü. */
export async function readyDriver(
  app: Express,
  adminToken: string,
  name: string,
  plate: string,
  lat = 35.19,
  lng = 33.38,
): Promise<Account> {
  const driver = await registerDriver(app, name, plate);
  await approveDriver(app, adminToken, driver.id);
  await setOnline(app, driver.token, true);
  await sendLocation(app, driver.token, lat, lng);
  return driver;
}

export function requestRide(app: Express, token: string, pickup = LEFKOSA, drop = ERCAN) {
  return request(app).post('/api/rides').set(bearer(token)).send({ pickup, drop });
}

/** POST /api/rides/:id/<action> (accept, arrived, start, complete, cancel). */
export function rideAction(app: Express, token: string, rideId: number | string, action: string) {
  return request(app).post(`/api/rides/${rideId}/${action}`).set(bearer(token));
}
