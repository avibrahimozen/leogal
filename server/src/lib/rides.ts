import type { Db } from '../db.js';
import type { CountryCode } from './regions.js';

/** rides tablosundaki bir satır. */
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
  /** Alış noktasının ülkesi; ülke sütunu eklenmeden önceki kayıtlarda NULL. */
  country: CountryCode | null;
  /** Ara duraklar: JSON dizisi [{lat,lng,address}] veya NULL */
  stops: string | null;
}

export function getRide(db: Db, id: number): RideRow | undefined {
  return db.prepare('SELECT * FROM rides WHERE id = ?').get(id) as unknown as RideRow | undefined;
}

/** Çağrıyı istemciye dönen JSON biçimine çevirir (sürücü ve yolcu özetleriyle). */
export function rideToJson(db: Db, ride: RideRow) {
  let driver: Record<string, unknown> | null = null;
  if (ride.driver_id) {
    const row = db
      .prepare(
        `SELECT u.name, d.vehicle_plate, d.vehicle_model, d.rating_sum, d.rating_count, d.lat, d.lng, u.phone
         FROM users u JOIN drivers d ON d.user_id = u.id WHERE u.id = ?`,
      )
      .get(ride.driver_id) as unknown as {
      name: string;
      phone: string;
      vehicle_plate: string;
      vehicle_model: string;
      rating_sum: number;
      rating_count: number;
      lat: number | null;
      lng: number | null;
    };
    driver = {
      id: ride.driver_id,
      name: row.name,
      phone: row.phone,
      vehiclePlate: row.vehicle_plate,
      vehicleModel: row.vehicle_model,
      rating: row.rating_count > 0 ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : null,
      lat: row.lat,
      lng: row.lng,
    };
  }
  const passenger = db.prepare('SELECT name, phone FROM users WHERE id = ?').get(ride.passenger_id) as unknown as {
    name: string;
    phone: string;
  };
  return {
    id: ride.id,
    status: ride.status,
    pickup: { lat: ride.pickup_lat, lng: ride.pickup_lng, address: ride.pickup_address },
    drop: { lat: ride.drop_lat, lng: ride.drop_lng, address: ride.drop_address },
    stops: parseStops(ride.stops),
    estDistanceKm: ride.est_distance_km,
    estFare: ride.est_fare,
    country: ride.country ?? null,
    finalFare: ride.final_fare,
    cancelReason: ride.cancel_reason,
    passengerRating: ride.passenger_rating,
    driverRating: ride.driver_rating,
    requestedAt: ride.requested_at,
    acceptedAt: ride.accepted_at,
    arrivedAt: ride.arrived_at,
    startedAt: ride.started_at,
    completedAt: ride.completed_at,
    cancelledAt: ride.cancelled_at,
    driver,
    passenger: { id: ride.passenger_id, name: passenger.name, phone: passenger.phone },
  };
}

export type RideJson = ReturnType<typeof rideToJson>;

/** Bir çağrıda en fazla bu kadar ara durak olabilir. */
export const MAX_STOPS = 5;

export interface RoutePoint {
  lat: number;
  lng: number;
  address: string;
}

/** rides.stops JSON sütununu güvenle çözer (NULL/bozuk → boş liste). */
export function parseStops(raw: string | null | undefined): RoutePoint[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is RoutePoint =>
          typeof p === 'object' && p !== null && typeof (p as RoutePoint).lat === 'number' && typeof (p as RoutePoint).lng === 'number',
      )
      .map((p) => ({ lat: p.lat, lng: p.lng, address: typeof p.address === 'string' ? p.address : '' }));
  } catch {
    return [];
  }
}

/** Alış → duraklar → varış sırasıyla rota noktaları. */
export function routePoints(ride: RideRow): RoutePoint[] {
  return [
    { lat: ride.pickup_lat, lng: ride.pickup_lng, address: ride.pickup_address },
    ...parseStops(ride.stops),
    { lat: ride.drop_lat, lng: ride.drop_lng, address: ride.drop_address },
  ];
}
