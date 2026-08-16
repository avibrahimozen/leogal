import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import type { Db } from './db.js';
import { createSmsSender, type SmsSender } from './lib/sms.js';
import { Matcher } from './matching.js';
import { OtpService } from './otp.js';
import { Hub } from './realtime.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { driverRoutes } from './routes/driver.js';
import { rideRoutes } from './routes/rides.js';

export interface AppContext {
  app: Express;
  hub: Hub;
  matcher: Matcher;
}

/** Express uygulamasını kurar. Test ve prod aynı yolu kullanır. */
export function createApp(
  db: Db,
  options: { offerTimeoutMs?: number; smsSender?: SmsSender } = {},
): AppContext {
  ensureAdmin(db);

  const hub = new Hub(db);
  const matcher = new Matcher(db, hub, options.offerTimeoutMs);
  const otp = new OtpService(db, options.smsSender ?? createSmsSender());

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ulak', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes(db, otp));
  app.use('/api/rides', rideRoutes(db, hub, matcher));
  app.use('/api/driver', driverRoutes(db, hub));
  app.use('/api/admin', adminRoutes(db, hub));

  // Yönetim paneli: /admin altında statik olarak sunulur (giriş panel içinde yapılır)
  app.use('/admin', express.static(path.join(import.meta.dirname, '..', 'public', 'admin')));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Bulunamadı' });
  });

  return { app, hub, matcher };
}

/** İlk açılışta yönetici hesabını oluşturur. */
function ensureAdmin(db: Db): void {
  const exists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (exists) return;
  const hash = bcrypt.hashSync(config.adminPassword, 10);
  db.prepare("INSERT INTO users (phone, name, password_hash, role) VALUES (?, 'Ulak Yönetici', ?, 'admin')").run(
    config.adminPhone,
    hash,
  );
}
