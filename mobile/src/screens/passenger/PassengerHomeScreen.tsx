import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { getSocket } from '../../api/socket';
import { Badge, Button, Card, rideStatusLabel } from '../../components/ui';
import { KKTC_CENTER, PLACES, type Place } from '../../data/places';
import { colors, radius, spacing } from '../../theme';
import type { NearbyDriver, Ride } from '../../types';

type Coords = { lat: number; lng: number };

const NEARBY_REFRESH_MS = 15_000;

export default function PassengerHomeScreen() {
  const mapRef = useRef<MapView>(null);
  const [myLocation, setMyLocation] = useState<Coords>(KKTC_CENTER);
  const [ride, setRide] = useState<Ride | null>(null);
  const [driverPos, setDriverPos] = useState<Coords | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [estimate, setEstimate] = useState<{ distanceKm: number; fare: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [ratingRide, setRatingRide] = useState<Ride | null>(null);
  const [nearby, setNearby] = useState<NearbyDriver[]>([]);

  // Aktif çağrı yokken çevredeki çevrimiçi taksileri göster
  useEffect(() => {
    if (ride) {
      setNearby([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .get<{ drivers: NearbyDriver[] }>(`/public/nearby-drivers?lat=${myLocation.lat}&lng=${myLocation.lng}`)
        .then((res) => {
          if (!cancelled) setNearby(res.drivers);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, NEARBY_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ride, myLocation]);

  // Konum izni + mevcut konum
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const pos = await Location.getCurrentPositionAsync({});
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(coords);
        mapRef.current?.animateToRegion(
          { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
          600,
        );
      } catch {
        // Konum alınamazsa Lefkoşa merkezli kalır
      }
    })();
  }, []);

  // Aktif çağrıyı yükle + socket olaylarına abone ol
  useEffect(() => {
    api
      .get<{ ride: Ride | null }>('/rides/active')
      .then((res) => setRide(res.ride))
      .catch(() => {});

    const socket = getSocket();
    if (!socket) return;

    const onUpdate = (payload: { ride: Ride }) => {
      const updated = payload.ride;
      setRide((current) => {
        if (current && updated.id !== current.id) return current;
        if (updated.status === 'completed') {
          setRatingRide(updated);
          setDriverPos(null);
          return null;
        }
        if (updated.status === 'cancelled') {
          setDriverPos(null);
          if (updated.cancelReason === 'no_driver') {
            Alert.alert('Sürücü bulunamadı', 'Yakında müsait sürücü yok. Biraz sonra tekrar dene.');
          } else if (updated.cancelReason === 'driver_cancelled') {
            Alert.alert('Sürücü iptal etti', 'Sürücün çağrıyı iptal etti.');
          }
          return null;
        }
        return updated;
      });
    };
    const onDriverLocation = (payload: { lat: number; lng: number }) => {
      setDriverPos({ lat: payload.lat, lng: payload.lng });
    };

    socket.on('ride:update', onUpdate);
    socket.on('driver:location', onDriverLocation);
    return () => {
      socket.off('ride:update', onUpdate);
      socket.off('driver:location', onDriverLocation);
    };
  }, []);

  // Hedef seçilince ücret tahmini al
  useEffect(() => {
    if (!destination) {
      setEstimate(null);
      return;
    }
    api
      .post<{ distanceKm: number; fare: number }>('/rides/estimate', {
        pickup: { ...myLocation, address: 'Mevcut Konum' },
        drop: { lat: destination.lat, lng: destination.lng, address: destination.name },
      })
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [destination, myLocation]);

  const requestRide = useCallback(async () => {
    if (!destination) return;
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride; noDriver?: boolean }>('/rides', {
        pickup: { ...myLocation, address: 'Mevcut Konum' },
        drop: { lat: destination.lat, lng: destination.lng, address: destination.name },
      });
      if (res.noDriver) {
        Alert.alert('Sürücü bulunamadı', 'Şu an çevrimiçi sürücü yok. Biraz sonra tekrar dene.');
      } else {
        setRide(res.ride);
        setDestination(null);
      }
    } catch (e) {
      Alert.alert('Çağrı oluşturulamadı', e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }, [destination, myLocation]);

  const cancelRide = useCallback(async () => {
    if (!ride) return;
    setBusy(true);
    try {
      await api.post(`/rides/${ride.id}/cancel`);
      setRide(null);
      setDriverPos(null);
    } catch (e) {
      Alert.alert('İptal edilemedi', e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }, [ride]);

  const submitRating = useCallback(
    async (rating: number) => {
      if (!ratingRide) return;
      try {
        await api.post(`/rides/${ratingRide.id}/rate`, { rating });
      } catch {
        // Puanlama başarısız olsa da akışı bloklama
      }
      setRatingRide(null);
    },
    [ratingRide],
  );

  const filteredPlaces = PLACES.filter(
    (p) =>
      p.name.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')) ||
      p.city.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr')),
  );

  const activeDrop = ride ? ride.drop : destination ? { lat: destination.lat, lng: destination.lng } : null;

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
        {activeDrop && (
          <Marker
            coordinate={{ latitude: activeDrop.lat, longitude: activeDrop.lng }}
            title={ride ? ride.drop.address : destination?.name}
            pinColor={colors.ink}
          />
        )}
        {activeDrop && (
          <Polyline
            coordinates={[
              { latitude: ride ? ride.pickup.lat : myLocation.lat, longitude: ride ? ride.pickup.lng : myLocation.lng },
              { latitude: activeDrop.lat, longitude: activeDrop.lng },
            ]}
            strokeColor={colors.ink}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}
        {ride && driverPos && (
          <Marker
            coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }}
            title={`${ride.driver?.name ?? 'Sürücü'} · ${ride.driver?.vehiclePlate ?? ''}`}
          >
            <Text style={{ fontSize: 30 }}>🚕</Text>
          </Marker>
        )}
        {!ride &&
          nearby.map((d, i) => (
            <Marker
              key={`nearby-${d.lat}-${d.lng}-${i}`}
              coordinate={{ latitude: d.lat, longitude: d.lng }}
              title={d.vehicleModel}
              tracksViewChanges={false}
            >
              <Text style={{ fontSize: 26 }}>🚕</Text>
            </Marker>
          ))}
      </MapView>

      <SafeAreaView style={styles.overlay} edges={['bottom']} pointerEvents="box-none">
        {!ride && (
          <Card>
            {!destination && (
              <Text style={styles.nearbyText}>
                {nearby.length === 0
                  ? 'Yakında çevrimiçi taksi yok'
                  : `Yakında ${nearby.length} taksi çevrimiçi · en yakını ~${nearby[0]?.distanceKm} km`}
              </Text>
            )}
            <Pressable style={styles.searchBox} onPress={() => setPickerOpen(true)}>
              <Text style={styles.searchIcon}>🔍</Text>
              <Text style={destination ? styles.searchTextActive : styles.searchText}>
                {destination ? `${destination.name} · ${destination.city}` : 'Nereye gitmek istiyorsun?'}
              </Text>
            </Pressable>
            {destination && (
              <>
                <View style={styles.estimateRow}>
                  <View>
                    <Text style={styles.estimateLabel}>Tahmini ücret</Text>
                    <Text style={styles.estimateFare}>
                      {estimate ? `${estimate.fare} TL` : '...'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.estimateLabel}>Mesafe</Text>
                    <Text style={styles.estimateKm}>
                      {estimate ? `~${estimate.distanceKm.toFixed(1)} km` : '...'}
                    </Text>
                  </View>
                </View>
                <Button title="🚕 Taksi Çağır" onPress={requestRide} loading={busy} disabled={!estimate} />
              </>
            )}
          </Card>
        )}

        {ride && (
          <Card>
            <View style={styles.rideHeader}>
              <Badge {...toBadge(ride.status)} />
              <Text style={styles.rideFare}>{ride.estFare} TL</Text>
            </View>
            {ride.status === 'requested' ? (
              <View style={styles.searching}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.searchingText}>Sana en yakın sürücü aranıyor...</Text>
              </View>
            ) : (
              ride.driver && (
                <View style={styles.driverRow}>
                  <View style={styles.driverAvatar}>
                    <Text style={{ fontSize: 24 }}>🚕</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driverName}>{ride.driver.name}</Text>
                    <Text style={styles.driverMeta}>
                      {ride.driver.vehicleModel} · {ride.driver.vehiclePlate}
                      {ride.driver.rating ? ` · ⭐ ${ride.driver.rating}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.callButton}
                    onPress={() => Linking.openURL(`tel:${ride.driver?.phone}`)}
                  >
                    <Text style={{ fontSize: 18 }}>📞</Text>
                  </Pressable>
                </View>
              )
            )}
            <Text style={styles.routeText} numberOfLines={1}>
              📍 {ride.pickup.address} → {ride.drop.address}
            </Text>
            {ride.status !== 'in_progress' && (
              <Button title="Çağrıyı İptal Et" variant="outline" onPress={cancelRide} loading={busy} />
            )}
          </Card>
        )}
      </SafeAreaView>

      {/* Hedef seçici */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <SafeAreaView style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Nereye?</Text>
            <Pressable onPress={() => setPickerOpen(false)}>
              <Text style={styles.pickerClose}>Kapat</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.pickerSearch}
            placeholder="Yer veya şehir ara..."
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <FlatList
            data={filteredPlaces}
            keyExtractor={(item) => item.name}
            renderItem={({ item }) => (
              <Pressable
                style={styles.placeRow}
                onPress={() => {
                  setDestination(item);
                  setPickerOpen(false);
                  setSearch('');
                }}
              >
                <Text style={styles.placeName}>{item.name}</Text>
                <Text style={styles.placeCity}>{item.city}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>Sonuç bulunamadı. Başka bir arama dene.</Text>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Puanlama */}
      <Modal visible={ratingRide !== null} transparent animationType="fade">
        <View style={styles.ratingBackdrop}>
          <Card style={styles.ratingCard}>
            <Text style={styles.ratingTitle}>Yolculuk tamamlandı 🎉</Text>
            <Text style={styles.ratingFare}>{ratingRide?.finalFare ?? ratingRide?.estFare} TL</Text>
            <Text style={styles.ratingSubtitle}>Sürücünü puanla</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => submitRating(star)}>
                  <Text style={styles.star}>⭐</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setRatingRide(null)}>
              <Text style={styles.skipText}>Şimdilik geç</Text>
            </Pressable>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

function toBadge(status: string) {
  const { label, tone } = rideStatusLabel(status);
  return { text: label, tone };
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: spacing(3.5),
    height: 52,
  },
  searchIcon: { marginRight: spacing(2.5), fontSize: 16 },
  nearbyText: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: spacing(2.5) },
  searchText: { fontSize: 16, color: colors.muted },
  searchTextActive: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing(4),
  },
  estimateLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  estimateFare: { fontSize: 28, fontWeight: '800', color: colors.ink },
  estimateKm: { fontSize: 18, fontWeight: '700', color: colors.inkSoft, marginTop: spacing(1) },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  rideFare: { fontSize: 20, fontWeight: '800', color: colors.ink },
  searching: { alignItems: 'center', paddingVertical: spacing(4) },
  searchingText: { marginTop: spacing(3), color: colors.inkSoft, fontSize: 15, fontWeight: '600' },
  driverRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(3) },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  driverName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  driverMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeText: { fontSize: 13, color: colors.inkSoft, marginBottom: spacing(3) },
  pickerContainer: { flex: 1, backgroundColor: colors.bg },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing(4),
  },
  pickerTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  pickerClose: { fontSize: 15, fontWeight: '600', color: colors.info },
  pickerSearch: {
    marginHorizontal: spacing(4),
    marginBottom: spacing(2),
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: spacing(3.5),
    fontSize: 16,
    color: colors.ink,
  },
  placeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  placeName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  placeCity: { fontSize: 13, color: colors.muted },
  emptyText: { textAlign: 'center', color: colors.muted, marginTop: spacing(8) },
  ratingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center',
    padding: spacing(6),
  },
  ratingCard: { alignItems: 'center', paddingVertical: spacing(6) },
  ratingTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  ratingFare: { fontSize: 32, fontWeight: '800', color: colors.success, marginVertical: spacing(2) },
  ratingSubtitle: { fontSize: 14, color: colors.muted, marginBottom: spacing(3) },
  starsRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(4) },
  star: { fontSize: 36 },
  skipText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
});
