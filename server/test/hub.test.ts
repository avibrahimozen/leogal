import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import {
  loginAdmin,
  readyDriver,
  registerPassenger,
  requestRide,
  rideAction,
  sleep,
  waitUntil,
  type Account,
} from './helpers.js';

// Gerçek Socket.IO bağlantısıyla: kimlik doğrulama, sürücü konum yükü doğrulama, olayların doğru odaya gitmesi.
const db = createDb(':memory:');
const { app, hub, matcher } = createApp(db, { offerTimeoutMs: 60_000 });
const server = createServer(app);
hub.attach(server);

let url = '';
let passenger: Account;
let driver: Account;
const sockets: Socket[] = [];

function open(token: string | undefined): Socket {
  const socket = connect(url, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return socket;
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
}

/** Belirli olayı (isteğe bağlı koşulla) bekler; gelmezse zaman aşımıyla reddeder. */
function waitFor<T>(socket: Socket, event: string, pred: (p: T) => boolean = () => true, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event} beklenirken zaman aşımı`));
    }, timeoutMs);
    const handler = (p: T): void => {
      if (!pred(p)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    };
    socket.on(event, handler);
  });
}

function driverLoc(id: number) {
  return db.prepare('SELECT lat, lng FROM drivers WHERE user_id = ?').get(id) as { lat: number | null; lng: number | null };
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const adminToken = await loginAdmin(app);
  passenger = await registerPassenger(app, 'Soket Yolcu');
  driver = await readyDriver(app, adminToken, 'Soket Şoför', 'GM 601');
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  matcher.close();
  hub.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('gerçek zamanlı katman', () => {
  it('geçersiz veya eksik token ile bağlantı reddedilir', async () => {
    for (const token of ['bozuk-token', undefined]) {
      const socket = open(token);
      const err = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
      expect(err.message).toBe('Oturum gerekli');
    }
  });

  it('sürücü konumu soketten kaydedilir; geçersiz yükler yok sayılır', async () => {
    const socket = open(driver.token);
    await connected(socket);
    socket.emit('driver:location', { lat: 35.2, lng: 33.4 });
    await waitUntil(() => driverLoc(driver.id).lat === 35.2);
    expect(driverLoc(driver.id)).toEqual({ lat: 35.2, lng: 33.4 });

    const invalid: unknown[] = [
      { lat: 999, lng: 33.4 },
      { lat: Number.NaN, lng: 33.4 },
      { lat: '35.2', lng: 33.4 },
      { lat: 35.2 },
      null,
      'konum',
    ];
    for (const payload of invalid) socket.emit('driver:location', payload);
    await sleep(150);
    expect(driverLoc(driver.id)).toEqual({ lat: 35.2, lng: 33.4 });

    // Bağlantı sağlam: sonraki geçerli konum yine işlenir
    socket.emit('driver:location', { lat: 35.21, lng: 33.41 });
    await waitUntil(() => driverLoc(driver.id).lat === 35.21);
  });

  it('yolcu soketten sürücü konumu gönderemez', async () => {
    const socket = open(passenger.token);
    await connected(socket);
    socket.emit('driver:location', { lat: 1, lng: 1 });
    await sleep(100);
    expect(driverLoc(driver.id).lat).toBe(35.21);
  });

  it('çağrı olayları ve sürücü konumu doğru kişilere ulaşır', async () => {
    const passengerSocket = open(passenger.token);
    const driverSocket = open(driver.token);
    await Promise.all([connected(passengerSocket), connected(driverSocket)]);

    const offer = waitFor<{ rideId: number; pickupDistanceKm: number }>(driverSocket, 'ride:offer');
    const res = await requestRide(app, passenger.token);
    expect(res.status).toBe(201);
    const rideId = res.body.ride.id as number;
    expect((await offer).rideId).toBe(rideId);

    const accepted = waitFor<{ status: string; ride: { driver: { name: string } } }>(
      passengerSocket,
      'ride:update',
      (p) => p.status === 'accepted',
    );
    expect((await rideAction(app, driver.token, rideId, 'accept')).status).toBe(200);
    expect((await accepted).ride.driver.name).toBe('Soket Şoför');

    // Aktif çağrıdaki sürücünün konumu yolcuya akar
    const location = waitFor<{ rideId: number; lat: number; lng: number }>(passengerSocket, 'driver:location');
    driverSocket.emit('driver:location', { lat: 35.25, lng: 33.45 });
    expect(await location).toEqual({ rideId, lat: 35.25, lng: 33.45, heading: null });

    // Yolcu iptal edince sürücü de haber alır
    const cancelled = waitFor<{ status: string; cancelReason: string }>(
      driverSocket,
      'ride:update',
      (p) => p.status === 'cancelled',
    );
    expect((await rideAction(app, passenger.token, rideId, 'cancel')).status).toBe(200);
    expect((await cancelled).cancelReason).toBe('passenger_cancelled');
  });
});
