import { config } from '../config.js';
import { haversineKm } from './geo.js';

/**
 * Yol rotalama: OSRM (OpenStreetMap tabanlı, ücretsiz) ile gerçek yol geometrisi,
 * mesafe ve süre. Servis kapalıysa/ulaşılamıyorsa düz çizgi + yol çarpanına düşer;
 * çağıran taraf `source` alanından hangisinin kullanıldığını görür.
 *
 * Not: router.project-osrm.org bir demo sunucusudur (hafif kullanım için). Üretimde
 * kendi OSRM'inizi (ULAK_OSRM_URL) ya da Google/Mapbox Directions kullanın.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** Rota geometrisi: ilk nokta başlangıç, son nokta varış */
  points: LatLng[];
  distanceKm: number;
  /** OSRM'den gelir; düz çizgi yedeğinde null */
  durationMin: number | null;
  source: 'osrm' | 'straight';
}

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; value: RouteResult }>();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cacheKey(points: readonly LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
}

/** Düz çizgi yedeği: bacakların kuş uçuşu toplamı × yol çarpanı. */
export function straightRoute(points: readonly LatLng[]): RouteResult {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    km += haversineKm(a.lat, a.lng, b.lat, b.lng);
  }
  return { points: [...points], distanceKm: round2(km * config.roadFactor), durationMin: null, source: 'straight' };
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.routing.timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Ulak/0.1 (taksi uygulaması)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Noktalar arası yol rotası (2+ nokta). Hata durumunda düz çizgi yedeği döner, asla fırlatmaz. */
export async function routeVia(points: readonly LatLng[]): Promise<RouteResult> {
  if (points.length < 2) return straightRoute(points);
  if (!config.routing.enabled) return straightRoute(points);

  const key = cacheKey(points);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${config.routing.osrmBaseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  try {
    const data = (await fetchJson(url)) as {
      code?: string;
      routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> } }>;
    };
    const route = data.code === 'Ok' ? data.routes?.[0] : undefined;
    if (!route || !Array.isArray(route.geometry?.coordinates) || route.geometry.coordinates.length < 2) {
      throw new Error('OSRM rota döndürmedi');
    }
    const result: RouteResult = {
      points: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceKm: round2(route.distance / 1000),
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      source: 'osrm',
    };
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { at: Date.now(), value: result });
    return result;
  } catch {
    return straightRoute(points);
  }
}

/** Noktayı en yakın yola oturtur (sahte taksilerin denize/tarlaya düşmemesi için). Hata olursa noktayı aynen döner. */
export async function snapToRoad(point: LatLng): Promise<LatLng> {
  if (!config.routing.enabled) return point;
  const url = `${config.routing.osrmBaseUrl}/nearest/v1/driving/${point.lng},${point.lat}?number=1`;
  try {
    const data = (await fetchJson(url)) as { code?: string; waypoints?: Array<{ location: [number, number] }> };
    const wp = data.code === 'Ok' ? data.waypoints?.[0] : undefined;
    if (!wp) return point;
    const [lng, lat] = wp.location;
    return { lat, lng };
  } catch {
    return point;
  }
}

/** İki nokta arası pusula yönü (0 = kuzey, saat yönünde derece). Araç ikonunu döndürmek için. */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Testler için önbelleği temizler. */
export function clearRouteCache(): void {
  cache.clear();
}
