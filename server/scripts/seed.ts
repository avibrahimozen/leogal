/**
 * Demo verisi: yönetici + iki yolcu + iki taksici.
 *   Yolcu 1 / Sürücü 1: dolu geçmiş ve komisyon borcu
 *   Yolcu 2 / Sürücü 2: temiz hesaplar (ikinci telefon için)
 *   + 12 sahte yolcu (+9055500001xx): son 2 haftaya yayılmış yolculuk geçmişiyle
 *
 * Kullanım:  npm run seed          (sunucu açık olsa da olur, kapalıyken de)
 * Tekrar çalıştırmak güvenlidir — mevcut kayıtlar çoğaltılmaz.
 */
import bcrypt from 'bcryptjs';
import { createDb, getSetting, type Db } from '../src/db.js';
import { config } from '../src/config.js';
import { commissionOf, estimateFare } from '../src/lib/geo.js';

const DEMO_PASSWORD = 'demo123';

const db = createDb();
const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

function upsertUser(
  phone: string,
  name: string,
  role: 'passenger' | 'driver' | 'admin',
  hash: string = passwordHash,
): { id: number; created: boolean } {
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as { id: number } | undefined;
  if (existing) return { id: existing.id, created: false };
  const result = db
    .prepare('INSERT INTO users (phone, name, password_hash, role, phone_verified_at) VALUES (?, ?, ?, ?, ?)')
    .run(phone, name, hash, role, new Date().toISOString());
  return { id: Number(result.lastInsertRowid), created: true };
}

function fareParams(database: Db) {
  return {
    baseFare: getSetting(database, 'base_fare'),
    perKm: getSetting(database, 'per_km'),
    minFare: getSetting(database, 'min_fare'),
    roadFactor: config.roadFactor,
  };
}

interface SeedRide {
  pickup: { lat: number; lng: number; address: string };
  drop: { lat: number; lng: number; address: string };
  daysAgo: number;
  rating: number;
}

function seedCompletedRide(passengerId: number, driverId: number, ride: SeedRide): number {
  const est = estimateFare(ride.pickup.lat, ride.pickup.lng, ride.drop.lat, ride.drop.lng, fareParams(db));
  const rate = getSetting(db, 'commission_rate');
  const commission = commissionOf(est.fare, rate);
  const base = Date.now() - ride.daysAgo * 86_400_000;
  const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();

  const result = db
    .prepare(
      `INSERT INTO rides (passenger_id, driver_id, status, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address,
         est_distance_km, est_fare, final_fare, commission, passenger_rating, driver_rating,
         requested_at, accepted_at, arrived_at, started_at, completed_at)
       VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, ?, ?, ?, ?, ?)`,
    )
    .run(
      passengerId,
      driverId,
      ride.pickup.lat,
      ride.pickup.lng,
      ride.pickup.address,
      ride.drop.lat,
      ride.drop.lng,
      ride.drop.address,
      est.distanceKm,
      est.fare,
      est.fare,
      commission,
      ride.rating,
      at(0),
      at(2),
      at(7),
      at(9),
      at(9 + Math.round(est.distanceKm * 1.6)),
    );
  const rideId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO ledger (driver_id, ride_id, type, amount, note) VALUES (?, ?, 'commission', ?, ?)").run(
    driverId,
    rideId,
    commission,
    `Çağrı #${rideId} komisyonu (%${Math.round(rate * 100)})`,
  );
  db.prepare('UPDATE drivers SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE user_id = ?').run(
    ride.rating,
    driverId,
  );
  return rideId;
}

// ---- Hesaplar: yönetici + iki yolcu + iki taksici ----
upsertUser(config.adminPhone, 'Ulak Yönetici', 'admin', bcrypt.hashSync(config.adminPassword, 10));
const passenger = upsertUser('+905550000001', 'Demo Yolcu', 'passenger');
const driver = upsertUser('+905550000002', 'Demo Sürücü', 'driver');

const driverExists = db.prepare('SELECT user_id FROM drivers WHERE user_id = ?').get(driver.id);
if (!driverExists) {
  db.prepare(
    "INSERT INTO drivers (user_id, license_no, vehicle_plate, vehicle_model, city, status) VALUES (?, 'KKTC-GM100', 'GM 100', 'Toyota Corolla', 'Lefkoşa', 'approved')",
  ).run(driver.id);
}

// İkinci çift: temiz hesaplar — ikinci telefonda ayrı kullanıcıyla test için
upsertUser('+905550000003', 'Demo Yolcu 2', 'passenger');
const driver2 = upsertUser('+905550000004', 'Demo Sürücü 2', 'driver');
const driver2Exists = db.prepare('SELECT user_id FROM drivers WHERE user_id = ?').get(driver2.id);
if (!driver2Exists) {
  db.prepare(
    "INSERT INTO drivers (user_id, license_no, vehicle_plate, vehicle_model, city, status) VALUES (?, 'KKTC-GN200', 'GN 200', 'Honda Civic', 'Girne', 'approved')",
  ).run(driver2.id);
}

// ---- Yolculuk geçmişi (yalnızca ilk çalıştırmada) ----
const existingRides = db
  .prepare('SELECT COUNT(*) AS c FROM rides WHERE passenger_id = ?')
  .get(passenger.id) as { c: number };

