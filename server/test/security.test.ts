import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { assertProductionSecrets, config, rateLimits } from '../src/config.js';
import { signToken, verifyToken } from '../src/lib/auth.js';
import { RATE_LIMIT_MESSAGE, rateLimit, resetRateLimits } from '../src/lib/rateLimit.js';
import { ADMIN_CSP } from '../src/lib/securityHeaders.js';

// Ters vekil davranışını (X-Forwarded-For ile farklı istemci IP'leri) test edebilmek için
// config modülü yüklenmeden önce TRUST_PROXY=1 ayarlanır (vi.hoisted import'lardan önce çalışır).
vi.hoisted(() => {
  process.env.TRUST_PROXY = '1';
});

// Hız sınırlarını test için düşür — createApp bu değerleri router kurulurken okur.
rateLimits.loginPerPhone.max = 3;
rateLimits.loginPerIp.max = 8;
rateLimits.otpRequestPerIp.max = 4;
rateLimits.nearbyPerIp.max = 5;

const db = createDb(':memory:');
const { app, hub, matcher } = createApp(db, { offerTimeoutMs: 60_000 });

const LEFKOSA = { lat: 35.1856, lng: 33.3823, address: 'Dereboyu, Lefkoşa' };
const ERCAN = { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' };

interface Account {
  token: string;
  id: number;
}

let adminToken = '';
let p1: Account;
let p2: Account;
let d1: Account;
let d2: Account;

/** SMS doğrulama akışını tamamlar. Her çağrıda sayaçlar sıfırlanır ki kurulum OTP IP sınırını tüketmesin. */
async function verifyPhone(phone: string): Promise<string> {
  resetRateLimits();
  const req = await request(app).post('/api/auth/otp/request').send({ phone });
  const ver = await request(app).post('/api/auth/otp/verify').send({ phone, code: req.body.devCode });
  return ver.body.verificationToken as string;
}

async function registerPassenger(phone: string, name: string): Promise<Account> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ phone, name, password: 'gizli123', verificationToken: await verifyPhone(phone) });
  expect(res.status).toBe(201);
  return { token: res.body.token, id: res.body.user.id };
}

async function registerDriver(phone: string, name: string, plate: string): Promise<Account> {
  const res = await request(app)
    .post('/api/auth/register-driver')
    .send({
      phone,
      name,
      password: 'gizli123',
      licenseNo: 'KKTC-1',
      vehiclePlate: plate,
      vehicleModel: 'Toyota Corolla',
      city: 'Lefkoşa',
      verificationToken: await verifyPhone(phone),
    });
  expect(res.status).toBe(201);
  const acc = { token: res.body.token, id: res.body.user.id };
  await request(app).post(`/api/admin/drivers/${acc.id}/approve`).set('Authorization', `Bearer ${adminToken}`);
  await request(app).post('/api/driver/status').set('Authorization', `Bearer ${acc.token}`).send({ online: true });
  await request(app).post('/api/driver/location').set('Authorization', `Bearer ${acc.token}`).send({ lat: 35.19, lng: 33.38 });
  return acc;
}

function driverPos(id: number): { lat: number | null; lng: number | null } {
  return db.prepare('SELECT lat, lng FROM drivers WHERE user_id = ?').get(id) as { lat: number | null; lng: number | null };
}

