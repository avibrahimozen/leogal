/**
 * Sahte taksi simülatörü.
 *
 * Gerçek sürücü hesaplarıyla sunucuya bağlanan botlar: çevrimiçi olur, haritada
 * dolaşır, gelen çağrıyı kabul eder, alış noktasına sürer, yolculuğu tamamlar ve
 * yolcuyu puanlar. Tek telefonla tam yolcu akışını denemek için.
 *
 * Kullanım:  npm run bots              (sunucu açıkken, ayrı bir terminalde)
 * Ortam:     ULAK_API_URL=http://localhost:4000   ULAK_BOTS=6
 *            ULAK_BOT_SPEED_KMH=90                ULAK_BOT_CENTER=35.19,33.36 (opsiyonel)
 *
 * Botlar, uygulamada "yakındaki taksiler" sorgusu yapan yolcunun konumunu (talep
 * ipucu) izler ve boştaysa onun çevresine taşınır — KKTC dışından test ederken de
 * eşleşme olur. ULAK_BOT_CENTER verilirse sabit kalırlar.
 */
import bcrypt from 'bcryptjs';
import { io, type Socket } from 'socket.io-client';
import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { haversineKm } from '../src/lib/geo.js';

const API = process.env.ULAK_API_URL ?? `http://localhost:${config.port}`;
const BOT_COUNT = Math.min(20, Math.max(1, Number(process.env.ULAK_BOTS ?? 6)));
const SPEED_KMH = Math.max(5, Number(process.env.ULAK_BOT_SPEED_KMH ?? 90));
const TICK_MS = 1000;
const BOT_PASSWORD = 'demo123';
const FIXED_CENTER = parseCenter(process.env.ULAK_BOT_CENTER);

type LatLng = { lat: number; lng: number };
type Place = LatLng & { address: string };

const CITIES: Array<LatLng & { name: string }> = [
  { name: 'Lefkoşa', lat: 35.1856, lng: 33.3823 },
  { name: 'Girne', lat: 35.3364, lng: 33.3182 },
  { name: 'Gazimağusa', lat: 35.125, lng: 33.95 },
  { name: 'Güzelyurt', lat: 35.1988, lng: 32.9917 },
  { name: 'İskele', lat: 35.2825, lng: 33.9106 },
  { name: 'Lefke', lat: 35.1178, lng: 32.8517 },
];
const MODELS = ['Toyota Corolla', 'Honda Civic', 'Hyundai Elantra', 'Skoda Octavia', 'Renault Megane', 'Fiat Egea'];