let rideInfo = 'atlandı (geçmiş zaten var)';
if (existingRides.c === 0) {
  const rides: SeedRide[] = [
    {
      pickup: { lat: 35.1897, lng: 33.3573, address: 'Dereboyu, Lefkoşa' },
      drop: { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' },
      daysAgo: 3,
      rating: 5,
    },
    {
      pickup: { lat: 35.2263, lng: 33.3233, address: 'Yakın Doğu Üniversitesi' },
      drop: { lat: 35.1786, lng: 33.3609, address: 'Girne Kapısı, Lefkoşa' },
      daysAgo: 2,
      rating: 4,
    },
    {
      pickup: { lat: 35.1786, lng: 33.3609, address: 'Girne Kapısı, Lefkoşa' },
      drop: { lat: 35.3417, lng: 33.3223, address: 'Girne Limanı' },
      daysAgo: 1,
      rating: 5,
    },
  ];
  const ids = rides.map((r) => seedCompletedRide(passenger.id, driver.id, r));

  // Sürücü ilk yolculuğun komisyonunu ödemiş olsun — panelde tahsilat örneği görünsün
  const firstCommission = db
    .prepare('SELECT amount FROM ledger WHERE ride_id = ? AND type = ?')
    .get(ids[0], 'commission') as { amount: number };
  db.prepare("INSERT INTO ledger (driver_id, type, amount, note) VALUES (?, 'settlement', ?, ?)").run(
    driver.id,
    firstCommission.amount,
    'Nakit tahsilat (demo)',
  );

  rideInfo = `${ids.length} tamamlanan yolculuk eklendi`;
}

// ---- Sahte yolcular: platform dolu görünsün (yalnızca yeni hesaplara geçmiş eklenir) ----
const FAKE_PASSENGERS: Array<[string, string]> = [
  ['+905550000101', 'Ayşe Kaya'],
  ['+905550000102', 'Mehmet Özkan'],
  ['+905550000103', 'Fatma Demir'],
  ['+905550000104', 'Hasan Yılmaz'],
  ['+905550000105', 'Zeynep Arslan'],
  ['+905550000106', 'Mustafa Çelik'],
  ['+905550000107', 'Elif Şahin'],
  ['+905550000108', 'Ali Koç'],
  ['+905550000109', 'Selin Aydın'],
  ['+905550000110', 'Emre Doğan'],
  ['+905550000111', 'Derya Kurt'],
  ['+905550000112', 'Cem Öztürk'],
];
const PLACES = [
  { lat: 35.1897, lng: 33.3573, address: 'Dereboyu, Lefkoşa' },
  { lat: 35.1547, lng: 33.4961, address: 'Ercan Havalimanı' },
  { lat: 35.1786, lng: 33.3609, address: 'Girne Kapısı, Lefkoşa' },
  { lat: 35.2263, lng: 33.3233, address: 'Yakın Doğu Üniversitesi' },
  { lat: 35.3417, lng: 33.3223, address: 'Girne Limanı' },
  { lat: 35.3253, lng: 33.2861, address: 'Girne Amerikan Üniversitesi' },
  { lat: 35.3057, lng: 33.3553, address: 'Bellapais' },
  { lat: 35.1651, lng: 33.3465, address: 'Lefkoşa Devlet Hastanesi' },
  { lat: 35.1419, lng: 33.9072, address: 'Doğu Akdeniz Üniversitesi' },
  { lat: 35.1246, lng: 33.9414, address: 'Gazimağusa Suriçi' },
];
const driverIds = [driver.id, driver2.id];
let fakeCreated = 0;
let fakeRides = 0;
FAKE_PASSENGERS.forEach(([phone, name], i) => {
  const p = upsertUser(phone, name, 'passenger');
  if (!p.created) return;
  fakeCreated++;
  const rideCount = 1 + (i % 3);
  for (let r = 0; r < rideCount; r++) {
    const pickup = PLACES[(i + r) % PLACES.length]!;
    const drop = PLACES[(i + r + 3) % PLACES.length]!;
    seedCompletedRide(p.id, driverIds[(i + r) % driverIds.length]!, {
      pickup,
      drop,
      daysAgo: 1 + ((i * 3 + r * 5) % 14),
      rating: [5, 4, 5, 5, 3][(i + r) % 5]!,
    });
    fakeRides++;
  }
});

const due = db
  .prepare(
    "SELECT COALESCE(SUM(CASE WHEN type = 'commission' THEN amount ELSE -amount END), 0) AS due FROM ledger WHERE driver_id = ?",
  )
  .get(driver.id) as { due: number };

console.log(`
🚕 Ulak demo verisi hazır (${config.dbPath})

┌──────────────┬────────────────┬────────────┬──────────────────────────────────┐
│ Hesap        │ Telefon        │ Şifre      │ Not                              │
├──────────────┼────────────────┼────────────┼──────────────────────────────────┤
│ Yönetici     │ ${config.adminPhone.padEnd(14)} │ ${config.adminPassword.padEnd(10)} │ tarayıcıda /admin paneli         │
│ Demo Yolcu   │ +905550000001  │ demo123    │ yolculuk geçmişi dolu            │
│ Demo Sürücü  │ +905550000002  │ demo123    │ onaylı · komisyon borcu ${String(Math.round(due.due * 100) / 100).padEnd(7)} TL │
│ Demo Yolcu 2 │ +905550000003  │ demo123    │ temiz hesap (2. telefon)         │
│ Demo Sürücü 2│ +905550000004  │ demo123    │ onaylı · GN 200 · Girne · temiz  │
│ Sahte yolcular│ +9055500001xx │ demo123    │ 01–12 arası 12 hesap, geçmişli   │
└──────────────┴────────────────┴────────────┴──────────────────────────────────┘

Yolculuklar: ${rideInfo}
Sahte yolcular: ${fakeCreated > 0 ? `${fakeCreated} hesap, ${fakeRides} yolculuk eklendi` : 'atlandı (zaten var)'}
Not: Çağrı testi için sürücü hesabıyla uygulamada "çevrimiçi" olman yeterli —
yolcu hesabıyla çağrı açınca teklif sürücünün ekranına düşer.
`);
