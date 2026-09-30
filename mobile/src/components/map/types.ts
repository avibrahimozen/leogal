import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Platformdan bağımsız harita sözleşmesi.
 *
 * iOS/Android'de react-native-maps (index.tsx), web'de Leaflet + OpenStreetMap
 * (index.web.tsx) bu arayüzü uygular. Ekranlar yalnızca burada tanımlı prop ve
 * yöntemleri kullanır; böylece aynı ekran kodu üç platformda da çalışır.
 */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/** react-native-maps Region: merkez + görünür enlem/boylam aralığı */
export interface Region extends Coordinate {
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface EdgePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface MapHandle {
  animateToRegion(region: Region, durationMs?: number): void;
  fitToCoordinates(coordinates: Coordinate[], options?: { edgePadding?: EdgePadding; animated?: boolean }): void;
  animateCamera(camera: { center?: Coordinate; zoom?: number }, options?: { duration?: number }): void;
}

export interface MapViewProps {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  onRegionChangeComplete?: (region: Region) => void;
  /** Kullanıcı haritayı elle kaydırdığında (takip kamerasını durdurmak için) */
  onPanDrag?: () => void;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  children?: ReactNode;
}

export interface MarkerHandle {
  animateMarkerToCoordinate(coordinate: Coordinate, durationMs?: number): void;
}

export interface MarkerProps {
  coordinate: Coordinate;
  title?: string;
  description?: string;
  /** Varsayılan iğne rengi (children yoksa) */
  pinColor?: string;
  /** Özel görünümün konuma göre bağlanma noktası (0..1) */
  anchor?: { x: number; y: number };
  flat?: boolean;
  /** Android'de yerel döndürme; diğer platformlar görseli stille döndürür */
  rotation?: number;
  tracksViewChanges?: boolean;
  zIndex?: number;
  children?: ReactNode;
}

export interface PolylineProps {
  coordinates: Coordinate[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
}
