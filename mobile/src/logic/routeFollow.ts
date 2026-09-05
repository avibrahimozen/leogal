import type { LatLng } from '../types';
import { bearing, haversineKm, trimRouteToPosition } from './geo';

/**
 * Araç ikonunun yol tarifini izlemesi: GPS konumu rota çizgisine oturtulur (snap), iki
 * güncelleme arasında ikon rota köşelerinden geçerek ilerler, yönü yolun yönü olur.
 * Saf fonksiyonlar; ekranlar `useRouteFollower` ile kullanır.
 */

export interface RouteProjection {
  /** Rota üzerindeki en yakın nokta */
  point: LatLng;
  /** Noktanın bulunduğu parça: points[segment] → points[segment + 1] */
  segment: number;
  /** Parça içindeki konum (0 = parça başı, 1 = parça sonu) */
  t: number;
  /** Aracın rotaya uzaklığı (km) */
  offsetKm: number;
  /** Rota başından bu noktaya kadar yol (km) */
  alongKm: number;
}

/** Araç rotaya bu kadar yakınsa ikon yola oturtulur (km) */
export const SNAP_KM = 0.06;
/** Araç rotadan bu kadar uzaklaştıysa rota bayat sayılır, yeniden istenir (km) */
export const OFF_ROUTE_KM = 0.1;
/** Aynı rotada geriye kayma toleransı (GPS gürültüsü) — km */
const BACKTRACK_KM = 0.05;

const KM_PER_DEG_LAT = 111.32;

/** Küçük mesafeler için yerel düzlem: `origin` merkezli km koordinatları */
function toXY(origin: LatLng, p: LatLng): { x: number; y: number } {
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (p.lng - origin.lng) * kmPerDegLng, y: (p.lat - origin.lat) * KM_PER_DEG_LAT };
}

/** Rota uzunluğu (km) */
export function routeLengthKm(points: readonly LatLng[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1]!, points[i]!);
  return km;
}

/**
 * Konumu rotaya izdüşürür: en yakın parça ve parça üzerindeki nokta.
 * `window` verilirse yalnızca `alongKm` bu aralığa düşen adaylar değerlendirilir; böylece
 * gidiş-dönüş yolları gibi birbirine yakın parçalarda ikon ileriye "zıplamaz".
 * Aralıkta aday yoksa null döner.
 */
export function projectOntoRoute(
  points: readonly LatLng[],
  pos: LatLng,
  window?: { minAlongKm: number; maxAlongKm: number },
): RouteProjection | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    const only = points[0]!;
    return { point: only, segment: 0, t: 0, offsetKm: haversineKm(only, pos), alongKm: 0 };
  }
  let best: RouteProjection | null = null;
  let along = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const segKm = haversineKm(a, b);
    const B = toXY(a, b);
    const P = toXY(a, pos);
    const len2 = B.x * B.x + B.y * B.y;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
    const alongKm = along + segKm * t;
    along += segKm;
    if (window && (alongKm < window.minAlongKm || alongKm > window.maxAlongKm)) continue;
    const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const offsetKm = haversineKm(point, pos);
    if (!best || offsetKm < best.offsetKm) best = { point, segment: i, t, offsetKm, alongKm };
  }
  return best;
}

/**
 * İki izdüşüm arasındaki rota parçası: başlangıç noktası, aradaki köşeler, bitiş noktası.
 * Bitiş başlangıcın gerisindeyse (gürültü) doğrudan çizgi döner.
 */
export function pathBetween(points: readonly LatLng[], from: RouteProjection, to: RouteProjection): LatLng[] {
  if (to.alongKm < from.alongKm) return [from.point, to.point];
  const verts: LatLng[] = [from.point];
  for (let i = from.segment + 1; i <= to.segment; i++) verts.push(points[i]!);
  verts.push(to.point);
  // Üst üste binen noktaları at (parça sınırında t=1 / t=0 çakışması)
  return verts.filter((p, i) => i === 0 || haversineKm(verts[i - 1]!, p) > 0.0005);
}

