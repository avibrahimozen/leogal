import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDb } from '../src/db.js';

// Şema göçleri: eski veritabanına sonradan eklenen sütunlar açılışta uygulanır (idempotent).
const dir = mkdtempSync(join(tmpdir(), 'ulak-db-test-'));
const opened: DatabaseSync[] = [];

afterAll(() => {
  for (const db of opened) db.close();
  rmSync(dir, { recursive: true, force: true });
});

function columns(db: DatabaseSync, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  return rows.map((c) => c.name);
}

describe('veritabanı göçleri', () => {
  it('eski şemaya drivers.cancellations ve users.phone_verified_at eklenir', () => {
    const file = join(dir, 'eski.db');
    const legacy = new DatabaseSync(file);
    legacy.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE drivers (
        user_id INTEGER PRIMARY KEY REFERENCES users(id), license_no TEXT NOT NULL, vehicle_plate TEXT NOT NULL,
        vehicle_model TEXT NOT NULL, city TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        is_online INTEGER NOT NULL DEFAULT 0, lat REAL, lng REAL, location_at TEXT,
        rating_sum INTEGER NOT NULL DEFAULT 0, rating_count INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO users (phone, name, password_hash, role) VALUES ('+905420000009', 'Eski Şoför', 'x', 'driver');
      INSERT INTO drivers (user_id, license_no, vehicle_plate, vehicle_model, city, status)
        VALUES (1, 'L', 'GM 1', 'Model', 'Lefkoşa', 'approved');
    `);
    expect(columns(legacy, 'drivers')).not.toContain('cancellations');
    expect(columns(legacy, 'users')).not.toContain('phone_verified_at');
    legacy.close();

    const db = createDb(file);
    opened.push(db);
    expect(columns(db, 'drivers')).toContain('cancellations');
    expect(columns(db, 'users')).toContain('phone_verified_at');
    const row = db.prepare('SELECT cancellations FROM drivers WHERE user_id = 1').get() as { cancellations: number };
    expect(row.cancellations).toBe(0);

    // Tekrar açmak göçü yeniden uygulamaz
    const again = createDb(file);
    opened.push(again);
    expect(columns(again, 'drivers').filter((c) => c === 'cancellations')).toHaveLength(1);
  });

  it('yeni veritabanı sütunu doğrudan şemadan alır', () => {
    const db = createDb(':memory:');
    opened.push(db);
    expect(columns(db, 'drivers')).toContain('cancellations');
  });
});
