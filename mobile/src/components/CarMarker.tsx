import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import { Marker, type MapMarker } from 'react-native-maps';
import { bearing, haversineKm } from '../logic/geo';
import type { LatLng } from '../types';

/** Üstten görünüm kırmızı araç (burun yukarı); @2x/@3x sürümleri aynı klasörde. */
export const CAR_IMAGE = require('../../assets/car-red.png');
/** Ekrandaki araç boyutu (nokta) */
export const CAR_WIDTH = 22;
export const CAR_HEIGHT = 44;
/** Varsayılan kaydırma süresi (ms); ekran güncelleme aralığını verirse o kullanılır */
const MOVE_MS = 900;
/** Bir güncellemede en fazla bu kadar rota parçası animasyonlanır (fazlası seyreltilir) */
const MAX_SEGMENTS = 16;

interface Props {
  lat: number;
  lng: number;
  /** Gidiş yönü (0 = kuzey); null ise araç kuzeye bakar */
  heading?: number | null;
  /**
   * Önceki konumdan yeni konuma rota üzerindeki ara noktalar (ilk nokta önceki konum,
   * son nokta yeni konum). Verilirse ikon düz çizgi yerine bu köşelerden geçerek ilerler
   * ve her parçada yolun yönüne döner.
   */
  path?: LatLng[];
  /** Yeni konuma varma süresi (ms); verilmezse MOVE_MS */
  durationMs?: number;
  title?: string;
  description?: string;
  /** Konum değişince kaydırarak taşı (varsayılan); false ise anında zıplar */
  animated?: boolean;
  zIndex?: number;
}

/** Çok köşeli yolu en fazla `max` parçaya seyreltir; ilk ve son nokta korunur */
function simplifyPath(points: LatLng[], max: number): LatLng[] {
  if (points.length - 1 <= max) return points;
  const out: LatLng[] = [points[0]!];
  const step = (points.length - 1) / max;
  for (let i = 1; i < max; i++) out.push(points[Math.round(i * step)]!);
  out.push(points[points.length - 1]!);
  return out;
}

/**
 * Haritadaki taksi: emoji yerine gerçek araç görseli, yönüne göre döner ve yeni konuma
 * Uber gibi kayarak gider. `path` verilirse yol tarifinin köşelerinden geçer.
 *
 * Kaydırma yerel `animateMarkerToCoordinate` ile yapılır (iOS/Android, yeni mimari dahil).
 * `coordinate` prop'u animasyon bitene kadar eski değerde tutulur; aksi halde React yeni
 * konumu anında uygular ve araç zıplar. Süre dolunca prop hedefe eşitlenir (araç zaten
 * oradadır, görünür bir sıçrama olmaz).
 *
 * Döndürme: Android'de yerel `rotation` (bitmap'e uygulanır, izleme kapalıyken de çalışır);
 * iOS Apple Maps'te `rotation` desteklenmediği için görsel stille döndürülür.
 */
export function CarMarker({ lat, lng, heading, path, durationMs, title, description, animated = true, zIndex }: Props) {
  const markerRef = useRef<MapMarker>(null);
  const [shown, setShown] = useState({ latitude: lat, longitude: lng });
  // Rota parçası animasyonu sırasında yolun yönü; bitince `heading` prop'una dönülür
  const [segHeading, setSegHeading] = useState<number | null>(null);
  // Android: özel görünüm bitmap'e çevrilir; görsel yüklendikten sonra izlemeyi kapatmak performans için şart
  const [tracks, setTracks] = useState(true);
  const mounted = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Efekt yalnızca konum değişince koşar; yol ve süre o anki değerleriyle okunur
  const pathRef = useRef(path);
  pathRef.current = path;
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    clearTimers();
    const target = { latitude: lat, longitude: lng };
    if (!animated) {
      setShown(target);
      setSegHeading(null);
      return;
    }
    const total = Math.min(6000, Math.max(150, durationRef.current ?? MOVE_MS));
    const raw = pathRef.current;
    const verts = raw && raw.length >= 2 ? simplifyPath(raw, MAX_SEGMENTS) : null;

    if (!verts) {
      markerRef.current?.animateMarkerToCoordinate(target, total);
      timers.current.push(setTimeout(() => setShown(target), total));
      return;
    }

    // Parça süreleri uzunlukla orantılı: ikon sabit hızla köşelerden geçer, her parçada yola döner
    const lengths: number[] = [];
    let sum = 0;
    for (let i = 0; i < verts.length - 1; i++) {
      const km = haversineKm(verts[i]!, verts[i + 1]!);
      lengths.push(km);
      sum += km;
    }
    let at = 0;
    for (let i = 0; i < verts.length - 1; i++) {
      const from = verts[i]!;
      const to = verts[i + 1]!;
      const dur = sum > 0 ? Math.max(16, Math.round((lengths[i]! / sum) * total)) : Math.round(total / (verts.length - 1));
      const run = () => {
        markerRef.current?.animateMarkerToCoordinate({ latitude: to.lat, longitude: to.lng }, dur);
        if (lengths[i]! > 0.002) setSegHeading(bearing(from, to));
      };
      if (at === 0) run();
      else timers.current.push(setTimeout(run, at));
      at += dur;
    }
    timers.current.push(
      setTimeout(() => {
        setShown(target);
        setSegHeading(null);
      }, at),
    );
  }, [lat, lng, animated]);

  useEffect(() => clearTimers, []);

  const rotate = segHeading ?? heading ?? 0;
  const android = Platform.OS === 'android';
  return (
    <Marker
      ref={markerRef}
      coordinate={shown}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={android ? rotate : undefined}
      tracksViewChanges={android ? tracks : undefined}
      title={title}
      description={description}
      zIndex={zIndex}
    >
      <Image
        source={CAR_IMAGE}
        style={[styles.car, !android && { transform: [{ rotate: `${rotate}deg` }] }]}
        resizeMode="contain"
        onLoad={() => {
          setTimeout(() => setTracks(false), 400);
        }}
      />
    </Marker>
  );
}

const styles = StyleSheet.create({
  car: { width: CAR_WIDTH, height: CAR_HEIGHT },
});