/** İzdüşümün bulunduğu parçanın yönü (yolun yönü) */
export function headingAt(points: readonly LatLng[], proj: RouteProjection): number | null {
  for (let i = proj.segment; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (haversineKm(a, b) > 0.001) return bearing(a, b);
  }
  for (let i = proj.segment - 1; i >= 0; i--) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (haversineKm(a, b) > 0.001) return bearing(a, b);
  }
  return null;
}

export interface FollowRoute {
  /** Rota anahtarı; değişince önceki izdüşüm geçersizdir */
  key: string;
  points: LatLng[];
  totalKm: number;
}

export interface FollowState {
  routeKey: string;
  proj: RouteProjection;
  pos: LatLng;
}

/** Ekranın çizeceği araç: konum, yön, geçilecek ara noktalar ve kalan yol */
export interface FollowDisplay {
  lat: number;
  lng: number;
  heading: number | null;
  /** Önceki gösterim noktasından buraya rota üzerindeki ara noktalar (animasyon için) */
  path?: LatLng[];
  /** Konum rotaya oturtuldu mu */
  snapped: boolean;
  /** Rota üzerinde kalan yol (km); rota yoksa null */
  remainingKm: number | null;
  /** Araçtan ileriye çizilecek rota çizgisi; rota yoksa null */
  ahead: LatLng[] | null;
  /** Araç rotadan OFF_ROUTE_KM'den fazla uzaklaştı: rota yenilenmeli */
  offRoute: boolean;
}

/**
 * Bir konum güncellemesini işler. Rota yoksa ham konumu döner. Rota varsa konumu yola
 * oturtur; aynı rotadaki önceki adımdan bu adıma rota köşelerinden geçen `path` üretir.
 * Aynı rotada izdüşüm, önceki noktanın biraz gerisinden başlayıp kuş uçuşu ilerlemenin
 * en fazla iki katı kadar ilerisine bakar (gidiş-dönüş yollarında ileri zıplamayı önler).
 */
export function followStep(
  prev: FollowState | null,
  pos: LatLng & { heading: number | null },
  route: FollowRoute | null,
): { state: FollowState | null; display: FollowDisplay } {
  const raw: FollowDisplay = {
    lat: pos.lat,
    lng: pos.lng,
    heading: pos.heading,
    snapped: false,
    remainingKm: null,
    ahead: null,
    offRoute: false,
  };
  if (!route || route.points.length < 2) return { state: null, display: raw };

  const sameRoute = prev !== null && prev.routeKey === route.key;
  let proj: RouteProjection | null = null;
  if (sameRoute) {
    const moved = haversineKm(prev.pos, pos);
    proj = projectOntoRoute(route.points, pos, {
      minAlongKm: prev.proj.alongKm - BACKTRACK_KM,
      maxAlongKm: prev.proj.alongKm + moved * 2 + 0.1,
    });
  }
  if (!proj || proj.offsetKm > SNAP_KM) proj = projectOntoRoute(route.points, pos);
  if (!proj || proj.offsetKm > SNAP_KM) {
    return {
      state: null,
      display: {
        ...raw,
        ahead: trimRouteToPosition(route.points, { lat: pos.lat, lng: pos.lng }),
        offRoute: !proj || proj.offsetKm > OFF_ROUTE_KM,
      },
    };
  }

  const path = sameRoute ? pathBetween(route.points, prev.proj, proj) : undefined;
  return {
    state: { routeKey: route.key, proj, pos: { lat: pos.lat, lng: pos.lng } },
    display: {
      lat: proj.point.lat,
      lng: proj.point.lng,
      heading: headingAt(route.points, proj) ?? pos.heading,
      path: path && path.length >= 2 ? path : undefined,
      snapped: true,
      remainingKm: Math.max(0, route.totalKm - proj.alongKm),
      ahead: [proj.point, ...route.points.slice(proj.segment + 1)],
      offRoute: false,
    },
  };
}