async function waitFor(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: zaman aşımı');
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeAll(async () => {
  const admin = await request(app)
    .post('/api/auth/login')
    .send({ phone: config.adminPhone, password: config.adminPassword });
  adminToken = admin.body.token;
  p1 = await registerPassenger('+905428610001', 'Yolcu Bir');
  p2 = await registerPassenger('+905428610002', 'Yolcu İki');
  d1 = await registerDriver('+905428620001', 'Sürücü Bir', 'GM 601');
  d2 = await registerDriver('+905428620002', 'Sürücü İki', 'GM 602');
  resetRateLimits();
});

afterAll(() => {
  matcher.close();
});

/* ------------------------------------------------------------------ */
describe('rateLimit — kayan pencere (birim)', () => {
  function fakeRes() {
    const headers: Record<string, string> = {};
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      setHeader(name: string, value: string) {
        headers[name] = value;
        return this;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
        return this;
      },
    };
    return { res, headers };
  }

  function makeLimiter(clock: { now: number }, max = 2, windowMs = 10_000) {
    const mw = rateLimit({ windowMs, max, keyFn: (req) => (req as unknown as { key: string | null }).key, now: () => clock.now });
    return (key: string | null) => {
      const { res, headers } = fakeRes();
      const next = vi.fn();
      mw({ key } as unknown as Request, res as unknown as Response, next);
      return { passed: next.mock.calls.length === 1, status: res.statusCode, body: res.body, headers };
    };
  }

  it('pencere içinde max istek geçer, sonraki 429 + Retry-After döner', () => {
    const clock = { now: 1_000 };
    const hit = makeLimiter(clock);
    expect(hit('a').passed).toBe(true);
    expect(hit('a').passed).toBe(true);
    const blocked = hit('a');
    expect(blocked.passed).toBe(false);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: RATE_LIMIT_MESSAGE });
    expect(blocked.headers['Retry-After']).toBe('10');
  });

  it('pencere kayınca eski istekler düşer ve yeniden izin verilir', () => {
    const clock = { now: 1_000 };
    const hit = makeLimiter(clock);
    hit('a');
    clock.now = 4_000;
    hit('a');
    clock.now = 5_000;
    const blocked = hit('a');
    expect(blocked.status).toBe(429);
    // İlk istek (t=1000) pencereden 11000'de çıkar → 6 sn sonra
    expect(blocked.headers['Retry-After']).toBe('6');
    clock.now = 11_000;
    expect(hit('a').passed).toBe(true);
    // Şimdi pencerede t=4000 ve t=11000 var → yine dolu
    expect(hit('a').status).toBe(429);
  });

  it('reddedilen istek cezayı uzatmaz', () => {
    const clock = { now: 1_000 };
    const hit = makeLimiter(clock);
    hit('a');
    hit('a');
    for (let i = 0; i < 5; i++) expect(hit('a').status).toBe(429);
    clock.now = 11_001;
    expect(hit('a').passed).toBe(true);
  });

  it('anahtarlar birbirinden bağımsızdır', () => {
    const hit = makeLimiter({ now: 1_000 });
    hit('a');
    hit('a');
    expect(hit('a').status).toBe(429);
    expect(hit('b').passed).toBe(true);
  });

  it('keyFn null dönerse istek sayılmaz', () => {
    const hit = makeLimiter({ now: 1_000 });
    for (let i = 0; i < 10; i++) expect(hit(null).passed).toBe(true);
  });

  it('resetRateLimits sayaçları sıfırlar', () => {
    const hit = makeLimiter({ now: 1_000 });
    hit('a');
    hit('a');
    expect(hit('a').status).toBe(429);
    resetRateLimits();
    expect(hit('a').passed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
describe('giriş kaba kuvvet sınırı (POST /api/auth/login)', () => {
  beforeEach(() => resetRateLimits());

  function login(phone: string, ip = '198.51.100.1') {
    return request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ phone, password: 'yanlis' });
  }

  it('aynı telefona sınır kadar denemeden sonra 429 döner', async () => {
    for (let i = 0; i < 3; i++) expect((await login('+905428610001')).status).toBe(401);
    const res = await login('+905428610001');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: RATE_LIMIT_MESSAGE });
    const retry = Number(res.headers['retry-after']);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(15 * 60);
  });

  it('telefonun farklı yazımları tek sayaçta toplanır', async () => {
    for (const phone of ['05428610001', '+90 542 861 00 01', '905428610001']) {
      expect((await login(phone)).status).toBe(401);
    }
    expect((await login('+905428610001')).status).toBe(429);
  });

  it('başka telefon numarası etkilenmez', async () => {
    for (let i = 0; i < 3; i++) await login('+905428610001');
    expect((await login('+905428610001')).status).toBe(429);
    expect((await login('+905428610002')).status).toBe(401);
  });

  it('IP başına sınır farklı telefonlarla da işler; başka IP serbest kalır', async () => {
    for (let i = 0; i < 8; i++) {
      expect((await login(`+9054286199${String(i).padStart(2, '0')}`, '203.0.113.10')).status).toBe(401);
    }
    const blocked = await login('+905428619999', '203.0.113.10');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeTruthy();
    expect((await login('+905428619999', '203.0.113.11')).status).toBe(401);
  });

  it('sınır aşılmadan doğru şifreyle giriş çalışmaya devam eder', async () => {
    await login('+905428610001');
    const ok = await request(app).post('/api/auth/login').send({ phone: '+905428610001', password: 'gizli123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
describe('OTP isteği IP sınırı (POST /api/auth/otp/request)', () => {
  beforeEach(() => resetRateLimits());

  it('IP başına sınır aşılınca 429, başka IP serbest', async () => {
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/auth/otp/request')
        .set('X-Forwarded-For', '203.0.113.20')
        .send({ phone: `+9054286300${i}1` });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app)
      .post('/api/auth/otp/request')
      .set('X-Forwarded-For', '203.0.113.20')
      .send({ phone: '+905428630099' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe(RATE_LIMIT_MESSAGE);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60 * 60);

    const other = await request(app)
      .post('/api/auth/otp/request')
      .set('X-Forwarded-For', '203.0.113.21')
      .send({ phone: '+905428630098' });
    expect(other.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
describe('yakındaki taksiler IP sınırı (GET /api/public/nearby-drivers)', () => {
  beforeEach(() => resetRateLimits());

  it('dakikada sınır kadar sorgu geçer, sonrası 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/api/public/nearby-drivers?lat=35.19&lng=33.38').set('X-Forwarded-For', '203.0.113.30');
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get('/api/public/nearby-drivers?lat=35.19&lng=33.38').set('X-Forwarded-For', '203.0.113.30');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
    const other = await request(app).get('/api/public/nearby-drivers').set('X-Forwarded-For', '203.0.113.31');
    expect(other.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
describe('assertProductionSecrets — üretim güvenlik denetimi', () => {
  const STRONG = {
    JWT_SECRET: 'k9Qw7vZ2pL4nX8rT1sY6uB3mH5jC0dF2gA7eV9wQ4z',
    ULAK_ADMIN_PASSWORD: 'Cok-Guclu-Sifre-2026!',
    SMS_PROVIDER: 'twilio',
  };

  it('üretimde varsayılan gizli değerlerle başlatmayı reddeder', () => {
    const env = { NODE_ENV: 'production', JWT_SECRET: 'ulak-dev-secret-change-in-production', ULAK_ADMIN_PASSWORD: 'ulak-admin' };
    expect(() => assertProductionSecrets(env, () => {})).toThrow(/Üretim ortamında/);
    expect(() => assertProductionSecrets(env, () => {})).toThrow(/JWT_SECRET/);
    expect(() => assertProductionSecrets(env, () => {})).toThrow(/ULAK_ADMIN_PASSWORD/);
  });

  it('üretimde eksik değişkenler de reddedilir', () => {
    expect(() => assertProductionSecrets({ NODE_ENV: 'production' }, () => {})).toThrow(/JWT_SECRET/);
  });

  it('üretimde kısa JWT_SECRET reddedilir', () => {
    const env = { NODE_ENV: 'production', ...STRONG, JWT_SECRET: 'kisa-anahtar' };
    expect(() => assertProductionSecrets(env, () => {})).toThrow(/çok kısa/);
  });

  it('üretimde güçlü değerlerle sessizce başlar', () => {
    const warn = vi.fn();
    expect(() => assertProductionSecrets({ NODE_ENV: 'production', ...STRONG }, warn)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it('üretimde console SMS sağlayıcısı devCode sızıntısı için uyarır', () => {
    const warn = vi.fn();
    assertProductionSecrets({ NODE_ENV: 'production', ...STRONG, SMS_PROVIDER: 'console' }, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('SMS_PROVIDER=console');
  });

  it('üretimde OTP kapalıysa uyarır', () => {
    const warn = vi.fn();
    assertProductionSecrets({ NODE_ENV: 'production', ...STRONG, ULAK_OTP_REQUIRED: 'false' }, warn);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('ULAK_OTP_REQUIRED=false');
  });

  it('geliştirmede varsayılanlar tek satırlık uyarıyla geçer', () => {
    const warn = vi.fn();
    expect(() => assertProductionSecrets({ NODE_ENV: 'development' }, warn)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/JWT_SECRET.*ULAK_ADMIN_PASSWORD/);
  });

  it('geliştirmede güçlü değerlerle uyarı vermez', () => {
    const warn = vi.fn();
    assertProductionSecrets({ ...STRONG }, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
describe('güvenlik başlıkları', () => {
  it('API yanıtları temel başlıkları taşır', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toContain('geolocation=()');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('yönetim paneli Leaflet ve OSM karolarına izin veren CSP ile sunulur', async () => {
    const res = await request(app).get('/admin/');
    expect(res.status).toBe(200);
    const csp = res.headers['content-security-policy'];
    expect(csp).toBe(ADMIN_CSP);
    expect(csp).toContain('https://unpkg.com');
    expect(csp).toContain('https://tile.openstreetmap.org');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('HSTS yalnızca HTTPS bağlantılarında gönderilir', async () => {
    const plain = await request(app).get('/api/health');
    expect(plain.headers['strict-transport-security']).toBeUndefined();
    const secure = await request(app).get('/api/health').set('X-Forwarded-Proto', 'https');
    expect(secure.headers['strict-transport-security']).toContain('max-age=');
  });

  it('TRUST_PROXY=1 ile Express trust proxy etkindir', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('404 yanıtı da başlıkları taşır', async () => {
    const res = await request(app).get('/api/yok');
    expect(res.status).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

/* ------------------------------------------------------------------ */
describe('istek gövdesi sınırı', () => {
  it('100 KB üstü JSON gövde 413 ve JSON hata döner', async () => {
    const res = await request(app)
      .post('/api/rides/estimate')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pickup: LEFKOSA, drop: ERCAN, pad: 'x'.repeat(150_000) }));
    expect(res.status).toBe(413);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(typeof res.body.error).toBe('string');
  });

  it('bozuk JSON 400 ve JSON hata döner (HTML yığın izi sızmaz)', async () => {
    const res = await request(app).post('/api/rides/estimate').set('Content-Type', 'application/json').send('{"pickup":');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.error).toBeTruthy();
    expect(res.text).not.toContain('SyntaxError');
  });

  it('normal boyutlu istek etkilenmez', async () => {
    const res = await request(app).post('/api/rides/estimate').send({ pickup: LEFKOSA, drop: ERCAN });
    expect(res.status).toBe(200);
  });
});

/* ------------------------------------------------------------------ */
describe('oturum token doğrulama', () => {
  it('geçerli token kabul edilir', () => {
    expect(verifyToken(signToken({ id: 7, role: 'driver' }))).toEqual({ id: 7, role: 'driver' });
  });

  it('bilinmeyen rol reddedilir', async () => {
    const token = jwt.sign({ sub: '1', role: 'superadmin' }, config.jwtSecret);
    expect(verifyToken(token)).toBeNull();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('sayısal olmayan kullanıcı kimliği reddedilir', () => {
    expect(verifyToken(jwt.sign({ sub: 'abc', role: 'admin' }, config.jwtSecret))).toBeNull();
    expect(verifyToken(jwt.sign({ sub: '0', role: 'admin' }, config.jwtSecret))).toBeNull();
  });

  it('telefon doğrulama token"ı oturum yerine geçmez', async () => {
    const verificationToken = await verifyPhone('+905428640001');
    expect(verificationToken).toBeTruthy();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${verificationToken}`);
    expect(res.status).toBe(401);
  });

  it('farklı anahtarla imzalanan ve alg=none token"lar reddedilir', () => {
    expect(verifyToken(jwt.sign({ sub: '1', role: 'admin' }, 'baska-anahtar'))).toBeNull();
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: '1', role: 'admin' })}.`;
    expect(verifyToken(none)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
describe('sahiplik denetimi (IDOR)', () => {
  let rideId = 0;

  beforeAll(async () => {
    const res = await request(app).post('/api/rides').set('Authorization', `Bearer ${p1.token}`).send({ pickup: LEFKOSA, drop: ERCAN });
    expect(res.status).toBe(201);
    rideId = res.body.ride.id;
    const accept = await request(app).post(`/api/rides/${rideId}/accept`).set('Authorization', `Bearer ${d1.token}`);
    expect(accept.status).toBe(200);
  });

  it('başka sürücü çağrıyı ilerletemez veya iptal edemez', async () => {
    for (const step of ['arrived', 'start', 'complete']) {
      const res = await request(app).post(`/api/rides/${rideId}/${step}`).set('Authorization', `Bearer ${d2.token}`);
      expect(res.status, step).toBe(409);
    }
    const cancel = await request(app).post(`/api/rides/${rideId}/cancel`).set('Authorization', `Bearer ${d2.token}`);
    expect(cancel.status).toBe(403);
  });

  it('başka yolcu çağrıyı iptal edemez', async () => {
    const res = await request(app).post(`/api/rides/${rideId}/cancel`).set('Authorization', `Bearer ${p2.token}`);
    expect(res.status).toBe(403);
  });

  it('yolcu rolü çağrı kabul edemez, sürücü rolü çağrı oluşturamaz', async () => {
    expect((await request(app).post(`/api/rides/${rideId}/accept`).set('Authorization', `Bearer ${p1.token}`)).status).toBe(403);
    expect(
      (await request(app).post('/api/rides').set('Authorization', `Bearer ${d2.token}`).send({ pickup: LEFKOSA, drop: ERCAN })).status,
    ).toBe(403);
  });

  it('başkasının çağrısı aktif/geçmiş listelerinde görünmez', async () => {
    const active = await request(app).get('/api/rides/active').set('Authorization', `Bearer ${d2.token}`);
    expect(active.body.ride).toBeNull();
    const history = await request(app).get('/api/rides/history').set('Authorization', `Bearer ${p2.token}`);
    expect(history.body.rides.some((r: { id: number }) => r.id === rideId)).toBe(false);
  });

  it('tamamlanan çağrıyı yalnızca tarafları puanlayabilir', async () => {
    for (const step of ['arrived', 'start', 'complete']) {
      const res = await request(app).post(`/api/rides/${rideId}/${step}`).set('Authorization', `Bearer ${d1.token}`);
      expect(res.status, step).toBe(200);
    }
    expect((await request(app).post(`/api/rides/${rideId}/rate`).set('Authorization', `Bearer ${p2.token}`).send({ rating: 1 })).status).toBe(403);
    expect((await request(app).post(`/api/rides/${rideId}/rate`).set('Authorization', `Bearer ${d2.token}`).send({ rating: 1 })).status).toBe(403);
    expect((await request(app).post(`/api/rides/${rideId}/rate`).set('Authorization', `Bearer ${p1.token}`).send({ rating: 5 })).status).toBe(200);
  });

  it('yönetici uçları yolcu ve sürücüye kapalıdır', async () => {
    for (const token of [p1.token, d1.token]) {
      expect((await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).post(`/api/admin/drivers/${d2.id}/suspend`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
      expect((await request(app).put('/api/admin/settings').set('Authorization', `Bearer ${token}`).send({ per_km: 1 })).status).toBe(403);
    }
    expect((await request(app).get('/api/admin/stats')).status).toBe(401);
  });

  it('sürücü REST ile yalnızca kendi konumunu güncelleyebilir (gövdedeki kimlik yok sayılır)', async () => {
    const before = driverPos(d2.id);
    const res = await request(app)
      .post('/api/driver/location')
      .set('Authorization', `Bearer ${d1.token}`)
      .send({ lat: 35.3, lng: 33.3, userId: d2.id, driverId: d2.id });
    expect(res.status).toBe(200);
    expect(driverPos(d1.id)).toEqual({ lat: 35.3, lng: 33.3 });
    expect(driverPos(d2.id)).toEqual(before);
  });
});

/* ------------------------------------------------------------------ */
describe('Socket.IO gerçek zamanlı katman', () => {
  let server: Server;
  let port = 0;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    server = createServer(app);
    hub.attach(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    for (const s of sockets) s.close();
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function connect(token?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const s = ioClient(`http://127.0.0.1:${port}`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', (err) => reject(err));
    });
  }

  it('token olmadan veya geçersiz token ile bağlantı reddedilir', async () => {
    await expect(connect()).rejects.toThrow('Oturum gerekli');
    await expect(connect('gecersiz.token.degeri')).rejects.toThrow('Oturum gerekli');
  });

  it('sürücü soketi yalnızca kendi konumunu yazar; başka sürücü kimliği yok sayılır', async () => {
    const before2 = driverPos(d2.id);
    const s = await connect(d1.token);
    s.emit('driver:location', { lat: 35.25, lng: 33.25, driverId: d2.id, userId: d2.id, user: { id: d2.id } });
    await waitFor(() => driverPos(d1.id).lat === 35.25);
    expect(driverPos(d1.id)).toEqual({ lat: 35.25, lng: 33.25 });
    expect(driverPos(d2.id)).toEqual(before2);
  });

  it('yolcu soketi sürücü konumu yazamaz', async () => {
    const snapshot = [driverPos(d1.id), driverPos(d2.id)];
    const s = await connect(p1.token);
    s.emit('driver:location', { lat: 35.01, lng: 33.01 });
    await new Promise((r) => setTimeout(r, 150));
    expect([driverPos(d1.id), driverPos(d2.id)]).toEqual(snapshot);
    const rows = db.prepare('SELECT COUNT(*) AS c FROM drivers WHERE lat = 35.01').get() as { c: number };
    expect(rows.c).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
describe('yönetim paneli (statik)', () => {
  it('satır içi olay işleyici içermez, işlem düğmeleri data-* ile bağlanır', async () => {
    const res = await request(app).get('/admin/');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/\son[a-z]+=/i);
    expect(res.text).toContain('data-action="approve"');
    expect(res.text).toContain("$('#tab-drivers').addEventListener('click'");
  });

  it('tarife alanlarında otomatik tamamlama kapalıdır', async () => {
    const res = await request(app).get('/admin/');
    const matches = res.text.match(/id="set-[a-z_]+"[^>]*autocomplete="off"/g) ?? [];
    expect(matches).toHaveLength(4);
  });
});
