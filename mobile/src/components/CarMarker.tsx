import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import { Marker, type MapMarker } from 'react-native-maps';

/** Üstten görünüm kırmızı araç (burun yukarı); @2x/@3x sürümleri aynı klasörde. */
export const CAR_IMAGE = require('../../assets/car-red.png');
/** Ekrandaki araç boyutu (nokta) */
export const CAR_WIDTH = 22;
export const CAR_HEIGHT = 44;
/** İki konum güncellemesi arasında kaydırma süresi (ms) */
const MOVE_MS = 900;

interface Props {
  lat: number;
  lng: number;
  /** Gidiş yönü (0 = kuzey); null ise araç kuzeye bakar */
  heading?: number | null;
  title?: string;
  description?: string;
  /** Konum değişince kaydırarak taşı (varsayılan); false ise anında zıplar */
  animated?: boolean;
  zIndex?: number;
}

/**
 * Haritadaki taksi: emoji yerine gerçek araç görseli, yönüne göre döner ve yeni konuma
 * Uber gibi kayarak gider.
 *
 * Kaydırma yerel `animateMarkerToCoordinate` ile yapılır (iOS/Android, yeni mimari dahil).
 * `coordinate` prop'u animasyon bitene kadar eski değerde tutulur; aksi halde React yeni
 * konumu anında uygular ve araç zıplar. Süre dolunca prop hedefe eşitlenir (araç zaten
 * oradadır, görünür bir sıçrama olmaz).
 *
 * Döndürme: Android'de yerel `rotation` (bitmap'e uygulanır, izleme kapalıyken de çalışır);
 * iOS Apple Maps'te `rotation` desteklenmediği için görsel stille döndürülür.
 */
export function CarMarker({ lat, lng, heading, title, description, animated = true, zIndex }: Props) {
  const markerRef = useRef<MapMarker>(null);
  const [shown, setShown] = useState({ latitude: lat, longitude: lng });
  // Android: özel görünüm bitmap'e çevrilir; görsel yüklendikten sonra izlemeyi kapatmak performans için şart
  const [tracks, setTracks] = useState(true);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = { latitude: lat, longitude: lng };
    if (!animated) {
      setShown(target);
      return;
    }
    markerRef.current?.animateMarkerToCoordinate(target, MOVE_MS);
    const timer = setTimeout(() => setShown(target), MOVE_MS);
    return () => clearTimeout(timer);
  }, [lat, lng, animated]);

  const rotate = heading ?? 0;
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
