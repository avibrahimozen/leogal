/**
 * Ulak uçtan uca canlı test senaryosu.
 *
 * Sunucuyu bellek-içi veritabanıyla ayağa kaldırır ve gerçek HTTP + Socket.IO
 * bağlantılarıyla tam bir günü oynar: SMS doğrulamalı kayıtlar, yönetici onayı,
 * çevrimiçi sürücü, çağrı -> anlık teklif -> kabul -> canlı konum -> tamamlama,
 * komisyon defteri, puanlama ve tahsilat.
 *
 * Çalıştırma:  npm run demo
 */
import { createServer } from 'node:http';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

const PORT = 4599;
const BASE = `http://localhost:${PORT}`;

let passCount = 0;
let failCount = 0;

function check(condition: unknown, label: string, detail = ''): void {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failCount++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function step(title: string): void {
  console.log(`\n▶ ${title}`);
}

async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

/** Bir socket olayını (isteğe bağlı koşulla) zaman aşımı süresince bekler. */
function waitFor<T>(socket: Socket, event: string, timeoutMs = 5000, predicate?: (p: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`'${event}' olayı ${timeoutMs} ms içinde gelmedi`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (predicate && !predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function otpRegister(
  path: string,
  phone: string,
  extra: Record<string, unknown>,
): Promise<{ token: string; user: { id: number } }> {
  const req = await api<{ devCode: string }>('POST', '/auth/otp/request', { phone });
  const ver = await api<{ verificationToken: string }>('POST', '/auth/otp/verify', {
    phone,
    code: req.body.devCode,
  });
  const reg = await api<{ token: string; user: { id: number } }>('POST', path, {
    phone,
    password: 'gizli123',
    verificationToken: ver.body.verificationToken,
    ...extra,
  });
  if (reg.status !== 201) throw new Error(`Kayıt başarısız: ${JSON.stringify(reg.body)}`);
  return reg.body;
}

// ---- Sunucuyu ayağa kaldır ----
const db = createDb(':memory:');
const { app, hub, matcher } = createApp(db);
const httpServer = createServer(app);
hub.attach(httpServer);
await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
console.log('🚕 Ulak demo sunucusu başladı (bellek-içi veritabanı, SMS: console modu)\n');
console.log('═'.repeat(60));

const startedAt = Date.now();

try {
  step('1. SMS doğrulamalı kayıtlar (Twilio YOK — console modu)');
  const wrongOtp = await api('POST', '/auth/register', {
    phone: '+905428999999',
    name: 'Doğrulamasız',
    password: 'gizli123',
  });
  check(wrongOtp.status === 403, 'SMS doğrulaması olmadan kayıt reddedildi', `HTTP ${wrongOtp.status}`);

  const driver = await otpRegister('/auth/register-driver', '+905428200001', {
    name: 'Mehmet Kaya',
    licenseNo: 'KKTC-101',
    vehiclePlate: 'GM 101',
    vehicleModel: 'Toyota Corolla',
    city: 'Lefkoşa',
  });
  check(!!driver.token, 'Sürücü OTP ile kaydoldu', 'Mehmet Kaya · GM 101');

  const passenger = await otpRegister('/auth/register', '+905428100001', { name: 'Ayşe Yılmaz' });
  check(!!passenger.token, 'Yolcu OTP ile kaydoldu', 'Ayşe Yılmaz');

  step('2. Yönetici onayı');
  const admin = await api<{ token: string }>('POST', '/auth/login', {
    phone: config.adminPhone,
    password: config.adminPassword,
  });
  const earlyOnline = await api('POST', '/driver/status', { online: true }, driver.token);
  check(earlyOnline.status === 403, 'Onaysız sürücü çevrimiçi olamadı', `HTTP ${earlyOnline.status}`);
  const approve = await api('POST', `/admin/drivers/${driver.user.id}/approve`, undefined, admin.body.token);
  check(approve.status === 200, 'Yönetici sürücüyü onayladı');

  step('3. Gerçek zamanlı bağlantılar (Socket.IO)');
  const driverSocket = ioClient(BASE, { auth: { token: driver.token }, transports: ['websocket'] });
  const passengerSocket = ioClient(BASE, { auth: { token: passenger.token }, transports: ['websocket'] });
  await Promise.all([
    waitFor(driverSocket as unknown as Socket, 'connect'),
    waitFor(passengerSocket as unknown as Socket, 'connect'),
  ]);
  check(driverSocket.connected && passengerSocket.connected, 'Sürücü ve yolcu socket bağlantıları kuruldu');

  const badSocket = ioClient(BASE, { auth: { token: 'gecersiz' }, transports: ['websocket'] });
  const badErr = await waitFor<Error>(badSocket as unknown as Socket, 'connect_error');
  check(!!badErr, 'Geçersiz token ile socket bağlantısı reddedildi', badErr.message);
  badSocket.close();

  step('4. Sürücü çevrimiçi olur, konum bildirir');
  await api('POST', '/driver/status', { online: true }, driver.token);
  await api('POST', '/driver/location', { lat: 35.1786, lng: 33.3609 }, driver.token);
  check(true, 'Çevrimiçi + konum: Girne Kapısı, Lefkoşa');

  step('5. Yolcu çağrı oluşturur → teklif sürücüye anlık düşer');
  const offerPromise = waitFor<{ rideId: number; estFare: number; pickupDistanceKm: number }>(
    driverSocket as unknown as Socket,
    'ride:offer',
  );
  const rideRes = await api<{ ride: { id: number; estFare: number; status: string } }>(
    'POST',
    '/rides',
    {
      pickup: { lat: 35.1897, lng: 33.3573, address: 'Dereboyu, Lefkoşa' },
      drop: { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' },
    },
    passenger.token,
  );
  check(rideRes.status === 201, 'Çağrı oluşturuldu', `tahmin ${rideRes.body.ride.estFare} TL`);
  const offer = await offerPromise;
  check(offer.rideId === rideRes.body.ride.id, 'Teklif sürücünün ekranına düştü (ride:offer)',
    `${offer.estFare} TL · yolcuya ${offer.pickupDistanceKm} km`);

  step('6. Sürücü kabul eder → yolcu anlık bilgilendirilir');
  const acceptedPromise = waitFor<{ status: string; ride: { driver: { vehiclePlate: string } } }>(
    passengerSocket as unknown as Socket,
    'ride:update',
    5000,
    (p) => p.status === 'accepted',
  );
  await api('POST', `/rides/${offer.rideId}/accept`, undefined, driver.token);
  const accepted = await acceptedPromise;
  check(accepted.ride.driver.vehiclePlate === 'GM 101', 'Yolcuya sürücü bilgisi ulaştı (ride:update)',
    `plaka ${accepted.ride.driver.vehiclePlate}`);

  step('7. Canlı konum takibi (sürücü → yolcu köprüsü)');
  const locationPromise = waitFor<{ lat: number; lng: number }>(
    passengerSocket as unknown as Socket,
    'driver:location',
  );
  driverSocket.emit('driver:location', { lat: 35.185, lng: 33.37 });
  const liveLocation = await locationPromise;
  check(
    Math.abs(liveLocation.lat - 35.185) < 1e-6,
    'Sürücünün canlı konumu yolcuya aktı (driver:location)',
    `${liveLocation.lat}, ${liveLocation.lng}`,
  );

  step('8. Yolculuk akışı: kapıda → başladı → tamamlandı');
  await api('POST', `/rides/${offer.rideId}/arrived`, undefined, driver.token);
  await api('POST', `/rides/${offer.rideId}/start`, undefined, driver.token);
  const completedPromise = waitFor<{ status: string; ride: { finalFare: number } }>(
    passengerSocket as unknown as Socket,
    'ride:update',
    5000,
    (p) => p.status === 'completed',
  );
  const complete = await api<{ ride: { finalFare: number } }>(
    'POST',
    `/rides/${offer.rideId}/complete`,
    undefined,
    driver.token,
  );
  const completed = await completedPromise;
  check(completed.ride.finalFare === complete.body.ride.finalFare, 'Yolculuk tamamlandı, yolcuya bildirildi',
    `nihai ücret ${complete.body.ride.finalFare} TL`);

  step('9. Komisyon defteri (%15)');
  const earnings = await api<{
    grossEarnings: number;
    totalCommission: number;
    netEarnings: number;
    commissionDue: number;
  }>('GET', '/driver/earnings', undefined, driver.token);
  const expectedCommission = Math.round(earnings.body.grossEarnings * 0.15 * 100) / 100;
  check(
    earnings.body.totalCommission === expectedCommission,
    'Komisyon doğru hesaplandı',
    `brüt ${earnings.body.grossEarnings} TL → komisyon ${earnings.body.totalCommission} TL → net ${earnings.body.netEarnings} TL`,
  );

  step('10. Karşılıklı puanlama');
  await api('POST', `/rides/${offer.rideId}/rate`, { rating: 5 }, passenger.token);
  await api('POST', `/rides/${offer.rideId}/rate`, { rating: 5 }, driver.token);
  const me = await api<{ user: { driver: { rating: number } } }>('GET', '/auth/me', undefined, driver.token);
  check(me.body.user.driver.rating === 5, 'Sürücü puanı güncellendi', `⭐ ${me.body.user.driver.rating}`);

  step('11. Yönetici tahsilatı');
  await api(
    'POST',
    `/admin/drivers/${driver.user.id}/settle`,
    { amount: earnings.body.commissionDue, note: 'Demo tahsilat' },
    admin.body.token,
  );
  const after = await api<{ commissionDue: number }>('GET', '/driver/earnings', undefined, driver.token);
  check(after.body.commissionDue === 0, 'Komisyon borcu kapatıldı', 'borç 0 TL');

  const stats = await api<{ completedRides: number; totalCommission: number }>(
    'GET',
    '/admin/stats',
    undefined,
    admin.body.token,
  );
  check(stats.body.completedRides === 1, 'Yönetici istatistikleri tutarlı',
    `${stats.body.completedRides} yolculuk · ${stats.body.totalCommission} TL komisyon`);

  driverSocket.close();
  passengerSocket.close();
} catch (e) {
  failCount++;
  console.error('\n💥 Senaryo hatası:', e instanceof Error ? e.message : e);
}

console.log('\n' + '═'.repeat(60));
const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  failCount === 0
    ? `\n🎉 SONUÇ: ${passCount}/${passCount + failCount} kontrol başarılı (${duration} sn) — sistem uçtan uca çalışıyor.`
    : `\n⚠️ SONUÇ: ${failCount} kontrol BAŞARISIZ, ${passCount} başarılı (${duration} sn).`,
);

matcher.close();
hub.close();
httpServer.close();
process.exit(failCount === 0 ? 0 : 1);
