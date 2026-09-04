import { DatabaseSync } from 'node:sqlite';
import { config, defaultCountrySettings, defaultSettings, type SettingKey } from './config.js';
import type { CountryCode } from './lib/regions.js';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('passenger','driver','admin')),
  phone_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- SMS doğrulama kodları (telefon başına tek aktif kod)
CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  send_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  last_sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  license_no TEXT NOT NULL,
  vehicle_plate TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  city TEXT NOT NULL,
  -- Sürücünün çalıştığı ülke (KKTC | TR); şehir bu ülkenin listesinden seçilir
  country TEXT NOT NULL DEFAULT 'KKTC',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  is_online INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  location_at TEXT,
  rating_sum INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  -- Sürücünün kabul ettikten sonra vazgeçtiği çağrı sayısı
  cancellations INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  passenger_id INTEGER NOT NULL REFERENCES users(id),
  driver_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','accepted','arrived','in_progress','completed','cancelled')),
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  pickup_address TEXT NOT NULL,
  drop_lat REAL NOT NULL,
  drop_lng REAL NOT NULL,
  drop_address TEXT NOT NULL,
  est_distance_km REAL NOT NULL,
  est_fare REAL NOT NULL,
  -- Alış noktasına göre uygulanan tarife ülkesi (KKTC | TR); eski kayıtlarda NULL
  country TEXT,
  final_fare REAL,
  commission REAL,
  stops TEXT,
  cancel_reason TEXT,
  passenger_rating INTEGER,
  driver_rating INTEGER,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  accepted_at TEXT,
  arrived_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_rides_passenger ON rides(passenger_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);

-- Komisyon defteri: 'commission' sürücünün platforma borcunu artırır,
-- 'settlement' sürücünün yaptığı ödemeyle borcu düşürür.
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL REFERENCES users(id),
  ride_id INTEGER REFERENCES rides(id),
  type TEXT NOT NULL CHECK (type IN ('commission','settlement')),
  amount REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_driver ON ledger(driver_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function createDb(path: string = config.dbPath): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }
  // Ülkeye özel varsayılanlar yalnızca ilk açılışta yazılır: yönetici sonradan
  // bir ülkenin özel tarifesini kaldırırsa yeniden açılışta geri gelmemeli.
  for (const [country, values] of Object.entries(defaultCountrySettings)) {
    const marker = `seeded:${country}`;
    if (hasSetting(db, marker)) continue;
    for (const [key, value] of Object.entries(values ?? {})) {
      insertSetting.run(scopedKey(key as SettingKey, country as CountryCode), value);
    }
    insertSetting.run(marker, new Date().toISOString());
  }
  return db;
}

/** Eski veritabanlarına sonradan eklenen sütunları uygular. */
function migrate(db: Db): void {
  addColumnIfMissing(db, 'users', 'phone_verified_at', 'TEXT');
  addColumnIfMissing(db, 'drivers', 'country', "TEXT NOT NULL DEFAULT 'KKTC'");
  addColumnIfMissing(db, 'rides', 'country', 'TEXT');
  addColumnIfMissing(db, 'drivers', 'cancellations', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'rides', 'stops', 'TEXT');
}

function addColumnIfMissing(db: Db, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Ülkeye özel ayar anahtarı: `TR:per_km`. Ülke verilmezse genel anahtar. */
export function scopedKey(key: SettingKey, country?: CountryCode | null): string {
  return country ? `${country}:${key}` : key;
}

export function hasSetting(db: Db, key: string): boolean {
  return db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key) !== undefined;
}

/**
 * Ayar değerini okur. Ülke verilirse önce `${ülke}:${anahtar}` aranır,
 * yoksa genel anahtara, o da yoksa koddaki varsayılana düşülür.
 */
export function getSetting(db: Db, key: SettingKey, country?: CountryCode | null): number {
  const select = db.prepare('SELECT value FROM settings WHERE key = ?');
  if (country) {
    const scoped = select.get(scopedKey(key, country)) as { value: string } | undefined;
    if (scoped) return Number(scoped.value);
  }
  const row = select.get(key) as { value: string } | undefined;
  return Number(row?.value ?? defaultSettings[key]);
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function deleteSetting(db: Db, key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function nowIso(): string {
  return new Date().toISOString();
}
