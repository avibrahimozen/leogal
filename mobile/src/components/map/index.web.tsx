import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View } from 'react-native';
import type {
  Coordinate,
  EdgePadding,
  MapHandle,
  MapViewProps,
  MarkerHandle,
  MarkerProps,
  PolylineProps,
  Region,
} from './types';

/**
 * Web haritası: Leaflet + OpenStreetMap karoları (API anahtarı gerektirmez).
 * types.ts'teki sözleşmeyi uygular; ekranlar iOS/Android ile aynı kodu kullanır.
 *
 *  - MapView: haritayı kurar, alt bileşenlere (Marker/Polyline) context ile verir.
 *  - Marker: children varsa özel görünüm (örn. kırmızı araç) portal ile Leaflet
 *    ikonunun içine çizilir; yoksa renkli SVG iğne. animateMarkerToCoordinate
 *    requestAnimationFrame ile kaydırır (react-native-maps ile aynı sözleşme).
 *  - Polyline: L.polyline.
 */

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıda bulunanlar';
const MAX_ZOOM = 19;
/** Takip kamerası (fitToCoordinates) sokak düzeyinden öteye yakınlaşmasın */
const FIT_MAX_ZOOM = 17;
/** Kenar boşluğu harita boyutunun bu oranını aşamaz; aksi halde küçük pencerede zoom bozulur */
const MAX_PADDING_RATIO = 0.4;
/** Kullanıcının mavi konum noktası (Apple/Google Maps'teki gibi) */
const USER_DOT_STYLE: L.CircleMarkerOptions = { radius: 7, color: '#ffffff', weight: 2, fillColor: '#2563EB', fillOpacity: 1 };

const MapContext = createContext<L.Map | null>(null);

function toLatLng(c: Coordinate): L.LatLngTuple {
  return [c.latitude, c.longitude];
}

/** react-native-maps Region → Leaflet sınırları (merkez ± delta/2) */
export function regionToBounds(r: Region): L.LatLngBounds {
  return L.latLngBounds(
    [r.latitude - r.latitudeDelta / 2, r.longitude - r.longitudeDelta / 2],
    [r.latitude + r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2],
  );
}

function currentRegion(map: L.Map): Region {
  const b = map.getBounds();
  const c = b.getCenter();
  return {
    latitude: c.lat,
    longitude: c.lng,
    latitudeDelta: b.getNorth() - b.getSouth(),
    longitudeDelta: b.getEast() - b.getWest(),
  };
}

/** Kenar boşluklarını harita boyutuna göre sınırlar (üst+alt ≤ %80 vb.) */
export function clampPadding(p: EdgePadding, width: number, height: number): EdgePadding {
  const maxX = Math.max(0, Math.floor(width * MAX_PADDING_RATIO));
  const maxY = Math.max(0, Math.floor(height * MAX_PADDING_RATIO));
  return {
    top: Math.min(Math.max(0, p.top), maxY),
    bottom: Math.min(Math.max(0, p.bottom), maxY),
    left: Math.min(Math.max(0, p.left), maxX),
    right: Math.min(Math.max(0, p.right), maxX),
  };
}

export const MapView = forwardRef<MapHandle, MapViewProps>(function MapView(
  { style, initialRegion, onRegionChangeComplete, onPanDrag, showsUserLocation, children },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const regionChangeRef = useRef(onRegionChangeComplete);
  regionChangeRef.current = onRegionChangeComplete;
  const panDragRef = useRef(onPanDrag);
  panDragRef.current = onPanDrag;
  const initialRef = useRef(initialRegion);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const m = L.map(el, { zoomControl: false, attributionControl: true });
    L.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, attribution: ATTRIBUTION }).addTo(m);
    const initial = initialRef.current;
    if (initial) m.fitBounds(regionToBounds(initial), { animate: false });
    else m.setView([35.1856, 33.3823], 9);
    m.on('moveend', () => regionChangeRef.current?.(currentRegion(m)));
    m.on('dragstart', () => panDragRef.current?.());
    // Tekerlek/pinch ile yakınlaştırma da elle müdahaledir: takip kamerası durur
    const onWheel = () => panDragRef.current?.();
    el.addEventListener('wheel', onWheel, { passive: true });
    setMap(m);
    return () => {
      el.removeEventListener('wheel', onWheel);
      m.remove();
      setMap(null);
    };
  }, []);

  // Mavi konum noktası: tarayıcı konumunu izler (react-native-maps showsUserLocation karşılığı)
  useEffect(() => {
    if (!map || !showsUserLocation) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    let dot: L.CircleMarker | null = null;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const ll: L.LatLngTuple = [pos.coords.latitude, pos.coords.longitude];
        if (!dot) dot = L.circleMarker(ll, USER_DOT_STYLE).addTo(map);
        else dot.setLatLng(ll);
      },
      () => {
        // İzin yok ya da konum alınamıyor: nokta çizilmez
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      dot?.remove();
    };
  }, [map, showsUserLocation]);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion(region, durationMs = 500) {
        map?.flyToBounds(regionToBounds(region), { duration: Math.max(0.2, durationMs / 1000) });
      },
      fitToCoordinates(coordinates, options) {
        if (!map || coordinates.length === 0) return;
        const bounds = L.latLngBounds(coordinates.map(toLatLng));
        const size = map.getSize();
        const p = options?.edgePadding ? clampPadding(options.edgePadding, size.x, size.y) : null;
        map.fitBounds(bounds, {
          paddingTopLeft: p ? [p.left, p.top] : undefined,
          paddingBottomRight: p ? [p.right, p.bottom] : undefined,
          animate: options?.animated ?? true,
          duration: 0.7,
          maxZoom: FIT_MAX_ZOOM,
        });
      },
      animateCamera(camera, options) {
        if (!map || !camera.center) return;
        map.panTo(toLatLng(camera.center), { animate: true, duration: (options?.duration ?? 700) / 1000 });
      },
    }),
    [map],
  );

  return (
    <View style={[styles.fill, style]}>
      <div ref={containerRef} style={containerStyle} />
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </View>
  );
});

