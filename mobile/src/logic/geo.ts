import type { GeoPoint, LatLng, Ride } from '../types';

/**
 * Harita/rota için saf coğrafi yardımcılar. Yan etkisizdir; jest ile test edilir.
 */

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** İki nokta arası kuş uçuşu mesafe (km). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

/** a → b pusula yönü (0 = kuzey, 90 = doğu). Araç ikonunu döndürmek için. */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Bu kadar yer değiştirmeden yön hesaplanmaz (GPS gürültüsü ikonu titretmesin) — km */
const MIN_MOVE_FOR_HEADING_KM = 0.005;

/**
 * Araç ikonunun yönü. Öncelik: sunucu/GPS'in bildirdiği geçerli yön (0–360; iOS
 * geçersizde -1 verir) → son iki konumdan hesaplanan yön (≥5 m ilerlemişse) →
 * önceki yön (duruyorsa ikon dönmesin).
 */
export function resolveHeading(
  prev: LatLng | null,
  next: LatLng,
  reported: number | null | undefined,
  previousHeading: number | null,
): number | null {
  if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0 && reported <= 360) {
    return reported % 360;
  }
  if (prev && haversineKm(prev, next) >= MIN_MOVE_FOR_HEADING_KM) return bearing(prev, next);
  return previousHeading;
}

/** Konum, verilen başlangıçtan `km`'den fazla uzaklaştı mı? Başlangıç yoksa true. */
export function movedBeyond(origin: LatLng | null, current: LatLng, km: number): boolean {
  return !origin || haversineKm(origin, current) > km;
}

/**
 * Rota çizgisini aracın bulunduğu yerden başlatır: en yakın köşe `maxSnapKm` içindeyse
 * ondan önceki köşeler atılır (araç ilerledikçe çizgi arkasında kalmaz). Uzaksa
 * (rota bayatladıysa) araç konumu başa eklenir.
 */
export function trimRouteToPosition(points: readonly LatLng[], pos: LatLng, maxSnapKm = 0.15): LatLng[] {
  if (points.length === 0) return [pos];
  let best = 0;
  let bestKm = Infinity;
  points.forEach((p, i) => {
    const d = haversineKm(p, pos);
    if (d < bestKm) {
      bestKm = d;
      best = i;
    }
  });
  if (bestKm > maxSnapKm) return [pos, ...points];
  return [pos, ...points.slice(best + 1)];
}

/** Sürücünün sıradaki hedefleri: alışa giderken alış noktası; yolculukta duraklar ve varış. */
export function driverLegTargets(ride: Pick<Ride, 'status' | 'pickup' | 'drop' | 'stops'>): GeoPoint[] {
  if (ride.status === 'accepted' || ride.status === 'arrived') return [ride.pickup];
  if (ride.status === 'in_progress') return [...(ride.stops ?? []), ride.drop];
  return [];
}

/** Kamera takibinde çerçevelenecek noktalar: araç + sıradaki hedef (varsa). */
export function followTargets(driver: LatLng, ride: Pick<Ride, 'status' | 'pickup' | 'drop' | 'stops'>): LatLng[] {
  const next = driverLegTargets(ride)[0];
  return next ? [driver, { lat: next.lat, lng: next.lng }] : [driver];
}

/** Rota önbellek/karşılaştırma anahtarı (4 ondalık ≈ 10 m hassasiyet). */
export function routeKey(points: readonly LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
}
