import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { getSocket } from '../../api/socket';
import { CarMarker } from '../../components/CarMarker';
import { LocationPermissionCard } from '../../components/LocationPermissionCard';
import { MyLocationButton } from '../../components/MyLocationButton';
import { RatingSheet } from '../../components/RatingSheet';
import { Badge, Button, Card, rideStatusLabel } from '../../components/ui';
import { KKTC_CENTER } from '../../data/places';
import { fetchEndedRide, useActiveRideSync } from '../../hooks/useActiveRideSync';
import { useCenterOnMe } from '../../hooks/useCenterOnMe';
import { useLocationPermission } from '../../hooks/useLocationPermission';
import { useRoadRoute } from '../../hooks/useRoadRoute';
import { useRouteFollower } from '../../hooks/useRouteFollower';
import { driverLegTargets, followTargets, movedBeyond, resolveHeading, routeKey } from '../../logic/geo';
import { applyDriverRideUpdate } from '../../logic/rideUpdates';
import { useAuth } from '../../store/auth';
import { colors, radius, shadow, spacing } from '../../theme';
import type { LatLng, Ride, RideOffer, RideUpdatePayload } from '../../types';

/** Sürücünün kendi konumu + gidiş yönü */
type MyPosition = LatLng & { heading: number | null };

/** Yol rotası yokken / rotadan çıkınca bu kadar ilerleyince rota yeniden istenir (km) */
const REROUTE_KM = 0.12;
/** Takip kamerası: araç ve hedef, üst durum çubuğu ile alttaki çağrı kartının arasında kalır */
const FOLLOW_PADDING = { top: 200, right: 70, bottom: 380, left: 70 };

