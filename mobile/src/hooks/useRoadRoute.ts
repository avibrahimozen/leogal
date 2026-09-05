import { useEffect, useRef, useState } from 'react';
import { fetchRoadRoute, straightRoute } from '../api/route';
import { routeKey } from '../logic/geo';
import type { LatLng, RoadRoute } from '../types';

/**
 * Verilen noktalar için yol rotası. Noktalar (≈10 m hassasiyetle) değişmedikçe yeniden
 * istenmez; yanıt gelene kadar düz çizgi döner ki harita boş kalmasın.
 * `points` null ya da tek noktaysa null döner.
 */
export function useRoadRoute(points: readonly LatLng[] | null): RoadRoute | null {
  const key = points && points.length > 1 ? routeKey(points) : '';
  const latest = useRef(points);
  latest.current = points;
  const [route, setRoute] = useState<RoadRoute | null>(null);

  useEffect(() => {
    const pts = latest.current;
    if (!key || !pts) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    setRoute(straightRoute(pts));
    fetchRoadRoute(pts).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return route;
}
