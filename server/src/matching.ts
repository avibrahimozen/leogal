import { config } from './config.js';
import type { Db } from './db.js';
import { nowIso } from './db.js';
import { haversineKm } from './lib/geo.js';
import type { Hub } from './realtime.js';

interface CandidateRow {
  user_id: number;
  lat: number;
  lng: number;
  location_at: string;
}

export interface RideRow {
  id: number;
  passenger_id: number;
  driver_id: number | null;
  status: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  drop_lat: number;
  drop_lng: number;
  drop_address: string;
  est_distance_km: number;
  est_fare: number;
  final_fare: number | null;
  commission: number | null;
  cancel_reason: string | null;
  passenger_rating: number | null;
  driver_rating: number | null;
  requested_at: string;
  accepted_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

/**
 * Eşleştirme servisi: yeni çağrıyı alıcıya en yakın çevrimiçi, onaylı ve
 * boşta olan sürücülere teklif olarak yayınlar. Süresi içinde kabul
 * edilmeyen çağrı otomatik iptal edilir.
 */
export class Matcher {
  /** rideId -> zaman aşımı zamanlayıcısı */
  private timers = new Map<number, NodeJS.Timeout>();
  /** rideId -> teklif gönderilen sürücü id'leri */
  private offered = new Map<number, number[]>();

  constructor(
    private db: Db,
    private hub: Hub,
    private offerTimeoutMs: number = config.rideOfferTimeoutMs,
  ) {}

  /** Alıcıya en yakın uygun sürücüleri bul (yakından uzağa sıralı). */
  findCandidates(pickupLat: number, pickupLng: number): Array<{ driverId: number; distanceKm: number }> {
    const freshAfter = new Date(Date.now() - config.driverLocationTtlMs).toISOString();
    const rows = this.db
      .prepare(
        `SELECT d.user_id, d.lat, d.lng, d.location_at
         FROM drivers d
         WHERE d.status = 'approved' AND d.is_online = 1
           AND d.lat IS NOT NULL AND d.location_at >= ?
           AND NOT EXISTS (
             SELECT 1 FROM rides r
             WHERE r.driver_id = d.user_id
               AND r.status IN ('accepted','arrived','in_progress')
           )`,
      )
      .all(freshAfter) as unknown as CandidateRow[];

    return rows
      .map((r) => ({
        driverId: r.user_id,
        distanceKm: haversineKm(pickupLat, pickupLng, r.lat, r.lng),
      }))
      .filter((c) => c.distanceKm <= config.matchRadiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, config.offerBatchSize);
  }

  /** Çağrıyı uygun sürücülere teklif et. Aday yoksa false döner. */
  broadcast(ride: RideRow): boolean {
    const candidates = this.findCandidates(ride.pickup_lat, ride.pickup_lng);
    if (candidates.length === 0) return false;

    this.offered.set(
      ride.id,
      candidates.map((c) => c.driverId),
    );
    for (const c of candidates) {
      this.hub.emitToUser(c.driverId, 'ride:offer', {
        rideId: ride.id,
        pickup: { lat: ride.pickup_lat, lng: ride.pickup_lng, address: ride.pickup_address },
        drop: { lat: ride.drop_lat, lng: ride.drop_lng, address: ride.drop_address },
        estDistanceKm: ride.est_distance_km,
        estFare: ride.est_fare,
        pickupDistanceKm: Math.round(c.distanceKm * 10) / 10,
      });
    }

    const timer = setTimeout(() => this.expire(ride.id), this.offerTimeoutMs);
    timer.unref?.();
    this.timers.set(ride.id, timer);
    return true;
  }

  /** Çağrı kabul edildi/iptal oldu: zamanlayıcıyı durdur, diğer sürücülere haber ver. */
  settle(rideId: number, acceptedBy?: number): void {
    const timer = this.timers.get(rideId);
    if (timer) clearTimeout(timer);
    this.timers.delete(rideId);
    const offeredTo = this.offered.get(rideId) ?? [];
    this.offered.delete(rideId);
    for (const driverId of offeredTo) {
      if (driverId !== acceptedBy) {
        this.hub.emitToUser(driverId, 'ride:offer_closed', { rideId });
      }
    }
  }

  /** Zaman aşımı: hâlâ bekleyen çağrıyı 'sürücü bulunamadı' ile iptal et. */
  private expire(rideId: number): void {
    const changed = this.db
      .prepare(
        "UPDATE rides SET status = 'cancelled', cancel_reason = 'no_driver', cancelled_at = ? WHERE id = ? AND status = 'requested'",
      )
      .run(nowIso(), rideId).changes;
    if (changed === 1) {
      const ride = this.db.prepare('SELECT passenger_id FROM rides WHERE id = ?').get(rideId) as {
        passenger_id: number;
      };
      this.hub.emitToUser(ride.passenger_id, 'ride:update', {
        rideId,
        status: 'cancelled',
        cancelReason: 'no_driver',
      });
    }
    this.settle(rideId);
  }

  close(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.offered.clear();
  }
}
