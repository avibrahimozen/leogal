import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

export type Role = 'passenger' | 'driver' | 'admin';

const ROLES: readonly string[] = ['passenger', 'driver', 'admin'];

export interface AuthUser {
  id: number;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Oturum token'ını çözer. Algoritma HS256'ya sabitlenir; `sub` pozitif tam sayı ve
 * `role` bilinen rollerden biri olmalıdır — böylece amaç dışı token'lar
 * (örn. telefon doğrulama token'ı: sub=telefon, role yok) oturum yerine geçemez.
 */
export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || !/^[1-9][0-9]*$/.test(payload.sub)) return null;
    if (typeof payload.role !== 'string' || !ROLES.includes(payload.role)) return null;
    return { id: Number(payload.sub), role: payload.role as Role };
  } catch {
    return null;
  }
}

export function requireAuth(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const user = token ? verifyToken(token) : null;
    if (!user) {
      res.status(401).json({ error: 'Oturum gerekli' });
      return;
    }
    if (roles.length > 0 && !roles.includes(user.role)) {
      res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
      return;
    }
    req.user = user;
    next();
  };
}
