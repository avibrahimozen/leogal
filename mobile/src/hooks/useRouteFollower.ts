import { useEffect, useMemo, useRef, useState } from 'react';
import { followStep, routeLengthKm, type FollowDisplay, type FollowRoute, type FollowState } from '../logic/routeFollow';
import type { LatLng, RoadRoute } from '../types';

export interface FollowerResult {
  display: FollowDisplay;
  /** İkonun yeni konuma varması için önerilen süre: son iki güncelleme arası (ms) */
  durationMs: number;
}

const MIN_MOVE_MS = 400;
const MAX_MOVE_MS = 4000;
const DEFAULT_MOVE_MS = 900;

/**
 * Araç konumunu yol rotasına oturtur ve ikonun rota çizgisi üzerinden ilerlemesi için
 * ara noktaları üretir. Yalnızca gerçek yol rotası (OSRM) için yola oturtma yapılır;
 * düz çizgi yedeğinde ham konum döner. `pos` null ise sonuç null.
 */
export function useRouteFollower(
  pos: (LatLng & { heading: number | null }) | null,
  route: RoadRoute | null,
  routeKey: string,
): FollowerResult | null {
  const stateRef = useRef<FollowState | null>(null);
  const lastPosRef = useRef<typeof pos>(null);
  const lastAtRef = useRef(0);
  const [result, setResult] = useState<FollowerResult | null>(null);

  const followRoute = useMemo<FollowRoute | null>(
    () =>
      route && route.source === 'osrm' && route.points.length > 1
        ? { key: routeKey, points: route.points, totalKm: routeLengthKm(route.points) }
        : null,
    [route, routeKey],
  );

  useEffect(() => {
    if (!pos) {
      stateRef.current = null;
      lastPosRef.current = null;
      lastAtRef.current = 0;
      setResult(null);
      return;
    }
    const now = Date.now();
    let durationMs = DEFAULT_MOVE_MS;
    if (pos !== lastPosRef.current) {
      // Yeni konum: ikon tam bir sonraki güncelleme gelirken varsın diye süre = güncelleme aralığı
      if (lastAtRef.current > 0) durationMs = Math.min(MAX_MOVE_MS, Math.max(MIN_MOVE_MS, now - lastAtRef.current));
      lastAtRef.current = now;
      lastPosRef.current = pos;
    } else {
      // Yalnızca rota değişti (yeni rota geldi): kısa bir düzeltme kaydırması
      durationMs = 600;
    }
    const { state, display } = followStep(stateRef.current, pos, followRoute);
    stateRef.current = state;
    setResult({ display, durationMs });
  }, [pos, followRoute]);

  return result;
}
