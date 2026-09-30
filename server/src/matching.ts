import { config } from './config.js';
import type { Db } from './db.js';
import { nowIso } from './db.js';
import { haversineKm } from './lib/geo.js';
import { candidateScore } from './lib/ranking.js';
import { getRide, parseStops, passengerRatingOf, rideToJson, type RideRow } from './lib/rides.js';
import type { Hub } from './realtime.js';

// Geriye dönük uyumluluk: RideRow artık lib/rides.ts içinde tanımlı
export type { RideRow } from './lib/rides.js';

interface CandidateRow {
  user_id: number;
  lat: number;
  lng: number;
  location_at: string;
  rating_sum: number;
  rating_count: number;
}

export interface Candidate {
  driverId: number;
  distanceKm: number;
  /** Mesafe + puan cezası (km); küçük olan önce teklif alır — bkz. lib/ranking.ts */
  score: number;
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

  /**
   * Alıcıya en uygun sürücüleri bul: yarıçap içindeki adaylar mesafe + puan cezasına göre
   * sıralanır (yüksek puanlı sürücü aynı mesafede öne geçer, düşük puanlı geriye düşer).
   * `exclude` listesindeki sürücüler (örn. çağrıyı az önce iptal eden) atlanır.
   */
  findCandidates(pickupLat: number, pickupLng: number, exclude: readonly number[] = []): Candidate[] {
    const freshAfter = new Date(Date.now() - config.driverLocationTtlMs).toISOString();
    const rows = this.db
      .prepare(
        `SELECT d.user_id, d.lat, d.lng, d.location_at, d.rating_sum, d.rating_count
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
      .filter((r) => !exclude.includes(r.user_id))
      .map((r) => {
        const distanceKm = haversineKm(pickupLat, pickupLng, r.lat, r.lng);
        return {
          driverId: r.user_id,
          distanceKm,
          score: candidateScore(distanceKm, { ratingSum: r.rating_sum, ratingCount: r.rating_count }),
        };
      })
      .filter((c) => c.distanceKm <= config.matchRadiusKm)
      .sort((a, b) => a.score - b.score || a.distanceKm - b.distanceKm)
      .slice(0, config.offerBatchSize);
  }

  /** Çağrıyı uygun sürücülere teklif et. Aday yoksa false döner. */
  broadcast(ride: RideRow, options: { exclude?: readonly number[] } = {}): boolean {
    const candidates = this.findCandidates(ride.pickup_lat, ride.pickup_lng, options.exclude ?? []);
    if (candidates.length === 0) return false;

    this.offered.set(
      ride.id,
      candidates.map((c) => c.driverId),
    );
    const passengerRating = passengerRatingOf(this.db, ride.passenger_id);
    for (const c of candidates) {
      this.hub.emitToUser(c.driverId, 'ride:offer', {
        rideId: ride.id,
        passengerRating: passengerRating.rating,
        pickup: { lat: ride.pickup_lat, lng: ride.pickup_lng, address: ride.pickup_address },
        drop: { lat: ride.drop_lat, lng: ride.drop_lng, address: ride.drop_address },
        stops: parseStops(ride.stops),
        estDistanceKm: ride.est_distance_km,
        estFare: ride.est_fare,
        pickupDistanceKm: Math.round(c.distanceKm * 10) / 10,
      });
    }

    this.armTimer(ride.id, this.offerTimeoutMs);
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

  /**
   * Sunucu yeniden başlayınca bellekteki zamanlayıcılar kaybolur; 'requested'
   * durumunda kalan çağrılar sonsuza dek beklerdi (yolcu yeni çağrı da açamazdı).
   * Süresi dolmuş olanları hemen iptal eder, kalanlar için sayacı kalan süreyle
   * yeniden kurar. İşlenen çağrı sayısını döner.
   */
  resume(): number {
    const rows = this.db
      .prepare("SELECT id, requested_at FROM rides WHERE status = 'requested'")
      .all() as unknown as Array<{ id: number; requested_at: string }>;
    for (const row of rows) {
      const remaining = Date.parse(row.requested_at) + this.offerTimeoutMs - Date.now();
      if (Number.isFinite(remaining) && remaining > 0) {
        this.armTimer(row.id, remaining);
      } else {
        this.expire(row.id);
      }
    }
    return rows.length;
  }

  /** Zaman aşımı sayacını kurar; aynı çağrı için eski sayaç varsa sızmaması için iptal eder. */
  private armTimer(rideId: number, delayMs: number): void {
    const existing = this.timers.get(rideId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.expire(rideId), delayMs);
    timer.unref?.();
    this.timers.set(rideId, timer);
  }

  /** Zaman aşımı: hâlâ bekleyen çağrıyı 'sürücü bulunamadı' ile iptal et. */
  private expire(rideId: number): void {
    const changed = this.db
      .prepare(
        "UPDATE rides SET status = 'cancelled', cancel_reason = 'no_driver', cancelled_at = ? WHERE id = ? AND status = 'requested'",
      )
      .run(nowIso(), rideId).changes;
    if (changed === 1) {
      const ride = getRide(this.db, rideId);
      if (ride) {
        // İstemciler her ride:update olayında `ride` nesnesini okur; eksik gönderilmemeli.
        this.hub.emitToUser(ride.passenger_id, 'ride:update', {
          rideId,
          status: 'cancelled',
          ride: rideToJson(this.db, ride),
          cancelReason: 'no_driver',
        });
      }
    }
    this.settle(rideId);
  }

  close(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.offered.clear();
  }
}
