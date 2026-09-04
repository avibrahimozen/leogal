import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { reverseGeocode } from '../../api/geocode';
import { getSocket } from '../../api/socket';
import DestinationPicker from '../../components/DestinationPicker';
import { LocationPermissionCard } from '../../components/LocationPermissionCard';
import { MyLocationButton } from '../../components/MyLocationButton';
import { Badge, Button, Card, rideStatusLabel } from '../../components/ui';
import { DEFAULT_REGION, KKTC_CENTER, type Place } from '../../data/places';
import { regionForPoint } from '../../data/regions';
import { fetchEndedRide, useActiveRideSync } from '../../hooks/useActiveRideSync';
import { useCenterOnMe } from '../../hooks/useCenterOnMe';
import { useLocationPermission } from '../../hooks/useLocationPermission';
import { applyPassengerRideUpdate } from '../../logic/rideUpdates';
import { colors, radius, spacing } from '../../theme';
import type { GeoPoint, NearbyDriver, Ride, RideUpdatePayload } from '../../types';

type Coords = { lat: number; lng: number };

/** Alış noktası: GPS'ten gelir ya da kullanıcı elle seçer (manual). */
type PickupPoint = GeoPoint & { manual: boolean };

/** Seçici / haritadan seçim hedefi: alış noktası, varış noktası veya yeni durak. */
type Target = 'pickup' | 'drop' | 'stop';

const NEARBY_REFRESH_MS = 15_000;
/** Sunucuyla aynı sınır: bir çağrıda en fazla 5 ara durak */
const MAX_STOPS = 5;

const TARGET_TITLES: Record<Target, string> = { pickup: 'Nereden?', drop: 'Nereye?', stop: 'Durak ekle' };
const MAP_PICK_TITLES: Record<Target, string> = {
  pickup: 'Alış noktasını pime getir',
  drop: 'Hedefi pime getir',
  stop: 'Durağı pime getir',
};

/** Seçilen yeri sunucunun beklediği noktaya çevirir (adres = ad + şehir). */
function toGeoPoint(place: Place): GeoPoint {
  return { lat: place.lat, lng: place.lng, address: place.city ? `${place.name}, ${place.city}` : place.name };
}

const ACTIVE_STATUSES = new Set(['requested', 'accepted', 'arrived', 'in_progress']);

