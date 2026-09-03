import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.js';
import type { Db } from '../db.js';
import { requireAuth, signToken, type Role } from '../lib/auth.js';
import { OtpError, verifyPhoneToken, type OtpService } from '../otp.js';

const phoneSchema = z
  .string()
  .min(7, 'Geçerli bir telefon numarası girin (örn. 05428123456)')
  .max(25)
  .transform(normalizePhone)
  .refine((p) => /^\+[0-9]{10,15}$/.test(p), 'Geçerli bir telefon numarası girin (örn. 05428123456)');

const registerSchema = z.object({
  phone: phoneSchema,
  name: z.string().min(2, 'İsim en az 2 karakter olmalı').max(80),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı').max(100),
  verificationToken: z.string().optional(),
});

const otpRequestSchema = z.object({ phone: phoneSchema });
const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^[0-9]{6}$/, 'Kod 6 haneli olmalı'),
});

const driverRegisterSchema = registerSchema.extend({
  licenseNo: z.string().min(3, 'Ehliyet/ruhsat numarası gerekli').max(40),
  vehiclePlate: z.string().min(3, 'Araç plakası gerekli').max(16),
  vehicleModel: z.string().min(2, 'Araç modeli gerekli').max(60),
  city: z.enum(['Lefkoşa', 'Girne', 'Gazimağusa', 'Güzelyurt', 'İskele', 'Lefke']),
});

const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

interface UserRow {
  id: number;
  phone: string;
  name: string;
  password_hash: string;
  role: Role;
}

export interface DriverRow {
  user_id: number;
  license_no: string;
  vehicle_plate: string;
  vehicle_model: string;
  city: string;
  status: string;
  is_online: number;
  rating_sum: number;
  rating_count: number;
}

export function publicUser(user: UserRow, driver?: DriverRow | null) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role,
    driver: driver
      ? {
          licenseNo: driver.license_no,
          vehiclePlate: driver.vehicle_plate,
          vehicleModel: driver.vehicle_model,
          city: driver.city,
          status: driver.status,
          isOnline: driver.is_online === 1,
          rating: driver.rating_count > 0 ? Math.round((driver.rating_sum / driver.rating_count) * 10) / 10 : null,
        }
      : undefined,
  };
}

export function getDriverRow(db: Db, userId: number): DriverRow | null {
  return (db.prepare('SELECT * FROM drivers WHERE user_id = ?').get(userId) as unknown as DriverRow) ?? null;
}

/**
 * Telefonu E.164 biçimine getirir. Kabul edilen girdiler:
 *   +905428123456 · 905428123456 · 05428123456 · 5428123456 · 0090 542 812 34 56
 * Boşluk, tire ve parantezler yok sayılır; ülke kodu yoksa +90 (Türkiye/KKTC) varsayılır.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('5')) return `+90${digits}`;
  return `+${digits}`;
}

export function authRoutes(db: Db, otp: OtpService): Router {
  const router = Router();

  /** Kayıt öncesi telefon doğrulaması: SMS kodu iste. */
  router.post('/otp/request', async (req, res) => {
    const parsed = otpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Geçersiz istek' });
      return;
    }
    try {
      const result = await otp.request(normalizePhone(parsed.data.phone));
      res.json(result);
    } catch (e) {
      if (e instanceof OtpError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      console.error('SMS gönderim hatası:', e);
      res.status(502).json({ error: 'SMS gönderilemedi. Lütfen tekrar deneyin' });
    }
  });

  /** SMS kodunu doğrula; kayıtta kullanılacak doğrulama token'ı döner. */
  router.post('/otp/verify', (req, res) => {
    const parsed = otpVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Geçersiz istek' });
      return;
    }
    try {
      const verificationToken = otp.verify(normalizePhone(parsed.data.phone), parsed.data.code);
      res.json({ verificationToken });
    } catch (e) {
      if (e instanceof OtpError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  });

  /** Kayıt isteğindeki doğrulama token'ının bu telefona ait olduğunu denetler. */
  function checkPhoneVerification(phone: string, verificationToken: string | undefined): string | null {
    if (!config.otpRequired) return null;
    const verifiedPhone = verificationToken ? verifyPhoneToken(verificationToken) : null;
    if (verifiedPhone !== phone) {
      return 'Telefon doğrulaması gerekli. Önce SMS ile gelen kodu doğrulayın';
    }
    return null;
  }

  router.post('/register', (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Geçersiz istek' });
      return;
    }
    const { name, password } = parsed.data;
    const phone = normalizePhone(parsed.data.phone);
    const verificationError = checkPhoneVerification(phone, parsed.data.verificationToken);
    if (verificationError) {
      res.status(403).json({ error: verificationError });
      return;
    }
    const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (exists) {
      res.status(409).json({ error: 'Bu telefon numarası zaten kayıtlı' });
      return;
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare(
        "INSERT INTO users (phone, name, password_hash, role, phone_verified_at) VALUES (?, ?, ?, 'passenger', ?)",
      )
      .run(phone, name, hash, config.otpRequired ? new Date().toISOString() : null);
    const user: UserRow = { id: Number(result.lastInsertRowid), phone, name, password_hash: hash, role: 'passenger' };
    res.status(201).json({ token: signToken({ id: user.id, role: 'passenger' }), user: publicUser(user) });
  });

  router.post('/register-driver', (req, res) => {
    const parsed = driverRegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Geçersiz istek' });
      return;
    }
    const { name, password, licenseNo, vehiclePlate, vehicleModel, city } = parsed.data;
    const phone = normalizePhone(parsed.data.phone);
    const verificationError = checkPhoneVerification(phone, parsed.data.verificationToken);
    if (verificationError) {
      res.status(403).json({ error: verificationError });
      return;
    }
    const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (exists) {
      res.status(409).json({ error: 'Bu telefon numarası zaten kayıtlı' });
      return;
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare(
        "INSERT INTO users (phone, name, password_hash, role, phone_verified_at) VALUES (?, ?, ?, 'driver', ?)",
      )
      .run(phone, name, hash, config.otpRequired ? new Date().toISOString() : null);
    const userId = Number(result.lastInsertRowid);
    db.prepare(
      'INSERT INTO drivers (user_id, license_no, vehicle_plate, vehicle_model, city) VALUES (?, ?, ?, ?, ?)',
    ).run(userId, licenseNo, vehiclePlate.toUpperCase(), vehicleModel, city);
    const user: UserRow = { id: userId, phone, name, password_hash: hash, role: 'driver' };
    res.status(201).json({
      token: signToken({ id: userId, role: 'driver' }),
      user: publicUser(user, getDriverRow(db, userId)),
    });
  });

  router.post('/login', (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Telefon ve şifre gerekli' });
      return;
    }
    const phone = normalizePhone(parsed.data.phone);
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as unknown as UserRow | undefined;
    if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
      res.status(401).json({ error: 'Telefon numarası veya şifre hatalı' });
      return;
    }
    res.json({
      token: signToken({ id: user.id, role: user.role }),
      user: publicUser(user, user.role === 'driver' ? getDriverRow(db, user.id) : undefined),
    });
  });

  router.get('/me', requireAuth(), (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as unknown as UserRow | undefined;
    if (!user) {
      res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      return;
    }
    res.json({ user: publicUser(user, user.role === 'driver' ? getDriverRow(db, user.id) : undefined) });
  });

  return router;
}