const containerStyle: React.CSSProperties = { width: '100%', height: '100%' };

/* ------------------------------------------------------------------ */

const PIN_W = 26;
const PIN_H = 36;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

/** Renkli iğne (react-native-maps pinColor karşılığı) */
export function pinSvg(color: string): string {
  const c = escapeHtml(color);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 26 36">` +
    `<path d="M13 0C5.8 0 0 5.8 0 13c0 9.5 13 23 13 23s13-13.5 13-23C26 5.8 20.2 0 13 0z" fill="${c}" stroke="#ffffff" stroke-width="1.5"/>` +
    `<circle cx="13" cy="13" r="5" fill="#ffffff"/></svg>`
  );
}

export const Marker = forwardRef<MarkerHandle, MarkerProps>(function Marker(
  { coordinate, title, description, pinColor = '#E11D48', anchor, zIndex, children },
  ref,
) {
  const map = useContext(MapContext);
  const markerRef = useRef<L.Marker | null>(null);
  const animRef = useRef<number | null>(null);
  const hasChildren = children !== undefined && children !== null && children !== false;
  const anchorX = anchor?.x ?? 0.5;
  const anchorY = anchor?.y ?? 1;

  // Özel görünüm (children) bu DOM düğümüne portal ile çizilir; bağlanma noktası transform ile ayarlanır
  const host = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    return el;
  }, []);

  const cancelAnim = () => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  };

  const makeIcon = (): L.DivIcon => {
    if (hasChildren && host) {
      host.style.transform = `translate(${-anchorX * 100}%, ${-anchorY * 100}%)`;
      return L.divIcon({ html: host, className: '', iconSize: undefined });
    }
    return L.divIcon({
      html: pinSvg(pinColor),
      className: '',
      iconSize: [PIN_W, PIN_H],
      iconAnchor: [PIN_W / 2, PIN_H],
      popupAnchor: [0, -PIN_H + 8],
    });
  };
  const makeIconRef = useRef(makeIcon);
  makeIconRef.current = makeIcon;
  const coordinateRef = useRef(coordinate);
  coordinateRef.current = coordinate;

  useEffect(() => {
    if (!map) return;
    const m = L.marker(toLatLng(coordinateRef.current), {
      icon: makeIconRef.current(),
      zIndexOffset: zIndex ?? 0,
      keyboard: false,
    }).addTo(map);
    markerRef.current = m;
    return () => {
      cancelAnim();
      m.remove();
      markerRef.current = null;
    };
    // Marker yalnızca harita değişince yeniden kurulur; diğer prop'lar aşağıdaki efektlerle güncellenir
  }, [map]);

  useEffect(() => {
    markerRef.current?.setIcon(makeIconRef.current());
  }, [hasChildren, pinColor, anchorX, anchorY]);

  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    const text = [title, description].filter((s): s is string => !!s).map(escapeHtml);
    if (text.length === 0) m.unbindPopup();
    else m.bindPopup(text.join('<br/>'), { closeButton: false });
  }, [title, description]);

  useEffect(() => {
    markerRef.current?.setZIndexOffset(zIndex ?? 0);
  }, [zIndex]);

  useEffect(() => {
    cancelAnim();
    markerRef.current?.setLatLng(toLatLng(coordinate));
  }, [coordinate.latitude, coordinate.longitude]);

  useImperativeHandle(
    ref,
    () => ({
      animateMarkerToCoordinate(target, durationMs = 500) {
        const m = markerRef.current;
        if (!m) return;
        cancelAnim();
        const from = m.getLatLng();
        const total = Math.max(1, durationMs);
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / total);
          m.setLatLng([from.lat + (target.latitude - from.lat) * t, from.lng + (target.longitude - from.lng) * t]);
          animRef.current = t < 1 ? requestAnimationFrame(step) : null;
        };
        animRef.current = requestAnimationFrame(step);
      },
    }),
    [],
  );

  return host && hasChildren ? createPortal(children, host) : null;
});

/* ------------------------------------------------------------------ */

export function Polyline({ coordinates, strokeColor = '#000000', strokeWidth = 3, lineDashPattern }: PolylineProps) {
  const map = useContext(MapContext);
  const lineRef = useRef<L.Polyline | null>(null);
  const dash = lineDashPattern?.join(' ');

  useEffect(() => {
    if (!map) return;
    const line = L.polyline([], { lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
    lineRef.current = line;
    return () => {
      line.remove();
      lineRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    lineRef.current?.setStyle({ color: strokeColor, weight: strokeWidth, dashArray: dash });
  }, [strokeColor, strokeWidth, dash]);

  useEffect(() => {
    lineRef.current?.setLatLngs(coordinates.map(toLatLng));
  }, [coordinates]);

  return null;
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
});

export type { Coordinate, EdgePadding, MapHandle, MapViewProps, MarkerHandle, MarkerProps, PolylineProps, Region } from './types';
