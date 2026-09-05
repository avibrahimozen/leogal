import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { createDb, type Db } from '../src/db.js';
import { config } from '../src/config.js';
import type { Hub } from '../src/realtime.js';
import type { Matcher } from '../src/matching.js';
import type { SmsSender } from '../src/lib/sms.js';

/**
 * Gerçek zamanlı katman entegrasyon testleri.
 *
 * Her describe bloğu bellek-içi veritabanıyla gerçek bir HTTP sunucusu açar,
 * Hub'ı bağlar ve gerçek socket.io-client bağlantılarıyla (websocket) yolcu ve
 * sürücü cihazlarını taklit eder. REST çağrıları da aynı sunucuya gider.
 */

const LEFKOSA = { lat: 35.1856, lng: 33.3823, address: 'Dereboyu, Lefkoşa' };
const ERCAN = { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' };
// Sürücü 1 alış noktasına sürücü 2'den daha yakın.
const DRIVER1_POS = { lat: 35.19, lng: 33.36 };
const DRIVER2_POS = { lat: 35.2, lng: 33.32 };

/** Test çıktısını kirletmemek için sessiz console SMS göndericisi (devCode yine döner). */
const quietSms: SmsSender = { kind: 'console', send: async () => {} };

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/**
 * Bir socket olayını bekler. `predicate` verilirse koşulu sağlamayan olaylar
 * atlanır. Zaman aşımında, görülen ama eşleşmeyen son yük hata mesajına eklenir.
 */
function waitFor<T = unknown>(
  socket: Socket,
  event: string,
  predicate?: (payload: T) => boolean,
  timeoutMs = 3000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let skipped = 0;
    let last: unknown;
    const handler = (payload: T) => {
      if (predicate && !predicate(payload)) {
        skipped++;
        last = payload;
        return;
      }
      cleanup();
      resolve(payload);
    };
    const timer = setTimeout(() => {
      cleanup();
      const detail = skipped > 0 ? ` (${skipped} eşleşmeyen olay, sonuncusu: ${JSON.stringify(last)})` : '';
      reject(new Error(`'${event}' olayı ${timeoutMs} ms içinde gelmedi${detail}`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, handler);
    };
    socket.on(event, handler);
  });
}

/** Bir olayın gelen tüm yüklerini biriktirir (olumsuz doğrulamalar için). */
function record<T = unknown>(socket: Socket, event: string): { events: T[]; stop(): void } {
  const events: T[] = [];
  const handler = (payload: T) => {
    events.push(payload);
  };
  socket.on(event, handler);
  return { events, stop: () => socket.off(event, handler) };
}

/** Bağlantı kurulana kadar bekler; kimlik reddedilirse hata fırlatır. */
function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => {
      socket.off('connect', onConnect);
      reject(err);
    };
    const onConnect = () => {
      socket.off('connect_error', onError);
      resolve();
    };
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

/** Koşul sağlanana kadar kısa aralıklarla yoklar. */
async function waitUntil(check: () => boolean, timeoutMs = 3000, label = 'koşul'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`${label} ${timeoutMs} ms içinde sağlanmadı`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

interface TestServer {
  db: Db;
  hub: Hub;
  matcher: Matcher;
  server: HttpServer;
  baseUrl: string;
  sockets: Socket[];
  /** Kimlikli socket açar, bağlantı kurulana kadar bekler ve temizlik listesine ekler. */
  connect(token: string): Promise<Socket>;
  /**
   * Aynı kullanıcıya bir nöbetçi olay gönderip socket'te gelmesini bekler.
   * Socket.IO tek bağlantıda sırayı koruduğundan, nöbetçi geldiğinde ondan önce
   * sunucunun bu kullanıcıya gönderdiği her olay da gelmiş demektir. Böylece
   * "X olayı GELMEDİ" doğrulamaları zamanlayıcıya değil sıraya dayanır.
   */
  flush(userId: number, socket: Socket): Promise<void>;
  close(): Promise<void>;
}

async function startServer(offerTimeoutMs: number): Promise<TestServer> {
  const db = createDb(':memory:');
  const { app, hub, matcher } = createApp(db, { offerTimeoutMs, smsSender: quietSms });
  const server = createServer(app);
  hub.attach(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const sockets: Socket[] = [];
  let flushSeq = 0;

  return {
    db,
    hub,
    matcher,
    server,
    baseUrl,
    sockets,
    async connect(token) {
      const socket = ioClient(baseUrl, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      await waitForConnect(socket);
      return socket;
    },
    async flush(userId, socket) {
      const nonce = ++flushSeq;
      const pending = waitFor<{ nonce: number }>(socket, 'test:flush', (p) => p.nonce === nonce);
      hub.emitToUser(userId, 'test:flush', { nonce });
      await pending;
    },
    async close() {
      for (const socket of sockets) socket.disconnect();
      sockets.length = 0;
      matcher.close();
      hub.close(); // altındaki HTTP sunucusunu da kapatır
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}

interface Actor {
  id: number;
  token: string;
}

interface Actors {
  adminToken: string;
  passenger: Actor;
  /** Onaylı, çevrimiçi, taze konumlu — alış noktasına en yakın. */
  driver1: Actor;
  /** Onaylı, çevrimiçi, taze konumlu — daha uzak. */
  driver2: Actor;
  /** Onay bekliyor (konumu taze olsa da teklif almamalı). */
  pendingDriver: Actor;
  /** Onaylı ama çevrimdışı (konumu taze olsa da teklif almamalı). */
  offlineDriver: Actor;
}

/** SMS doğrulama akışını tamamlayıp kayıt için gereken token'ı döner. */
async function verifyPhone(baseUrl: string, phone: string): Promise<string> {
  const req = await request(baseUrl).post('/api/auth/otp/request').send({ phone });
  expect(req.status, `otp isteği: ${JSON.stringify(req.body)}`).toBe(200);
  const ver = await request(baseUrl).post('/api/auth/otp/verify').send({ phone, code: req.body.devCode });
  expect(ver.status, `otp doğrulama: ${JSON.stringify(ver.body)}`).toBe(200);
  return ver.body.verificationToken as string;
}

async function registerPassenger(baseUrl: string, phone: string, name: string): Promise<Actor> {
  const res = await request(baseUrl).post('/api/auth/register').send({
    phone,
    name,
    password: 'gizli123',
    verificationToken: await verifyPhone(baseUrl, phone),
  });
  expect(res.status, `yolcu kaydı: ${JSON.stringify(res.body)}`).toBe(201);
  return { id: res.body.user.id, token: res.body.token };
}

async function registerDriver(baseUrl: string, phone: string, name: string, plate: string): Promise<Actor> {
  const res = await request(baseUrl).post('/api/auth/register-driver').send({
    phone,
    name,
    password: 'gizli123',
    licenseNo: `KKTC-${plate.replace(/\s/g, '')}`,
    vehiclePlate: plate,
    vehicleModel: 'Toyota Corolla',
    city: 'Lefkoşa',
    verificationToken: await verifyPhone(baseUrl, phone),
  });
  expect(res.status, `sürücü kaydı: ${JSON.stringify(res.body)}`).toBe(201);
  return { id: res.body.user.id, token: res.body.token };
}

async function setLocation(baseUrl: string, actor: Actor, pos: { lat: number; lng: number }): Promise<void> {
  const res = await request(baseUrl)
    .post('/api/driver/location')
    .set('Authorization', `Bearer ${actor.token}`)
    .send(pos);
  expect(res.status).toBe(200);
}

/** Yolcu + 2 aktif sürücü + 1 onaysız + 1 çevrimdışı sürücü kaydeder ve hazırlar. */
async function seedActors(srv: TestServer): Promise<Actors> {
  const { baseUrl } = srv;
  const admin = await request(baseUrl)
    .post('/api/auth/login')
    .send({ phone: config.adminPhone, password: config.adminPassword });
  expect(admin.status).toBe(200);
  const adminToken = admin.body.token as string;

  const passenger = await registerPassenger(baseUrl, '+905428100001', 'Ayşe Yolcu');
  const driver1 = await registerDriver(baseUrl, '+905428200001', 'Mehmet Şoför', 'GM 101');
  const driver2 = await registerDriver(baseUrl, '+905428200002', 'Ali Şoför', 'GM 102');
  const pendingDriver = await registerDriver(baseUrl, '+905428200003', 'Bekleyen Şoför', 'GM 103');
  const offlineDriver = await registerDriver(baseUrl, '+905428200004', 'Çevrimdışı Şoför', 'GM 104');

  for (const d of [driver1, driver2, offlineDriver]) {
    const res = await request(baseUrl)
      .post(`/api/admin/drivers/${d.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  }
  for (const d of [driver1, driver2]) {
    const res = await request(baseUrl)
      .post('/api/driver/status')
      .set('Authorization', `Bearer ${d.token}`)
      .send({ online: true });
    expect(res.status).toBe(200);
  }
  await setLocation(baseUrl, driver1, DRIVER1_POS);
  await setLocation(baseUrl, driver2, DRIVER2_POS);
  // Dışlanmanın sebebi konum tazeliği değil, durum/çevrimiçilik olsun:
  await setLocation(baseUrl, pendingDriver, DRIVER1_POS);
  await setLocation(baseUrl, offlineDriver, DRIVER1_POS);

  return { adminToken, passenger, driver1, driver2, pendingDriver, offlineDriver };
}

function requestRide(srv: TestServer, passenger: Actor) {
  return request(srv.baseUrl)
    .post('/api/rides')
    .set('Authorization', `Bearer ${passenger.token}`)
    .send({ pickup: LEFKOSA, drop: ERCAN });
}

function rideAction(srv: TestServer, actor: Actor, rideId: number, action: string) {
  return request(srv.baseUrl).post(`/api/rides/${rideId}/${action}`).set('Authorization', `Bearer ${actor.token}`);
}

// Olay yükleri
interface OfferPayload {
  rideId: number;
  pickup: { lat: number; lng: number; address: string };
  drop: { lat: number; lng: number; address: string };
  estDistanceKm: number;
  estFare: number;
  pickupDistanceKm: number;
}
interface RideUpdatePayload {
  rideId: number;
  status: string;
  cancelReason?: string;
  reassigned?: boolean;
  ride?: { finalFare: number | null; driver: { vehiclePlate: string } | null };
}
interface LocationPayload {
  rideId: number;
  lat: number;
  lng: number;
  heading: number | null;
}
interface OfferClosedPayload {
  rideId: number;
}

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('socket kimlik doğrulama', () => {
  let srv: TestServer;
  let adminToken = '';

  beforeAll(async () => {
    srv = await startServer(60_000);
    const admin = await request(srv.baseUrl)
      .post('/api/auth/login')
      .send({ phone: config.adminPhone, password: config.adminPassword });
    adminToken = admin.body.token;
  });

  afterAll(async () => {
    await srv.close();
  });

  it('geçersiz token ile bağlantı reddedilir', async () => {
    const socket = ioClient(srv.baseUrl, {
      auth: { token: 'gecersiz-token' },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    srv.sockets.push(socket);
    const err = await waitFor<Error>(socket, 'connect_error');
    expect(err.message).toBe('Oturum gerekli');
    expect(socket.connected).toBe(false);
  });

  it('token olmadan bağlantı reddedilir', async () => {
    const socket = ioClient(srv.baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false });
    srv.sockets.push(socket);
    const err = await waitFor<Error>(socket, 'connect_error');
    expect(err.message).toBe('Oturum gerekli');
    expect(socket.connected).toBe(false);
  });

  it('geçerli token ile bağlantı kurulur', async () => {
    const socket = await srv.connect(adminToken);
    expect(socket.connected).toBe(true);
  });
});

describe('çağrı teklifi, kabul ve canlı akış', () => {
  let srv: TestServer;
  let actors: Actors;
  let passengerSocket: Socket;
  let driver1Socket: Socket;
  let driver2Socket: Socket;
  let pendingSocket: Socket;
  let offlineSocket: Socket;
  let rideId = 0;

  beforeAll(async () => {
    srv = await startServer(60_000);
    actors = await seedActors(srv);
    passengerSocket = await srv.connect(actors.passenger.token);
    driver1Socket = await srv.connect(actors.driver1.token);
    driver2Socket = await srv.connect(actors.driver2.token);
    pendingSocket = await srv.connect(actors.pendingDriver.token);
    offlineSocket = await srv.connect(actors.offlineDriver.token);
  }, 20_000);

  afterAll(async () => {
    await srv.close();
  });

  it('aktif çağrısı olmayan sürücünün konumu kaydedilir ama kimseye iletilmez', async () => {
    const rec = record<LocationPayload>(passengerSocket, 'driver:location');
    driver1Socket.emit('driver:location', { lat: 35.1901, lng: 33.3601 });
    await waitUntil(
      () => {
        const row = srv.db.prepare('SELECT lat FROM drivers WHERE user_id = ?').get(actors.driver1.id) as {
          lat: number;
        };
        return row.lat === 35.1901;
      },
      3000,
      'sürücü konumu veritabanına yazılması',
    );
    await srv.flush(actors.passenger.id, passengerSocket);
    rec.stop();
    expect(rec.events).toEqual([]);
  });

  it('yolcu çağrı açınca teklif yalnız uygun sürücülere düşer', async () => {
    const pendingRec = record<OfferPayload>(pendingSocket, 'ride:offer');
    const offlineRec = record<OfferPayload>(offlineSocket, 'ride:offer');
    const offer1 = waitFor<OfferPayload>(driver1Socket, 'ride:offer');
    const offer2 = waitFor<OfferPayload>(driver2Socket, 'ride:offer');

    const res = await requestRide(srv, actors.passenger);
    expect(res.status).toBe(201);
    expect(res.body.ride.status).toBe('requested');
    rideId = res.body.ride.id;

    const [o1, o2] = await Promise.all([offer1, offer2]);
    for (const offer of [o1, o2]) {
      expect(offer.rideId).toBe(rideId);
      expect(offer.pickup).toEqual(LEFKOSA);
      expect(offer.drop).toEqual(ERCAN);
      expect(offer.estFare).toBe(res.body.ride.estFare);
      expect(typeof offer.pickupDistanceKm).toBe('number');
      expect(offer.pickupDistanceKm).toBeGreaterThan(0);
    }
    // Sürücü 1 alış noktasına daha yakın
    expect(o1.pickupDistanceKm).toBeLessThan(o2.pickupDistanceKm);

    // Onaysız ve çevrimdışı sürücüye hiçbir teklif gitmedi
    await srv.flush(actors.pendingDriver.id, pendingSocket);
    await srv.flush(actors.offlineDriver.id, offlineSocket);
    pendingRec.stop();
    offlineRec.stop();
    expect(pendingRec.events).toEqual([]);
    expect(offlineRec.events).toEqual([]);
  });

  it('sürücü 1 kabul eder: yolcuya sürücü bilgisi, sürücü 2ye teklif kapandı gider', async () => {
    const passengerUpdate = waitFor<RideUpdatePayload>(passengerSocket, 'ride:update', (p) => p.status === 'accepted');
    const driver1Update = waitFor<RideUpdatePayload>(driver1Socket, 'ride:update', (p) => p.status === 'accepted');
    const closed = waitFor<OfferClosedPayload>(driver2Socket, 'ride:offer_closed');

    const res = await rideAction(srv, actors.driver1, rideId, 'accept');
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('accepted');

    const [p, d, c] = await Promise.all([passengerUpdate, driver1Update, closed]);
    expect(p.rideId).toBe(rideId);
    expect(p.ride?.driver?.vehiclePlate).toBe('GM 101');
    expect(d.rideId).toBe(rideId);
    expect(c.rideId).toBe(rideId);

    const late = await rideAction(srv, actors.driver2, rideId, 'accept');
    expect(late.status).toBe(409);
  });

  it('sürücü konumu yolcuya köprülenir; başka sürücünün konumu iletilmez', async () => {
    const rec = record<LocationPayload>(passengerSocket, 'driver:location');

    // Sürücü 2'nin (çağrıda olmayan) konumu sunucuda işlenir ama yolcuya gitmez
    driver2Socket.emit('driver:location', { lat: 35.3, lng: 33.5 });
    await waitUntil(
      () => {
        const row = srv.db.prepare('SELECT lat FROM drivers WHERE user_id = ?').get(actors.driver2.id) as {
          lat: number;
        };
        return row.lat === 35.3;
      },
      3000,
      'sürücü 2 konumunun veritabanına yazılması',
    );
    await srv.flush(actors.passenger.id, passengerSocket);
    expect(rec.events).toEqual([]);

    // Sürücü 1'in konumu yolcuya ulaşır
    const relayed = waitFor<LocationPayload>(passengerSocket, 'driver:location');
    driver1Socket.emit('driver:location', { lat: 35.1877, lng: 33.3765 });
    const loc = await relayed;
    expect(loc).toEqual({ rideId, lat: 35.1877, lng: 33.3765, heading: null });

    rec.stop();
    expect(rec.events).toEqual([loc]);
  });

  it('vardı -> başladı -> tamamlandı geçişleri yolcuya ve sürücüye anlık düşer', async () => {
    const steps: Array<{ action: string; status: string }> = [
      { action: 'arrived', status: 'arrived' },
      { action: 'start', status: 'in_progress' },
      { action: 'complete', status: 'completed' },
    ];
    for (const step of steps) {
      const passengerUpdate = waitFor<RideUpdatePayload>(passengerSocket, 'ride:update', (p) => p.status === step.status);
      const driverUpdate = waitFor<RideUpdatePayload>(driver1Socket, 'ride:update', (p) => p.status === step.status);
      const res = await rideAction(srv, actors.driver1, rideId, step.action);
      expect(res.status, `${step.action}: ${JSON.stringify(res.body)}`).toBe(200);
      const [p, d] = await Promise.all([passengerUpdate, driverUpdate]);
      expect(p.rideId).toBe(rideId);
      expect(d.rideId).toBe(rideId);
      if (step.status === 'completed') {
        expect(typeof p.ride?.finalFare).toBe('number');
        expect(p.ride?.finalFare).toBeGreaterThan(0);
        expect(d.ride?.finalFare).toBe(p.ride?.finalFare);
      }
    }
  });
});

describe('teklif zaman aşımı', () => {
  let srv: TestServer;
  let actors: Actors;
  let passengerSocket: Socket;
  let driver1Socket: Socket;
  let driver2Socket: Socket;

  beforeAll(async () => {
    srv = await startServer(200);
    actors = await seedActors(srv);
    passengerSocket = await srv.connect(actors.passenger.token);
    driver1Socket = await srv.connect(actors.driver1.token);
    driver2Socket = await srv.connect(actors.driver2.token);
  }, 20_000);

  afterAll(async () => {
    await srv.close();
  });

  it('kimse kabul etmezse yolcuya sürücü bulunamadı iptali gider', async () => {
    const offer1 = waitFor<OfferPayload>(driver1Socket, 'ride:offer');
    const offer2 = waitFor<OfferPayload>(driver2Socket, 'ride:offer');
    const expired = waitFor<RideUpdatePayload>(passengerSocket, 'ride:update', (p) => p.status === 'cancelled');
    const closed1 = waitFor<OfferClosedPayload>(driver1Socket, 'ride:offer_closed');
    const closed2 = waitFor<OfferClosedPayload>(driver2Socket, 'ride:offer_closed');

    const res = await requestRide(srv, actors.passenger);
    expect(res.status).toBe(201);
    const rideId = res.body.ride.id as number;
    await Promise.all([offer1, offer2]);

    const update = await expired;
    expect(update).toMatchObject({ rideId, status: 'cancelled', cancelReason: 'no_driver' });

    const [c1, c2] = await Promise.all([closed1, closed2]);
    expect(c1.rideId).toBe(rideId);
    expect(c2.rideId).toBe(rideId);

    const active = await request(srv.baseUrl)
      .get('/api/rides/active')
      .set('Authorization', `Bearer ${actors.passenger.token}`);
    expect(active.body.ride).toBeNull();
  });
});

describe('iptal senaryoları', () => {
  let srv: TestServer;
  let actors: Actors;
  let passengerSocket: Socket;
  let driver1Socket: Socket;
  let driver2Socket: Socket;

  beforeAll(async () => {
    srv = await startServer(60_000);
    actors = await seedActors(srv);
    passengerSocket = await srv.connect(actors.passenger.token);
    driver1Socket = await srv.connect(actors.driver1.token);
    driver2Socket = await srv.connect(actors.driver2.token);
  }, 20_000);

  afterAll(async () => {
    await srv.close();
  });

  it('yolcu beklerken iptal edince her iki sürücüye teklif kapandı gider', async () => {
    const offer1 = waitFor<OfferPayload>(driver1Socket, 'ride:offer');
    const offer2 = waitFor<OfferPayload>(driver2Socket, 'ride:offer');
    const res = await requestRide(srv, actors.passenger);
    expect(res.status).toBe(201);
    const rideId = res.body.ride.id as number;
    await Promise.all([offer1, offer2]);

    const closed1 = waitFor<OfferClosedPayload>(driver1Socket, 'ride:offer_closed');
    const closed2 = waitFor<OfferClosedPayload>(driver2Socket, 'ride:offer_closed');
    const cancelled = waitFor<RideUpdatePayload>(passengerSocket, 'ride:update', (p) => p.status === 'cancelled');

    const cancel = await rideAction(srv, actors.passenger, rideId, 'cancel');
    expect(cancel.status).toBe(200);
    expect(cancel.body.ride.status).toBe('cancelled');

    const [c1, c2, u] = await Promise.all([closed1, closed2, cancelled]);
    expect(c1.rideId).toBe(rideId);
    expect(c2.rideId).toBe(rideId);
    expect(u).toMatchObject({ rideId, status: 'cancelled', cancelReason: 'passenger_cancelled' });
  });

  it('sürücü kabul sonrası vazgeçince yolcu yeniden eşleşir ya da sürücü bulunamadı alır', async () => {
    const offer1 = waitFor<OfferPayload>(driver1Socket, 'ride:offer');
    const res = await requestRide(srv, actors.passenger);
    expect(res.status).toBe(201);
    const rideId = res.body.ride.id as number;
    await offer1;

    const accepted = waitFor<RideUpdatePayload>(passengerSocket, 'ride:update', (p) => p.status === 'accepted');
    const accept = await rideAction(srv, actors.driver1, rideId, 'accept');
    expect(accept.status).toBe(200);
    await accepted;

    // Yolcu için yalnız NİHAİ sonuç doğrulanır; ara 'cancelled' olayının sırası
    // bilinçli olarak test edilmez.
    const outcome = waitFor<RideUpdatePayload>(
      passengerSocket,
      'ride:update',
      (p) =>
        p.rideId === rideId &&
        ((p.status === 'requested' && p.reassigned === true) ||
          (p.status === 'cancelled' && p.cancelReason === 'no_driver')),
    );
    const driverCancelled = waitFor<RideUpdatePayload>(
      driver1Socket,
      'ride:update',
      (p) => p.rideId === rideId && p.status === 'cancelled',
    );
    const reoffer = record<OfferPayload>(driver2Socket, 'ride:offer');

    const cancel = await rideAction(srv, actors.driver1, rideId, 'cancel');
    expect(cancel.status).toBe(200);

    const [final, driverUpdate] = await Promise.all([outcome, driverCancelled]);
    expect(driverUpdate.rideId).toBe(rideId);
    expect(driverUpdate.status).toBe('cancelled');

    if (final.status === 'requested') {
      // Sürücü 2 müsait olduğundan çağrı ona yeniden teklif edilmiş olmalı
      expect(final.reassigned).toBe(true);
      await srv.flush(actors.driver2.id, driver2Socket);
      expect(reoffer.events.map((o) => o.rideId)).toContain(rideId);
    } else {
      expect(final).toMatchObject({ status: 'cancelled', cancelReason: 'no_driver' });
    }
    reoffer.stop();
  });
});
