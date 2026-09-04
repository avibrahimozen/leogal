import path from 'node:path';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
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
import { publicRoutes } from './routes/public.js';
import { rideRoutes } from './routes/rides.js';

export interface AppContext {
  app: Express;
  hub: Hub;
  matcher: Matcher;
}

export interface AppOptions {
  /** Teklif zaman aşımı (ms); testlerde kısaltılır. */
  offerTimeoutMs?: number;
  smsSender?: SmsSender;
  /** Yalnızca testler için: 404 ve hata yakalayıcıdan önce ek rotalar bağlar. */
  testRoutes?: (app: Express) => void;
}

/** Express uygulamasını kurar. Test ve prod aynı yolu kullanır. */
export function createApp(db: Db, options: AppOptions = {}): AppContext {
  ensureAdmin(db);

  const hub = new Hub(db);
  const matcher = new Matcher(db, hub, options.offerTimeoutMs);
  const otp = new OtpService(db, options.smsSender ?? createSmsSender());

  // Önceki çalışmadan kalan bekleyen çağrıların zaman aşımını yeniden kur
  const resumed = matcher.resume();
  if (resumed > 0) console.log(`⏱ ${resumed} bekleyen çağrının zaman aşımı yeniden kuruldu`);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ulak', time: new Date().toISOString() });
  });

  app.use('/api/public', publicRoutes(db));
  app.use('/api/auth', authRoutes(db, otp));
  app.use('/api/rides', rideRoutes(db, hub, matcher));
  app.use('/api/driver', driverRoutes(db, hub));
  app.use('/api/admin', adminRoutes(db, hub));

  // Yönetim paneli: /admin altında statik olarak sunulur (giriş panel içinde yapılır)
  app.use('/admin', express.static(path.join(import.meta.dirname, '..', 'public', 'admin')));

  options.testRoutes?.(app);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Bulunamadı' });
  });

  app.use(errorHandler);

  return { app, hub, matcher };
}

/**
 * Hata yakalayıcı: bozuk JSON gövdesi 400, gövde boyutu aşımı gibi diğer istemci
 * hataları kendi koduyla, beklenmeyen hatalar loglanıp 500 olarak döner.
 * (Express hata yakalayıcıyı 4 parametresinden tanır; imza değiştirilmemeli.)
 */
function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const e = (err ?? {}) as { type?: unknown; status?: unknown };
  if (e.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Geçersiz JSON' });
    return;
  }
  if (typeof e.status === 'number' && e.status >= 400 && e.status < 500) {
    res.status(e.status).json({ error: e.status === 413 ? 'İstek gövdesi çok büyük' : 'Geçersiz istek' });
    return;
  }
  console.error('İşlenmeyen hata:', err);
  res.status(500).json({ error: 'Sunucu hatası' });
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
