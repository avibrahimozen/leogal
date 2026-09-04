import { haversineKm, routeKey } from '../logic/geo';
import type { LatLng, RoadRoute } from '../types';
import { api } from './client';

/** Sunucuyla aynı yedek: kuş uçuşu × yol çarpanı */
const ROAD_FACTOR = 1.3;
const CACHE_MAX = 60;
const cache = new Map<string, RoadRoute>();

/** `GET /api/public/route?points=` sorgu değeri: `lat,lng|lat,lng` (5 ondalık ≈ 1 m). */
export function buildRouteQuery(points: readonly LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
}

/** Düz çizgi yedeği: sunucuya ulaşılamazsa ya da rota alınamazsa çizilir. */
export function straightRoute(points: readonly LatLng[]): RoadRoute {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1]!, points[i]!);
  return {
    points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
    distanceKm: Math.round(km * ROAD_FACTOR * 100) / 100,
    durationMin: null,
    source: 'straight',
  };
}

/**
 * Gerçek yol rotası (sunucudaki OSRM vekili üzerinden). Hata ya da kapalı rotalamada
 * düz çizgiye düşer; asla fırlatmaz. Yol rotaları kısa süreli önbelleğe alınır.
 */
export async function fetchRoadRoute(points: readonly LatLng[]): Promise<RoadRoute> {
  if (points.length < 2) return straightRoute(points);
  const key = routeKey(points);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await api.get<Partial<RoadRoute>>(`/public/route?points=${encodeURIComponent(buildRouteQuery(points))}`);
    if (!Array.isArray(res.points) || res.points.length < 2 || typeof res.distanceKm !== 'number') {
      return straightRoute(points);
    }
    const route: RoadRoute = {
      points: res.points,
      distanceKm: res.distanceKm,
      durationMin: typeof res.durationMin === 'number' ? res.durationMin : null,
      source: res.source === 'osrm' ? 'osrm' : 'straight',
    };
    if (route.source === 'osrm') {
      if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, route);
    }
    return route;
  } catch {
    return straightRoute(points);
  }
}

/** Testler için önbelleği temizler. */
export function clearRouteCache(): void {
  cache.clear();
}