function parseCenter(raw: string | undefined): LatLng | null {
  if (!raw) return null;
  const [lat, lng] = raw.split(',').map((s) => Number(s.trim()));
  return lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

function randomAround(center: LatLng, minKm: number, maxKm: number): LatLng {
  const d = minKm + Math.random() * (maxKm - minKm);
  const a = Math.random() * Math.PI * 2;
  return {
    lat: center.lat + (d / 111) * Math.cos(a),
    lng: center.lng + (d / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(a),
  };
}

function stepToward(pos: LatLng, target: LatLng, stepKm: number): { pos: LatLng; arrived: boolean } {
  const dist = haversineKm(pos.lat, pos.lng, target.lat, target.lng);
  if (dist <= stepKm) return { pos: target, arrived: true };
  const f = stepKm / dist;
  return {
    pos: { lat: pos.lat + (target.lat - pos.lat) * f, lng: pos.lng + (target.lng - pos.lng) * f },
    arrived: false,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function log(msg: string): void {
  console.log(`${new Date().toLocaleTimeString('tr-TR')}  ${msg}`);
}

async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

interface BotSpec {
  phone: string;
  name: string;
  plate: string;
  model: string;
  city: string;
  home: LatLng;
}

/** Bot sürücü hesaplarını veritabanında hazırlar (idempotent, onaylı). */
function ensureAccounts(): BotSpec[] {
  const db = createDb();
  const hash = bcrypt.hashSync(BOT_PASSWORD, 10);
  const specs: BotSpec[] = [];
  for (let i = 0; i < BOT_COUNT; i++) {
    const city = CITIES[i % CITIES.length]!;
    const spec: BotSpec = {
      phone: `+9055500002${String(i + 1).padStart(2, '0')}`,
      name: `Taksi Bot ${i + 1}`,
      plate: `TB ${101 + i}`,
      model: MODELS[i % MODELS.length]!,
      city: city.name,
      home: FIXED_CENTER ? randomAround(FIXED_CENTER, 0.3, 2) : randomAround(city, 0.2, 2),
    };
    let user = db.prepare('SELECT id FROM users WHERE phone = ?').get(spec.phone) as { id: number } | undefined;
    if (!user) {
      const r = db
        .prepare(
          "INSERT INTO users (phone, name, password_hash, role, phone_verified_at) VALUES (?, ?, ?, 'driver', ?)",
        )
        .run(spec.phone, spec.name, hash, new Date().toISOString());
      user = { id: Number(r.lastInsertRowid) };
    }
    const driver = db.prepare('SELECT user_id FROM drivers WHERE user_id = ?').get(user.id);
    if (!driver) {
      db.prepare(
        "INSERT INTO drivers (user_id, license_no, vehicle_plate, vehicle_model, city, status) VALUES (?, ?, ?, ?, ?, 'approved')",
      ).run(user.id, `BOT-${spec.plate.replace(' ', '')}`, spec.plate, spec.model, spec.city);
    } else {
      db.prepare("UPDATE drivers SET status = 'approved' WHERE user_id = ?").run(user.id);
    }
    specs.push(spec);
  }
  db.close();
  return specs;
}

interface Offer {
  rideId: number;
  pickup: Place;
  drop: Place;
  estFare: number;
  pickupDistanceKm: number;
}

type State = 'idle' | 'to_pickup' | 'waiting' | 'to_drop';

class Bot {
  state: State = 'idle';
  pos: LatLng;
  target: LatLng;
  private token = '';
  private socket: Socket | null = null;
  private ride: { id: number; pickup: Place; drop: Place; fare: number } | null = null;
  private consideringOffer = false;

  constructor(readonly spec: BotSpec) {
    this.pos = spec.home;
    this.target = randomAround(spec.home, 0.3, 1.5);
  }

  get label(): string {
    return `${this.spec.plate} · ${this.spec.name}`;
  }

  async start(): Promise<void> {
    const login = await api<{ token: string }>('POST', '/auth/login', {
      phone: this.spec.phone,
      password: BOT_PASSWORD,
    });
    if (!login.ok) throw new Error(`${this.label} giriş yapamadı`);
    this.token = login.data.token;
    this.socket = io(API, { auth: { token: this.token }, transports: ['websocket'] });
    this.socket.on('ride:offer', (offer: Offer) => void this.onOffer(offer));
    this.socket.on('ride:update', (p: { rideId: number; status: string }) => this.onUpdate(p));
    this.socket.on('connect', () => this.emitLocation());
    await api('POST', '/driver/status', { online: true }, this.token);
    this.emitLocation();
    log(`🟢 ${this.label} çevrimiçi — ${this.spec.city} çevresinde dolaşıyor`);
  }

  emitLocation(): void {
    this.socket?.emit('driver:location', { lat: this.pos.lat, lng: this.pos.lng });
  }

  private async onOffer(offer: Offer): Promise<void> {
    if (this.state !== 'idle' || this.consideringOffer) return;
    this.consideringOffer = true;
    const delayMs = 1500 + Math.random() * 3000;
    log(
      `📨 ${this.label} teklif aldı: çağrı #${offer.rideId} · yolcuya ${offer.pickupDistanceKm} km · ${offer.estFare} TL — ${Math.round(delayMs / 1000)} sn sonra kabul edecek`,
    );
    await sleep(delayMs);
    if (this.state !== 'idle') {
      this.consideringOffer = false;
      return;
    }
    const res = await api('POST', `/rides/${offer.rideId}/accept`, undefined, this.token);
    this.consideringOffer = false;
    if (!res.ok) {
      log(`↩️  ${this.label}: çağrı #${offer.rideId} başka taksiye gitti`);
      return;
    }
    this.ride = { id: offer.rideId, pickup: offer.pickup, drop: offer.drop, fare: offer.estFare };
    this.state = 'to_pickup';
    this.target = offer.pickup;
    log(`✅ ${this.label} çağrı #${offer.rideId}'yi kabul etti → ${offer.pickup.address} adresine gidiyor`);
  }

  private onUpdate(p: { rideId: number; status: string }): void {
    if (!this.ride || p.rideId !== this.ride.id) return;
    if (p.status === 'cancelled') {
      log(`❌ ${this.label}: çağrı #${p.rideId} iptal edildi, boşa döndü`);
      this.reset();
    }
  }

  private reset(): void {
    this.ride = null;
    this.state = 'idle';
    this.target = randomAround(this.pos, 0.3, 1.5);
  }

  private async startRide(): Promise<void> {
    if (!this.ride || this.state !== 'waiting') return;
    await api('POST', `/rides/${this.ride.id}/start`, undefined, this.token);
    this.state = 'to_drop';
    this.target = this.ride.drop;
    log(`▶️  ${this.label} yolculuğu başlattı → ${this.ride.drop.address}`);
  }

  async tick(): Promise<void> {
    const stepKm = (SPEED_KMH / 3600) * (TICK_MS / 1000);
    switch (this.state) {
      case 'idle': {
        const r = stepToward(this.pos, this.target, stepKm * 0.4);
        this.pos = r.pos;
        if (r.arrived) this.target = randomAround(this.pos, 0.3, 1.5);
        break;
      }
      case 'to_pickup': {
        const r = stepToward(this.pos, this.target, stepKm);
        this.pos = r.pos;
        if (r.arrived && this.ride) {
          this.state = 'waiting';
          await api('POST', `/rides/${this.ride.id}/arrived`, undefined, this.token);
          log(`📍 ${this.label} alış noktasına vardı, yolcuyu bekliyor`);
          setTimeout(() => void this.startRide(), 4000);
        }
        break;
      }
      case 'waiting':
        break;
      case 'to_drop': {
        const r = stepToward(this.pos, this.target, stepKm);
        this.pos = r.pos;
        if (r.arrived && this.ride) {
          const { id, fare } = this.ride;
          this.state = 'waiting';
          const done = await api<{ ride?: { finalFare: number } }>('POST', `/rides/${id}/complete`, undefined, this.token);
          await api('POST', `/rides/${id}/rate`, { rating: 5 }, this.token);
          log(`🏁 ${this.label} çağrı #${id} tamamlandı — ${done.data.ride?.finalFare ?? fare} TL · yolcuya ⭐ 5`);
          this.reset();
        }
        break;
      }
    }
    this.emitLocation();
  }

  async stop(): Promise<void> {
    await api('POST', '/driver/status', { online: false }, this.token).catch(() => {});
    this.socket?.disconnect();
  }
}

/** Boştaki botları, uygulamada haritaya bakan yolcunun çevresine taşır. */
async function followDemand(bots: Bot[], adminToken: string): Promise<void> {
  const res = await api<{ hint: { lat: number; lng: number; at: string } | null }>(
    'GET',
    '/admin/demand-hint',
    undefined,
    adminToken,
  );
  const hint = res.data.hint;
  if (!hint || Date.now() - Date.parse(hint.at) > 120_000) return;
  let moved = 0;
  for (const bot of bots) {
    if (bot.state !== 'idle') continue;
    if (haversineKm(bot.pos.lat, bot.pos.lng, hint.lat, hint.lng) > 8) {
      bot.pos = randomAround(hint, 0.4, 2.5);
      bot.target = randomAround(hint, 0.3, 1.5);
      bot.emitLocation();
      moved++;
    }
  }
  if (moved > 0) {
    log(`📡 Talep algılandı (${hint.lat.toFixed(4)}, ${hint.lng.toFixed(4)}): ${moved} boş taksi yolcunun çevresine taşındı`);
  }
}

// ---- Başlat ----
const health = await api('GET', '/health').catch(() => null);
if (!health?.ok) {
  console.error(`❌ Sunucuya ulaşılamadı: ${API} — önce "npm run dev" ile sunucuyu başlat.`);
  process.exit(1);
}

const specs = ensureAccounts();
const bots = specs.map((s) => new Bot(s));
console.log(`🚕 ${bots.length} sahte taksi hazırlanıyor (${API}, hız ${SPEED_KMH} km/sa)${FIXED_CENTER ? ' — sabit merkez' : ' — yolcuyu takip eder'}\n`);
for (const bot of bots) {
  await bot.start();
}

const admin = await api<{ token: string }>('POST', '/auth/login', {
  phone: config.adminPhone,
  password: config.adminPassword,
});
if (!admin.ok) log('⚠️  Yönetici girişi başarısız: botlar yolcuyu takip edemeyecek, sabit kalacaklar');

let ticking = false;
setInterval(() => {
  if (ticking) return;
  ticking = true;
  Promise.all(bots.map((b) => b.tick().catch((e) => log(`⚠️  ${b.label}: ${e instanceof Error ? e.message : e}`))))
    .finally(() => {
      ticking = false;
    });
}, TICK_MS);

if (!FIXED_CENTER && admin.ok) {
  setInterval(() => void followDemand(bots, admin.data.token).catch(() => {}), 8000);
}

console.log('\nBotlar çalışıyor. Uygulamada yolcu olarak taksi çağır; Ctrl+C ile durdur.\n');

process.on('SIGINT', async () => {
  console.log('\n⏹  Botlar çevrimdışına alınıyor...');
  await Promise.all(bots.map((b) => b.stop()));
  process.exit(0);
});
