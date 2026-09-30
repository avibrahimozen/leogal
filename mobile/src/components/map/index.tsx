import type { ComponentType, RefAttributes } from 'react';
import RNMapView, { Marker as RNMarker, Polyline as RNPolyline } from 'react-native-maps';
import type { MapHandle, MapViewProps, MarkerHandle, MarkerProps, PolylineProps } from './types';

/**
 * iOS / Android harita: react-native-maps doğrudan kullanılır; yalnızca ortak
 * sözleşmeye (types.ts) daraltılmış tiplerle dışa açılır. Web sürümü index.web.tsx'te.
 */
export const MapView = RNMapView as unknown as ComponentType<MapViewProps & RefAttributes<MapHandle>>;
export const Marker = RNMarker as unknown as ComponentType<MarkerProps & RefAttributes<MarkerHandle>>;
export const Polyline = RNPolyline as unknown as ComponentType<PolylineProps>;

export type { Coordinate, EdgePadding, MapHandle, MapViewProps, MarkerHandle, MarkerProps, PolylineProps, Region } from './types';