const toCoordinate = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });

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
  const [myPos, setMyPos] = useState<MyPosition | null>(null);
  const myPosRef = useRef<MyPosition | null>(null);
  const centeredOnce = useRef(false);
  // Uber tarzı takip: aktif çağrıda harita aracı ve sıradaki hedefi çerçeveler; elle kaydırınca durur
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const [legOrigin, setLegOrigin] = useState<LatLng | null>(null);
  const locationGranted = useLocationPermission();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { centerOnMe, locating } = useCenterOnMe(mapRef);

  const approved = user?.driver?.status === 'approved';

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

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
      // Biz dinlemezken kapanmış: yolcu iptal ettiyse / bitirdiyse haber ver
      fetchEndedRide(previous.id).then((ended) => {
        if (ended?.status !== 'cancelled') return;
        if (ended.cancelReason === 'passenger_cancelled') {
          Alert.alert('Çağrı iptal edildi', 'Yolcu çağrıyı iptal etti.');
        } else if (ended.cancelReason === 'passenger_ended') {
          Alert.alert('Yolcu yolculuğu bitirdi', 'Yolculuk sona erdi; ücret ve komisyon işlenmedi.');
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
      } else if (event === 'passenger_ended') {
        Alert.alert('Yolcu yolculuğu bitirdi', 'Yolculuk sona erdi; ücret ve komisyon işlenmedi.');
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

  // Çevrimiçiyken konum + yön yayını (3 sn / 10 m aralıkla; yolcu aracı akıcı görür)
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted || cancelled) return;
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3_000, distanceInterval: 10 },
        (pos) => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const prev = myPosRef.current;
          // GPS yönü (iOS geçersizde -1 verir) yoksa son iki konumdan hesaplanır
          const heading = resolveHeading(prev, next, pos.coords.heading, prev?.heading ?? null);
          const mine = { ...next, heading };
          myPosRef.current = mine;
          setMyPos(mine);
          const payload = heading === null ? next : { ...next, heading };
          const socket = getSocket();
          if (socket?.connected) {
            socket.emit('driver:location', payload);
          } else {
            api.post('/driver/location', payload).catch(() => {});
          }
          if (!centeredOnce.current) {
            centeredOnce.current = true;
            mapRef.current?.animateToRegion(
              { latitude: next.lat, longitude: next.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
              600,
            );
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

  /** Yolculuk sırasında bitirme: ücret ve komisyon işlenmez (ücret için "Yolculuğu Tamamla"). */
  const endRide = useCallback(async () => {
    if (!ride) return;
    Alert.alert(
      'Yolculuğu bitir',
      "Yolculuk ücretsiz sona erecek: ücret ve komisyon işlenmez. Ücret almak için 'Yolculuğu Tamamla' kullan.",
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Ücretsiz Bitir',
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
      ],
    );
  }, [ride, applyRide]);

  const submitRating = useCallback(
    async (rating: number, comment: string) => {
      if (!ratingRide) return;
      try {
        await api.post(`/rides/${ratingRide.id}/rate`, { rating, comment: comment || undefined });
      } catch {
        // Puanlama başarısız olsa da akışı bloklama; Yolculuklarım'dan tekrar denenebilir
      }
      setRatingRide(null);
    },
    [ratingRide],
  );

  // Yolculuk rotası (alış → duraklar → varış) gerçek yol üzerinden
  const tripPoints = useMemo(() => (ride ? [ride.pickup, ...(ride.stops ?? []), ride.drop] : null), [ride]);
  const tripRoute = useRoadRoute(tripPoints);
  const tripLine = tripRoute ? tripRoute.points.map(toCoordinate) : [];

  // Ben → sıradaki hedef (alış noktası ya da duraklar + varış)
  const legTargets = useMemo(() => (ride ? driverLegTargets(ride) : []), [ride]);
  const legTargetKey = routeKey(legTargets);
  const legPoints = useMemo(
    () => (legOrigin && legTargets.length > 0 ? [legOrigin, ...legTargets] : null),
    [legOrigin, legTargets],
  );
  const legRoute = useRoadRoute(legPoints);
  // Kendi aracım yol tarifine oturur ve rota çizgisi üzerinden ilerler (çağrı yokken ham GPS)
  const follower = useRouteFollower(myPos, legRoute, routeKey(legPoints ?? []));
  const me = follower?.display ?? myPos;
  const offRoute = follower?.display.offRoute ?? false;
  const legIsRoad = legRoute?.source === 'osrm';
  useEffect(() => {
    if (!myPos || legTargets.length === 0) {
      setLegOrigin(null);
      return;
    }
    setLegOrigin((origin) => {
      if (!origin) return { lat: myPos.lat, lng: myPos.lng };
      if (legIsRoad && !offRoute) return origin;
      return movedBeyond(origin, myPos, REROUTE_KM) ? { lat: myPos.lat, lng: myPos.lng } : origin;
    });
  }, [myPos, legTargets, legTargetKey, legIsRoad, offRoute]);
  const legLine = follower?.display.ahead ? follower.display.ahead.map(toCoordinate) : null;

  // Çağrı kabul edilince takip başlar
  const rideId = ride?.id ?? null;
  const rideStatus = ride?.status ?? null;
  useEffect(() => {
    if (rideStatus === 'accepted') setFollow(true);
  }, [rideId, rideStatus]);

  // Takip kamerası: araç + sıradaki hedef çerçevelenir, yaklaştıkça yakınlaşır
  useEffect(() => {
    if (!follow || !ride || !me) return;
    const pts = followTargets(me, ride).map(toCoordinate);
    if (pts.length >= 2) {
      mapRef.current?.fitToCoordinates(pts, { edgePadding: FOLLOW_PADDING, animated: true });
    }
  }, [follow, me, ride]);

  const showFollowChip = ride !== null && !follow;

  const etaText = (() => {
    if (!ride || !legRoute) return null;
    const remainingKm = follower?.display.remainingKm ?? legRoute.distanceKm;
    const dist = `${remainingKm.toFixed(1)} km`;
    const mins =
      legRoute.durationMin && legRoute.distanceKm > 0
        ? Math.max(1, Math.round((legRoute.durationMin * remainingKm) / legRoute.distanceKm))
        : null;
    if (ride.status === 'in_progress') return mins ? `Varışa ~${mins} dk · ${dist}` : `Varışa ~${dist}`;
    if (ride.status === 'arrived') return 'Alış noktasındasın';
    return mins ? `Alış noktasına ~${mins} dk · ${dist}` : `Alış noktasına ~${dist}`;
  })();

  const advanceLabel =
    ride?.status === 'accepted'
      ? '📍 Alış Noktasına Vardım'
      : ride?.status === 'arrived'
        ? '▶️ Yolculuğu Başlat'
        : '✅ Yolculuğu Tamamla';

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
        onPanDrag={() => {
          if (followRef.current) setFollow(false);
        }}
        // Çevrimiçiyken kendi aracımız kırmızı araba olarak çizilir; mavi nokta yalnızca çevrimdışıyken
        showsUserLocation={!(online && myPos)}
        showsMyLocationButton
      >
        {online && me && (
          <CarMarker
            lat={me.lat}
            lng={me.lng}
            heading={me.heading}
            path={follower?.display.path}
            durationMs={follower?.durationMs}
            title="Sen"
            zIndex={10}
          />
        )}
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
            {tripLine.length > 1 && <Polyline coordinates={tripLine} strokeColor={colors.ink} strokeWidth={4} />}
            {legLine && legLine.length > 1 && (
              <Polyline coordinates={legLine} strokeColor={colors.info} strokeWidth={4} />
            )}
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
                <Text style={styles.passengerName}>
                  {ride.passenger.name}
                  {ride.passenger.rating ? <Text style={styles.passengerRating}> · ⭐ {ride.passenger.rating}</Text> : null}
                </Text>
                {etaText && <Text style={styles.etaText}>{etaText}</Text>}
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
            <View style={{ height: spacing(2) }} />
            {ride.status === 'in_progress' ? (
              <Button title="Yolculuğu Bitir (ücretsiz)" variant="outline" onPress={endRide} />
            ) : (
              <Button title="İptal Et" variant="outline" onPress={cancelRide} />
            )}
          </Card>
        )}
      </SafeAreaView>

      {/* Durum kartının altında: tek dokunuşla konuma yakınlaş */}
      <MyLocationButton
        onPress={() => {
          setFollow(false);
          centerOnMe();
        }}
        busy={locating}
        style={{ top: insets.top + 104 }}
      />

      {showFollowChip && (
        <Pressable
          onPress={() => setFollow(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.followChip, { top: insets.top + 164 }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="navigate" size={16} color={colors.ink} />
          <Text style={styles.followChipText}>Rotayı takip et</Text>
        </Pressable>
      )}

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
                {offer?.passengerRating ? ` · Yolcu ⭐ ${offer.passengerRating}` : ' · Yeni yolcu'}
              </Text>
            </View>
            <Button title="Çağrıyı Kabul Et" onPress={acceptOffer} loading={busy} />
            <View style={{ height: spacing(2) }} />
            <Button title="Reddet" variant="outline" onPress={() => setOffer(null)} />
          </Card>
        </View>
      </Modal>

      {/* Yolcu puanlama: yıldız + isteğe bağlı yorum */}
      <RatingSheet
        visible={ratingRide !== null}
        title="Yolculuk tamamlandı ✅"
        headline={ratingRide ? `${ratingRide.finalFare ?? ratingRide.estFare} TL` : null}
        subtitle="Yolcuyu puanla"
        onSubmit={submitRating}
        onSkip={() => setRatingRide(null)}
      />
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
  passengerRating: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  etaText: { fontSize: 13, color: colors.info, fontWeight: '700', marginTop: 2 },
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
  followChip: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(3),
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  followChipText: { fontSize: 13, fontWeight: '700', color: colors.ink },
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
});
