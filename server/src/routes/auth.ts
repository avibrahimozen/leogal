import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Db } from '../db.js';
import { requireAuth, signToken, type Role } from '../lib/auth.js';

const phoneSchema = z
  .string()
  .regex(/^\+?[0-9]{10,15}$/, 'Geçerli bir telefon numarası girin (örn. +905428123456)');

const registerSchema = z.object({
  phone: phoneSchema,
  name: z.string().min(2, 'İsim en az 2 karakter olmalı').max(80),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı').max(100),
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

function normalizePhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

export function authRoutes(db: Db): Router {
  const router = Router();

  router.post('/register', (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Geçersiz istek' });
      return;
    }
    const { name, password } = parsed.data;
    const phone = normalizePhone(parsed.data.phone);
    const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (exists) {
      res.status(409).json({ error: 'Bu telefon numarası zaten kayıtlı' });
      return;
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare("INSERT INTO users (phone, name, password_hash, role) VALUES (?, ?, ?, 'passenger')")
      .run(phone, name, hash);
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
    const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (exists) {
      res.status(409).json({ error: 'Bu telefon numarası zaten kayıtlı' });
      return;
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare("INSERT INTO users (phone, name, password_hash, role) VALUES (?, ?, ?, 'driver')")
      .run(phone, name, hash);
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