export default function PassengerHomeScreen() {
  const mapRef = useRef<MapView>(null);
  const [myLocation, setMyLocation] = useState<Coords>(KKTC_CENTER);
  const [ride, setRide] = useState<Ride | null>(null);
  // Socket işleyicileri güncel çağrıyı closure yerine buradan okur (bayat state'e düşmemek için)
  const rideRef = useRef<Ride | null>(null);
  const [driverPos, setDriverPos] = useState<Coords | null>(null);
  const [pickup, setPickup] = useState<PickupPoint>({ ...KKTC_CENTER, address: 'Mevcut Konum', manual: false });
  const [destination, setDestination] = useState<Place | null>(null);
  const [stops, setStops] = useState<GeoPoint[]>([]);
  const [estimate, setEstimate] = useState<{ distanceKm: number; fare: number } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<Target | null>(null);
  // Haritadan seçim modu: harita kaydırılır, ortadaki pim seçilen noktayı gösterir
  const [mapPick, setMapPick] = useState<Target | null>(null);
  const mapCenterRef = useRef<Coords>(KKTC_CENTER);
  const [busy, setBusy] = useState(false);
  const [ratingRide, setRatingRide] = useState<Ride | null>(null);
  const [nearby, setNearby] = useState<NearbyDriver[]>([]);
  const locationGranted = useLocationPermission();
  const insets = useSafeAreaInsets();
  // Tek dokunuşla konuma yakınlaş; bulunan konum alış noktasını da (GPS modundaysa) günceller
  const { centerOnMe, locating } = useCenterOnMe(mapRef, setMyLocation);

  /** Çağrı durumunu tek yerden günceller; çağrı yokken/aranırken sürücü konumu anlamsızdır. */
  const applyRide = useCallback((next: Ride | null) => {
    rideRef.current = next;
    setRide(next);
    if (!next || next.status === 'requested') setDriverPos(null);
  }, []);

  // Aktif çağrıyı sunucuyla eşitle (açılış, socket yeniden bağlanma, ön plana dönüş)
  const onSynced = useCallback(
    (fetched: Ride | null) => {
      const previous = rideRef.current;
      applyRide(fetched);
      if (!previous || fetched) return;
      // Biz dinlemezken bitmiş: sonucunu geçmişten öğren
      fetchEndedRide(previous.id).then((ended) => {
        if (ended?.status === 'completed') {
          setRatingRide(ended);
        } else if (ended?.cancelReason === 'no_driver') {
          Alert.alert('Sürücü bulunamadı', 'Yakında müsait sürücü yok. Biraz sonra tekrar dene.');
        }
      });
    },
    [applyRide],
  );
  useActiveRideSync(onSynced);

  // Aktif çağrı yokken alış noktasının çevresindeki çevrimiçi taksileri göster
  const hasRide = ride !== null;
  useEffect(() => {
    if (hasRide) {
      setNearby([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      api
        .get<{ drivers: NearbyDriver[] }>(`/public/nearby-drivers?lat=${pickup.lat}&lng=${pickup.lng}`)
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
  }, [hasRide, pickup.lat, pickup.lng]);

  // Konum izni verilince mevcut konuma git
  useEffect(() => {
    if (locationGranted !== true) return;
    let cancelled = false;
    Location.getCurrentPositionAsync({})
      .then((pos) => {
        if (cancelled) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(coords);
        mapRef.current?.animateToRegion(
          { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
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

  // Alış noktası elle seçilmediyse GPS'i izler; adres bir kez ters geocode edilir (kota dostu)
  const pickupIsManual = pickup.manual;
  useEffect(() => {
    if (pickupIsManual) return;
    let cancelled = false;
    setPickup((p) => (p.manual ? p : { ...p, lat: myLocation.lat, lng: myLocation.lng }));
    reverseGeocode(myLocation.lat, myLocation.lng).then((addr) => {
      if (!cancelled && addr) setPickup((p) => (p.manual ? p : { ...p, address: addr }));
    });
    return () => {
      cancelled = true;
    };
  }, [myLocation, pickupIsManual]);

  // Socket olaylarına abone ol
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onUpdate = (payload: RideUpdatePayload) => {
      const { ride: next, event } = applyPassengerRideUpdate(rideRef.current, payload);
      applyRide(next);
      if (!event) return;
      switch (event.type) {
        case 'completed':
          setRatingRide(event.ride);
          break;
        case 'no_driver':
          Alert.alert('Sürücü bulunamadı', 'Yakında müsait sürücü yok. Biraz sonra tekrar dene.');
          break;
        case 'reassigned':
          Alert.alert('Yeni sürücü aranıyor', 'Sürücü iptal etti, yeni sürücü aranıyor.');
          break;
      }
    };
    const onDriverLocation = (payload: { rideId?: number; lat: number; lng: number }) => {
      const current = rideRef.current;
      if (!current || current.status === 'requested') return;
      if (payload.rideId !== undefined && payload.rideId !== current.id) return;
      setDriverPos({ lat: payload.lat, lng: payload.lng });
    };

    socket.on('ride:update', onUpdate);
    socket.on('driver:location', onDriverLocation);
    return () => {
      socket.off('ride:update', onUpdate);
      socket.off('driver:location', onDriverLocation);
    };
  }, [applyRide]);

  // Rota değişince (alış, duraklar, hedef) ücret tahmini al
  useEffect(() => {
    if (!destination) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    setEstimate(null);
    api
      .post<{ distanceKm: number; fare: number }>('/rides/estimate', {
        pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address },
        drop: toGeoPoint(destination),
        stops,
      })
      .then((res) => {
        if (!cancelled) setEstimate(res);
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      });
    return () => {
      cancelled = true; // rota hızla değişirse eski tahmin yeniyi ezmesin
    };
  }, [destination, pickup.lat, pickup.lng, pickup.address, stops]);

  const requestRide = useCallback(async () => {
    if (!destination) return;
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride; noDriver?: boolean }>('/rides', {
        pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address },
        drop: toGeoPoint(destination),
        stops,
      });
      if (res.noDriver) {
        Alert.alert('Sürücü bulunamadı', 'Şu an çevrimiçi sürücü yok. Biraz sonra tekrar dene.');
      } else {
        applyRide(res.ride);
        setDestination(null);
        setStops([]);
      }
    } catch (e) {
      Alert.alert('Çağrı oluşturulamadı', e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }, [destination, pickup, stops, applyRide]);

  const cancelRide = useCallback(async () => {
    if (!ride) return;
    setBusy(true);
    try {
      await api.post(`/rides/${ride.id}/cancel`);
      applyRide(null);
    } catch (e) {
      Alert.alert('İptal edilemedi', e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }, [ride, applyRide]);

  /** Yolculuk sırasında durak listesini sunucuda günceller; sürücü anında görür. */
  const updateRideStops = useCallback(
    async (next: GeoPoint[]) => {
      const current = rideRef.current;
      if (!current) return;
      setBusy(true);
      try {
        const res = await api.put<{ ride: Ride }>(`/rides/${current.id}/stops`, { stops: next });
        applyRide(res.ride);
      } catch (e) {
        Alert.alert('Durak güncellenemedi', e instanceof Error ? e.message : 'Bir hata oluştu');
      } finally {
        setBusy(false);
      }
    },
    [applyRide],
  );

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

  const resetPickupToGps = useCallback(() => {
    setPickup({ lat: myLocation.lat, lng: myLocation.lng, address: 'Mevcut Konum', manual: false });
  }, [myLocation]);

  /** Seçilen noktayı hedefe göre yerleştirir (alış / varış / durak; çağrı sırasında durak sunucuya gider). */
  const placePoint = useCallback(
    (target: Target, point: GeoPoint) => {
      if (target === 'pickup') {
        setPickup({ ...point, manual: true });
        return;
      }
      if (target === 'drop') {
        setDestination({ name: point.address, city: '', country: regionForPoint(point.lat, point.lng), lat: point.lat, lng: point.lng });
        return;
      }
      const current = rideRef.current;
      if (current) {
        const existing = current.stops ?? [];
        if (existing.length >= MAX_STOPS) {
          Alert.alert('Durak sınırı', `En fazla ${MAX_STOPS} durak ekleyebilirsin.`);
          return;
        }
        void updateRideStops([...existing, point]);
        return;
      }
      setStops((prev) => (prev.length >= MAX_STOPS ? prev : [...prev, point]));
    },
    [updateRideStops],
  );

  const confirmMapPick = useCallback(async () => {
    const target = mapPick;
    if (!target) return;
    const c = mapCenterRef.current;
    setBusy(true);
    const addr = await reverseGeocode(c.lat, c.lng);
    setBusy(false);
    placePoint(target, { lat: c.lat, lng: c.lng, address: addr ?? 'Haritadan seçilen nokta' });
    setMapPick(null);
  }, [mapPick, placePoint]);

  // Harita üzerinde çizilecek rota: çağrı varsa sunucudaki, yoksa hazırlanan
  const rideStops = ride?.stops ?? [];
  const routePoints: GeoPoint[] = ride
    ? [ride.pickup, ...rideStops, ride.drop]
    : destination
      ? [{ lat: pickup.lat, lng: pickup.lng, address: pickup.address }, ...stops, toGeoPoint(destination)]
      : [];
  const shownStops = ride ? rideStops : stops;
  const canEditRideStops = ride !== null && ACTIVE_STATUSES.has(ride.status);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        onRegionChangeComplete={(region) => {
          mapCenterRef.current = { lat: region.latitude, lng: region.longitude };
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {(ride || pickup.manual) && (
          <Marker
            coordinate={{ latitude: ride ? ride.pickup.lat : pickup.lat, longitude: ride ? ride.pickup.lng : pickup.lng }}
            title={`Alış: ${ride ? ride.pickup.address : pickup.address}`}
            pinColor={colors.success}
          />
        )}
        {shownStops.map((s, i) => (
          <Marker
            key={`stop-${i}-${s.lat}-${s.lng}`}
            coordinate={{ latitude: s.lat, longitude: s.lng }}
            title={`${i + 1}. durak: ${s.address}`}
            pinColor={colors.orange}
          />
        ))}
        {routePoints.length > 0 && (
          <Marker
            coordinate={{ latitude: routePoints[routePoints.length - 1]!.lat, longitude: routePoints[routePoints.length - 1]!.lng }}
            title={ride ? ride.drop.address : destination?.name}
            pinColor={colors.ink}
          />
        )}
        {routePoints.length > 1 && (
          <Polyline
            coordinates={routePoints.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
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

      {mapPick && (
        <View style={styles.centerPin} pointerEvents="none">
          <Text style={{ fontSize: 40 }}>📍</Text>
        </View>
      )}

      <SafeAreaView style={styles.overlay} edges={['bottom']} pointerEvents="box-none">
        {locationGranted === false && <LocationPermissionCard />}

        {mapPick && (
          <Card>
            <Text style={styles.mapPickTitle}>{MAP_PICK_TITLES[mapPick]}</Text>
            <Text style={styles.nearbyText}>Haritayı kaydır; Türkiye ve Kıbrıs'ta herhangi bir noktayı seçebilirsin.</Text>
            <Button title="Bu Noktayı Seç" onPress={confirmMapPick} loading={busy} />
            <View style={{ height: spacing(2) }} />
            <Button title="Vazgeç" variant="outline" onPress={() => setMapPick(null)} />
          </Card>
        )}

        {!ride && !mapPick && (
          <Card>
            {!destination && (
              <Text style={styles.nearbyText}>
                {nearby.length === 0
                  ? 'Yakında çevrimiçi taksi yok'
                  : `Yakında ${nearby.length} taksi çevrimiçi · en yakını ~${nearby[0]?.distanceKm} km`}
              </Text>
            )}

            {/* Nereden */}
            <Pressable style={styles.routeRow} onPress={() => setPickerTarget('pickup')}>
              <Text style={styles.routeIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Nereden</Text>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {pickup.address}
                </Text>
              </View>
              {pickup.manual ? (
                <Pressable onPress={resetPickupToGps} hitSlop={8}>
                  <Text style={styles.linkText}>Konumum</Text>
                </Pressable>
              ) : (
                <Text style={styles.rowHint}>GPS</Text>
              )}
            </Pressable>

            {/* Duraklar */}
            {stops.map((s, i) => (
              <View key={`prestop-${i}`} style={styles.routeRow}>
                <Text style={styles.routeIcon}>🟠</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{i + 1}. durak</Text>
                  <Text style={styles.rowValue} numberOfLines={1}>
                    {s.address}
                  </Text>
                </View>
                <Pressable onPress={() => setStops((prev) => prev.filter((_, j) => j !== i))} hitSlop={8}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            ))}

            {/* Nereye */}
            <Pressable style={styles.routeRow} onPress={() => setPickerTarget('drop')}>
              <Text style={styles.routeIcon}>🏁</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Nereye</Text>
                <Text style={destination ? styles.rowValue : styles.rowPlaceholder} numberOfLines={1}>
                  {destination
                    ? destination.city
                      ? `${destination.name} · ${destination.city}`
                      : destination.name
                    : 'Hedef seç (ara, hızlı yerler veya haritadan)'}
                </Text>
              </View>
            </Pressable>

            {stops.length < MAX_STOPS && (
              <Pressable onPress={() => setPickerTarget('stop')} hitSlop={6} style={styles.addStopRow}>
                <Text style={styles.linkText}>+ Durak ekle ({stops.length}/{MAX_STOPS})</Text>
              </Pressable>
            )}

            {destination && (
              <>
                <View style={styles.estimateRow}>
                  <View>
                    <Text style={styles.estimateLabel}>Tahmini ücret</Text>
                    <Text style={styles.estimateFare}>{estimate ? `${estimate.fare} TL` : '...'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.estimateLabel}>Mesafe</Text>
                    <Text style={styles.estimateKm}>{estimate ? `~${estimate.distanceKm.toFixed(1)} km` : '...'}</Text>
                  </View>
                </View>
                <Button title="🚕 Taksi Çağır" onPress={requestRide} loading={busy} disabled={!estimate} />
              </>
            )}
          </Card>
        )}

        {ride && !mapPick && (
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
                    onPress={() => {
                      Linking.openURL(`tel:${ride.driver?.phone}`).catch(() => {});
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>📞</Text>
                  </Pressable>
                </View>
              )
            )}
            <Text style={styles.routeText} numberOfLines={1}>
              📍 {ride.pickup.address} → 🏁 {ride.drop.address}
            </Text>
            {rideStops.map((s, i) => (
              <View key={`ridestop-${i}`} style={styles.stopLine}>
                <Text style={styles.stopText} numberOfLines={1}>
                  🟠 {i + 1}. durak: {s.address}
                </Text>
                {canEditRideStops && (
                  <Pressable
                    onPress={() => updateRideStops(rideStops.filter((_, j) => j !== i))}
                    hitSlop={8}
                    disabled={busy}
                  >
                    <Text style={styles.removeText}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}
            {canEditRideStops && rideStops.length < MAX_STOPS && (
              <Pressable onPress={() => setPickerTarget('stop')} hitSlop={6} style={styles.addStopRow} disabled={busy}>
                <Text style={styles.linkText}>+ Durak ekle ({rideStops.length}/{MAX_STOPS})</Text>
              </Pressable>
            )}
            {ride.status !== 'in_progress' && (
              <Button title="Çağrıyı İptal Et" variant="outline" onPress={cancelRide} loading={busy} />
            )}
          </Card>
        )}
      </SafeAreaView>

      <MyLocationButton onPress={centerOnMe} busy={locating} style={{ top: insets.top + 12 }} />

      {/* Yer seçici: OpenStreetMap araması + KKTC hızlı yerler + haritadan seçim (+ alış için GPS) */}
      <DestinationPicker
        visible={pickerTarget !== null}
        title={pickerTarget ? TARGET_TITLES[pickerTarget] : 'Nereye?'}
        mapHint={pickerTarget === 'pickup' ? 'Alış noktasını haritada işaretle' : pickerTarget === 'stop' ? 'Durağı haritada işaretle' : 'Hedefi haritada işaretle'}
        onClose={() => setPickerTarget(null)}
        onSelect={(place) => {
          const target = pickerTarget;
          setPickerTarget(null);
          if (!target) return;
          if (target === 'drop') setDestination(place);
          else placePoint(target, toGeoPoint(place));
        }}
        onPickOnMap={() => {
          const target = pickerTarget;
          setPickerTarget(null);
          if (target) setMapPick(target);
        }}
        onUseCurrentLocation={
          pickerTarget === 'pickup'
            ? () => {
                setPickerTarget(null);
                resetPickupToGps();
              }
            : undefined
        }
      />

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
  nearbyText: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: spacing(2.5) },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    marginBottom: spacing(2),
    minHeight: 52,
  },
  routeIcon: { marginRight: spacing(2.5), fontSize: 16 },
  rowLabel: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  rowValue: { fontSize: 15, color: colors.ink, fontWeight: '600', marginTop: 1 },
  rowPlaceholder: { fontSize: 15, color: colors.muted, marginTop: 1 },
  rowHint: { fontSize: 12, color: colors.muted, fontWeight: '600', marginLeft: spacing(2) },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.info },
  removeText: { fontSize: 16, fontWeight: '700', color: colors.danger, paddingHorizontal: spacing(2) },
  addStopRow: { alignSelf: 'flex-start', paddingVertical: spacing(1), marginBottom: spacing(1) },
  stopLine: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(1.5) },
  stopText: { flex: 1, fontSize: 13, color: colors.inkSoft },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing(3),
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
  routeText: { fontSize: 13, color: colors.inkSoft, marginBottom: spacing(2) },
  centerPin: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40, // pimin ucu harita merkezine gelsin
  },
  mapPickTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: spacing(1) },
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
