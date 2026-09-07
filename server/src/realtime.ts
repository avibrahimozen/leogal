import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { verifyToken, type AuthUser } from './lib/auth.js';
import type { Db } from './db.js';
import { nowIso } from './db.js';

/** Sonlu sayı ve verilen aralıkta mı? (socket yükü doğrulanmadan gelir) */
function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Gerçek zamanlı katman. Her kullanıcı kimliği doğrulanmış tek bir
 * `user:{id}` odasına katılır; sunucu olayları bu odalara yayınlar.
 *
 * Olaylar (sunucu -> istemci):
 *  - ride:offer          sürücüye yeni çağrı teklifi
 *  - ride:offer_closed   teklif başka sürücüye gitti / iptal oldu
 *  - ride:update         çağrı durum değişikliği (yolcu + sürücü)
 *  - driver:location     aktif çağrıdaki sürücü konumu (yolcuya)
 *  - driver:status       sürücü hesap/çevrimiçi durumu değişti (uygulama /me'yi tazeler)
 *
 * Olaylar (istemci -> sunucu):
 *  - driver:location     { lat, lng } sürücü konum güncellemesi
 */
export class Hub {
  private io: SocketServer | null = null;

  constructor(private db: Db) {}

  attach(httpServer: HttpServer): void {
    this.io = new SocketServer(httpServer, { cors: { origin: '*' } });

    this.io.use((socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      const user = token ? verifyToken(token) : null;
      if (!user) return next(new Error('Oturum gerekli'));
      (socket.data as { user: AuthUser }).user = user;
      next();
    });

    this.io.on('connection', (socket: Socket) => {
      const user = (socket.data as { user: AuthUser }).user;
      socket.join(`user:${user.id}`);

      socket.on('driver:location', (payload: { lat?: unknown; lng?: unknown; heading?: unknown } | undefined) => {
        if (user.role !== 'driver') return;
        const lat = payload?.lat;
        const lng = payload?.lng;
        // REST yolundaki zod şemasıyla aynı sınırlar: NaN, sonsuz ve aralık dışı değerler yok sayılır
        if (!inRange(lat, -90, 90) || !inRange(lng, -180, 180)) return;
        const heading = inRange(payload?.heading, 0, 360) ? payload.heading : null;
        this.updateDriverLocation(user.id, lat, lng, heading);
      });
    });
  }

  /** Sürücü konumunu kaydeder ve aktif çağrısı varsa yolcuya iletir. */
  updateDriverLocation(driverId: number, lat: number, lng: number, heading: number | null = null): void {
    this.db
      .prepare('UPDATE drivers SET lat = ?, lng = ?, heading = COALESCE(?, heading), location_at = ? WHERE user_id = ?')
      .run(lat, lng, heading, nowIso(), driverId);
    const active = this.db
      .prepare(
        "SELECT id, passenger_id FROM rides WHERE driver_id = ? AND status IN ('accepted','arrived','in_progress')",
      )
      .get(driverId) as { id: number; passenger_id: number } | undefined;
    if (active) {
      this.emitToUser(active.passenger_id, 'driver:location', {
        rideId: active.id,
        lat,
        lng,
        heading,
      });
    }
  }

  emitToUser(userId: number, event: string, payload: unknown): void {
    this.io?.to(`user:${userId}`).emit(event, payload);
  }

  close(): void {
    this.io?.close();
  }
}
