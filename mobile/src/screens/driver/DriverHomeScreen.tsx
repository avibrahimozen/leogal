import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { getSocket } from '../../api/socket';
import { Badge, Button, Card, rideStatusLabel } from '../../components/ui';
import { KKTC_CENTER } from '../../data/places';
import { useAuth } from '../../store/auth';
import { colors, radius, spacing } from '../../theme';
import type { Ride, RideOffer } from '../../types';

export default function DriverHomeScreen() {
  const { user, refreshUser } = useAuth();
  const [online, setOnline] = useState(user?.driver?.isOnline ?? false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [offer, setOffer] = useState<RideOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const [myPos, setMyPos] = useState(KKTC_CENTER);
  const [ratingRide, setRatingRide] = useState<Ride | null>(null);
  const watcher = useRef<Location.LocationSubscription | null>(null);

  const approved = user?.driver?.status === 'approved';

  // Aktif çağrı + socket abonelikleri
  useEffect(() => {
    api
      .get<{ ride: Ride | null }>('/rides/active')
      .then((res) => setRide(res.ride))
      .catch(() => {});

    const socket = getSocket();
    if (!socket) return;

    const onOffer = (payload: RideOffer) => {
      // Aktif çağrısı olan sürücüye teklif gösterme
      setRide((current) => {
        if (!current) setOffer(payload);
        return current;
      });
    };
    const onOfferClosed = (payload: { rideId: number }) => {
      setOffer((current) => (current?.rideId === payload.rideId ? null : current));
    };
    const onUpdate = (payload: { ride: Ride }) => {
      const updated = payload.ride;
      setRide((current) => {
        if (current && updated.id !== current.id) return current;
        if (updated.status === 'cancelled') {
          Alert.alert('Çağrı iptal edildi', 'Yolcu çağrıyı iptal etti.');
          return null;
        }
        if (updated.status === 'completed') return null;
        return updated;
      });
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
  }, [refreshUser]);

  // Çevrimiçiyken konum yayını (10 sn / 100 m aralıkla)
  useEffect(() => {
    if (!online) {
      watcher.current?.remove();
      watcher.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      watcher.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 100 },
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMyPos(coords);
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('driver:location', coords);
          } else {
            api.post('/driver/location', coords).catch(() => {});
          }
        },
      );
    })();
    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [online]);

  const toggleOnline = useCallback(
    async (value: boolean) => {
      try {
        await api.post('/driver/status', { online: value });
        setOnline(value);
      } catch (e) {
        Alert.alert('Olmadı', e instanceof Error ? e.message : 'Bir hata oluştu');
      }
    },
    [],
  );

  const acceptOffer = useCallback(async () => {
    if (!offer) return;
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride }>(`/rides/${offer.rideId}/accept`);
      setRide(res.ride);
      setOffer(null);
    } catch (e) {
      setOffer(null);
      Alert.alert('Çağrı kaçtı', e instanceof Error ? e.message : 'Çağrı başka sürücüye gitti');
    } finally {
      setBusy(false);
    }
  }, [offer]);

  const advanceRide = useCallback(async () => {
    if (!ride) return;
    const nextAction =
      ride.status === 'accepted' ? 'arrived' : ride.status === 'arrived' ? 'start' : 'complete';
    setBusy(true);
    try {
      const res = await api.post<{ ride: Ride }>(`/rides/${ride.id}/${nextAction}`);
      if (res.ride.status === 'completed') {
        setRide(null);
        setRatingRide(res.ride);
      } else {
        setRide(res.ride);
      }
    } catch (e) {
      Alert.alert('Olmadı', e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }, [ride]);

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
            setRide(null);
          } catch (e) {
            Alert.alert('Olmadı', e instanceof Error ? e.message : 'Bir hata oluştu');
          }
        },
      },
    ]);
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
                <Text style={styles.routeText} numberOfLines={2}>
                  📍 {ride.pickup.address}
                  {'\n'}🏁 {ride.drop.address} · ~{ride.estDistanceKm.toFixed(1)} km
                </Text>
              </View>
              <Pressable
                style={styles.callButton}
                onPress={() => Linking.openURL(`tel:${ride.passenger.phone}`)}
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
