import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { getSocket } from '../../api/socket';
import { LocationPermissionCard } from '../../components/LocationPermissionCard';
import { Badge, Button, Card, rideStatusLabel } from '../../components/ui';
import { KKTC_CENTER } from '../../data/places';
import { fetchEndedRide, useActiveRideSync } from '../../hooks/useActiveRideSync';
import { useLocationPermission } from '../../hooks/useLocationPermission';
import { applyDriverRideUpdate } from '../../logic/rideUpdates';
import { useAuth } from '../../store/auth';
import { colors, radius, spacing } from '../../theme';
import type { Ride, RideOffer, RideUpdatePayload } from '../../types';

export default function DriverHomeScreen() {
  const { user, refreshUser } = useAuth();
  const [online, setOnline] = useState(user?.driver?.isOnline ?? false);
  const [ride, setRide] = useState<Ride | null>(null);
  // Socket işleyicileri güncel çağrıyı closure yerine buradan okur (bayat state'e düşmemek için)
  const rideRef = useRef<Ride | null>(null);
  const [offer, setOffer] = useState<RideOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [ratingRide, setRatingRide] = useState<Ride | null>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);
  const locationGranted = useLocationPermission();

  const approved = user?.driver?.status === 'approved';

  const applyRide = useCallback((next: Ride | null) => {
    rideRef.current = next;
    setRide(next);
  }, []);

  // Aktif çağrıyı sunucuyla eşitle (açılış, socket yeniden bağlanma, ön plana dönüş)
  const onSynced = useCallback(
    (fetched: Ride | null) => {
      const previous = rideRef.current;
      applyRide(fetched);
      if (!previous || fetched) return;
      // Biz dinlemezken kapanmış: yolcu iptal ettiyse haber ver
      fetchEndedRide(previous.id).then((ended) => {
        if (ended?.status === 'cancelled' && ended.cancelReason === 'passenger_cancelled') {
          Alert.alert('Çağrı iptal edildi', 'Yolcu çağrıyı iptal etti.');
        }
      });
    },
    [applyRide],
  );
  useActiveRideSync(onSynced);

  // Socket abonelikleri
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onOffer = (payload: RideOffer) => {
      // Aktif çağrısı olan sürücüye teklif gösterme
      if (rideRef.current) return;
      setOffer(payload);
    };
    const onOfferClosed = (payload: { rideId: number }) => {
      setOffer((current) => (current?.rideId === payload.rideId ? null : current));
    };
    const onUpdate = (payload: RideUpdatePayload) => {
      const { ride: next, event } = applyDriverRideUpdate(rideRef.current, payload);
      applyRide(next);
      if (event === 'passenger_cancelled') {
        Alert.alert('Çağrı iptal edildi', 'Yolcu çağrıyı iptal etti.');
      }
    };
    const onDriverStatus = () => {
      refreshUser().catch(() => {});
    };

    socket.on('ride:offer', onOffer);
    socket.on('ride:offer_closed', onOfferClosed);
    socket.on('ride:update', onUpdate);
    socket.on('driver:status', onDriverStatus);
    return () => {
      socket.off('ride:offer', onOffer);
      socket.off('ride:offer_closed', onOfferClosed);
      socket.off('ride:update', onUpdate);
      socket.off('driver:status', onDriverStatus);
    };
  }, [applyRide, refreshUser]);

  // Çevrimiçiyken konum yayını (10 sn / 100 m aralıkla)
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted || cancelled) return;
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 100 },
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('driver:location', coords);
          } else {
            api.post('/driver/location', coords).catch(() => {});
          }
        },
      );
      if (cancelled) {
        // Beklerken çevrimdışı olundu: izleyiciyi sızdırma
        subscription.remove();
        return;
      }
      watcher.current = subscription;
    })().catch(() => {
      // Konum izlenemedi (izin yok / servis kapalı); uyarı kartı kullanıcıyı yönlendirir
    });
    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [online]);

  const toggleOnline = useCallback(async (value: boolean) => {
    if (value) {
      // Konum izni olmadan çevrimiçi olmak anlamsız: çağrı eşleştirme konuma dayanır
      const permission = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!permission?.granted) {
        Alert.alert(
          'Konum izni gerekli',
          "Çevrimiçi olup çağrı alabilmek için konum iznine ihtiyaç var. Ayarlar'dan izin ver.",
          [
            { text: 'Vazgeç', style: 'cancel' },
            {
              text: "Ayarlar'ı Aç",
              onPress: () => {
                Linking.openSettings().catch(() => {});
              },
            },
          ],
        );
        return;
      }
    }
    try {
      await api.post('/driver/status', { online: value });
      setOnline(value);
    } catch (e) {
      Alert.alert('Olmadı', e instanceof Error ? e.message : 'Bir hata oluştu');
    }
  }, []);

  const acceptOffer = useCallback(async () => {
    if (!offer) return;
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride }>(`/rides/${offer.rideId}/accept`);
      applyRide(res.ride);
      setOffer(null);
    } catch (e) {
      setOffer(null);
      Alert.alert('Çağrı kaçtı', e instanceof Error ? e.message : 'Çağrı başka sürücüye gitti');
    } finally {
      setBusy(false);
    }
  }, [offer, applyRide]);

  const advanceRide = useCallback(async () => {
    if (!ride) return;
    const nextAction =
      ride.status === 'accepted' ? 'arrived' : ride.status === 'arrived' ? 'start' : 'complete';
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride }>(`/rides/${ride.id}/${nextAction}`);
      if (res.ride.status === 'completed') {
        applyRide(null);
        setRatingRide(res.ride);
      } else {
        applyRide(res.ride);
      }
    } catch (e) {
      Alert.alert('Olmadı', e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }, [ride, applyRide]);

  const cancelRide = useCallback(async () => {
    if (!ride) return;
    Alert.alert('Çağrıyı iptal et', 'Bu çağrıyı iptal etmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal Et',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post(`/rides/${ride.id}/cancel`);
            applyRide(null);
          } catch (e) {
            Alert.alert('Olmadı', e instanceof Error ? e.message : 'Bir hata oluştu');
          }
        },
      },
    ]);
  }, [ride, applyRide]);

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

  const advanceLabel =
    ride?.status === 'accepted'
      ? '📍 Alış Noktasına Vardım'
      : ride?.status === 'arrived'
        ? '▶️ Yolculuğu Başlat'
        : '✅ Yolculuğu Tamamla';

  return (
    <View style={styles.container}>
      <MapView
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
        {ride && (
          <>
            <Marker
              coordinate={{ latitude: ride.pickup.lat, longitude: ride.pickup.lng }}
              title={`Alış: ${ride.pickup.address}`}
              pinColor={colors.success}
            />
            <Marker
              coordinate={{ latitude: ride.drop.lat, longitude: ride.drop.lng }}
              title={`Varış: ${ride.drop.address}`}
              pinColor={colors.ink}
            />
            {(ride.stops ?? []).map((stop, i) => (
              <Marker
                key={`stop-${i}-${stop.lat}-${stop.lng}`}
                coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                title={`${i + 1}. durak: ${stop.address}`}
                pinColor={colors.orange}
              />
            ))}
          </>
        )}
      </MapView>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        {/* Üst durum çubuğu */}
        <Card style={styles.statusBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>{online ? 'Çevrimiçisin 🟢' : 'Çevrimdışısın'}</Text>
            <Text style={styles.statusSub}>
              {approved
                ? online
                  ? 'Çağrılar sana yönlendiriliyor'
                  : 'Çağrı almak için çevrimiçi ol'
                : user?.driver?.status === 'pending'
                  ? 'Hesabın onay bekliyor'
                  : 'Hesabın aktif değil'}
            </Text>
          </View>
          <Switch
            value={online}
            onValueChange={toggleOnline}
            disabled={!approved}
            trackColor={{ true: colors.success, false: colors.line }}
            thumbColor="#fff"
          />
        </Card>

        {locationGranted === false && (
          <LocationPermissionCard style={{ marginTop: spacing(3), marginBottom: 0 }} />
        )}

        <View style={{ flex: 1 }} pointerEvents="box-none" />

        {/* Aktif çağrı kartı */}
        {ride && (
          <Card>
            <View style={styles.rideHeader}>
              <Badge {...toBadge(ride.status)} />
              <Text style={styles.rideFare}>{ride.estFare} TL</Text>
            </View>
            <View style={styles.passengerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.passengerName}>{ride.passenger.name}</Text>
                <Text style={styles.routeText}>
                  📍 {ride.pickup.address}
                  {(ride.stops ?? []).map((stop, i) => `\n🟠 ${i + 1}. durak: ${stop.address}`).join('')}
                  {'\n'}🏁 {ride.drop.address} · ~{ride.estDistanceKm.toFixed(1)} km
                </Text>
              </View>
              <Pressable
                style={styles.callButton}
                onPress={() => {
                  Linking.openURL(`tel:${ride.passenger.phone}`).catch(() => {});
                }}
              >
                <Text style={{ fontSize: 18 }}>📞</Text>
              </Pressable>
            </View>
            <Button title={advanceLabel} onPress={advanceRide} loading={busy} />
            {ride.status !== 'in_progress' && (
              <>
                <View style={{ height: spacing(2) }} />
                <Button title="İptal Et" variant="outline" onPress={cancelRide} />
              </>
            )}
          </Card>
        )}
      </SafeAreaView>

      {/* Gelen çağrı teklifi */}
      <Modal visible={offer !== null} transparent animationType="slide">
        <View style={styles.offerBackdrop}>
          <Card style={styles.offerCard}>
            <Text style={styles.offerTitle}>Yeni Çağrı! 🚨</Text>
            <Text style={styles.offerFare}>{offer?.estFare} TL</Text>
            <View style={styles.offerDetails}>
              <Text style={styles.offerRow}>📍 {offer?.pickup.address}</Text>
              <Text style={styles.offerRow}>🏁 {offer?.drop.address}</Text>
              {(offer?.stops?.length ?? 0) > 0 && (
                <Text style={styles.offerRow}>🟠 {offer?.stops?.length} ara durak</Text>
              )}
              <Text style={styles.offerMeta}>
                Yolcuya uzaklığın ~{offer?.pickupDistanceKm} km · Yolculuk ~
                {offer?.estDistanceKm.toFixed(1)} km
              </Text>
            </View>
            <Button title="Çağrıyı Kabul Et" onPress={acceptOffer} loading={busy} />
            <View style={{ height: spacing(2) }} />
            <Button title="Reddet" variant="outline" onPress={() => setOffer(null)} />
          </Card>
        </View>
      </Modal>

      {/* Yolcu puanlama */}
      <Modal visible={ratingRide !== null} transparent animationType="fade">
        <View style={styles.offerBackdrop}>
          <Card style={styles.ratingCard}>
            <Text style={styles.offerTitle}>Yolculuk tamamlandı ✅</Text>
            <Text style={styles.offerFare}>{ratingRide?.finalFare ?? ratingRide?.estFare} TL</Text>
            <Text style={styles.ratingSubtitle}>Yolcuyu puanla</Text>
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
    padding: spacing(4),
  },
  statusBar: { flexDirection: 'row', alignItems: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  statusSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  rideFare: { fontSize: 20, fontWeight: '800', color: colors.ink },
  passengerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(3) },
  passengerName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  routeText: { fontSize: 13, color: colors.inkSoft, marginTop: spacing(1), lineHeight: 20 },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing(2),
  },
  offerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center',
    padding: spacing(6),
  },
  offerCard: { paddingVertical: spacing(6) },
  offerTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  offerFare: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.success,
    textAlign: 'center',
    marginVertical: spacing(2),
  },
  offerDetails: { marginBottom: spacing(4) },
  offerRow: { fontSize: 15, color: colors.ink, fontWeight: '600', marginBottom: spacing(1.5) },
  offerMeta: { fontSize: 13, color: colors.muted, marginTop: spacing(1) },
  ratingCard: { alignItems: 'center', paddingVertical: spacing(6) },
  ratingSubtitle: { fontSize: 14, color: colors.muted, marginBottom: spacing(3) },
  starsRow: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(4) },
  star: { fontSize: 36 },
  skipText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
});
