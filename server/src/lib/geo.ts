/** İki koordinat arası kuş uçuşu mesafe (km) — Haversine formülü. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface FareParams {
  baseFare: number;
  perKm: number;
  minFare: number;
  roadFactor: number;
}

export interface FareEstimate {
  distanceKm: number;
  fare: number;
}

/**
 * Ücret tahmini: kuş uçuşu mesafe yol çarpanıyla düzeltilir,
 * açılış + km ücreti hesaplanıp asgari ücretin altına inmesi engellenir.
 */
export function estimateFare(
  pickupLat: number,
  pickupLng: number,
  dropLat: number,
  dropLng: number,
  params: FareParams,
): FareEstimate {
  const straightKm = haversineKm(pickupLat, pickupLng, dropLat, dropLng);
  const distanceKm = round2(straightKm * params.roadFactor);
  const raw = params.baseFare + params.perKm * distanceKm;
  const fare = Math.max(params.minFare, roundFare(raw));
  return { distanceKm, fare };
}

/** Komisyon tutarı — kuruş hassasiyetinde yuvarlanır. */
export function commissionOf(fare: number, rate: number): number {
  return round2(fare * rate);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Ücreti en yakın 5 TL'ye yuvarla (nakit ödeme pratikliği). */
function roundFare(n: number): number {
  return Math.round(n / 5) * 5;
}
