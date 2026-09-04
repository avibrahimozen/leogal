import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { LocationPermissionCard } from '../components/LocationPermissionCard';
import { Button, Card } from '../components/ui';
import { KKTC_CENTER } from '../data/places';
import { useLocationPermission } from '../hooks/useLocationPermission';
import { colors, spacing } from '../theme';
import type { AuthStackParamList } from '../navigation/types';
import type { NearbyDriver } from '../types';

type Props = NativeStackScreenProps<AuthStackParamList, 'GuestMap'>;

const REFRESH_MS = 10_000;

/** Üyelik gerektirmeyen harita: çevredeki çevrimiçi taksileri gösterir. */
export default function GuestMapScreen({ navigation }: Props) {
  const mapRef = useRef<MapView>(null);
  const [center, setCenter] = useState(KKTC_CENTER);
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const locationGranted = useLocationPermission();

  // Konum izni verilince mevcut konuma git
  useEffect(() => {
    if (locationGranted !== true) return;
    let cancelled = false;
    Location.getCurrentPositionAsync({})
      .then((pos) => {
        if (cancelled) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(coords);
        mapRef.current?.animateToRegion(
          { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 },
          600,
        );
      })
      .catch(() => {
        // Konum alınamazsa Lefkoşa merkezli kalır
      });
    return () => {
      cancelled = true;
    };
  }, [locationGranted]);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ count: number; drivers: NearbyDriver[] }>(
        `/public/nearby-drivers?lat=${center.lat}&lng=${center.lng}`,
      );
      setDrivers(res.drivers);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sunucuya ulaşılamıyor');
    } finally {
      setLoaded(true);
    }
  }, [center]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const nearest = drivers[0];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: KKTC_CENTER.lat,
          longitude: KKTC_CENTER.lng,
          latitudeDelta: 0.35,
          longitudeDelta: 0.35,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {drivers.map((d, i) => (
          <Marker key={`${d.lat}-${d.lng}-${i}`} coordinate={{ latitude: d.lat, longitude: d.lng }} title={d.vehicleModel}>
            <Text style={{ fontSize: 28 }}>🚕</Text>
          </Marker>
        ))}
      </MapView>

      <SafeAreaView style={styles.overlay} edges={['bottom']} pointerEvents="box-none">
        {locationGranted === false && <LocationPermissionCard />}
        <Card>
          {error !== '' ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <>
              <Text style={styles.count}>
                {!loaded ? 'Taksiler aranıyor...' : drivers.length === 0 ? 'Şu an yakında çevrimiçi taksi yok' : `Yakında ${drivers.length} taksi çevrimiçi`}
              </Text>
              {nearest && (
                <Text style={styles.meta}>
                  En yakını ~{nearest.distanceKm} km uzakta · {nearest.vehicleModel}
                </Text>
              )}
            </>
          )}
          <View style={{ height: spacing(4) }} />
          <Button title="Taksi Çağırmak İçin Giriş Yap" onPress={() => navigation.navigate('Login')} />
          <View style={{ height: spacing(2) }} />
          <Button title="Hesap Oluştur" variant="outline" onPress={() => navigation.navigate('Register')} />
        </Card>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    padding: spacing(4),
  },
  count: { fontSize: 18, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 13, color: colors.muted, marginTop: spacing(1) },
  errorText: { fontSize: 14, color: colors.danger, fontWeight: '600' },
});
