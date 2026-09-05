import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { RatingSheet } from '../components/RatingSheet';
import { Badge, Card, cancelReasonLabel, rideStatusLabel } from '../components/ui';
import { ratingSummary } from '../logic/ratings';
import { useAuth } from '../store/auth';
import { colors, spacing } from '../theme';
import type { Ride } from '../types';

export default function RideHistoryScreen() {
  const { user } = useAuth();
  const role = user?.role ?? 'passenger';
  const [rides, setRides] = useState<Ride[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Sonradan puanlama: atlanan yolculuk buradan puanlanır
  const [ratingRide, setRatingRide] = useState<Ride | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ rides: Ride[] }>('/rides/history');
      setRides(res.rides);
    } catch {
      // Ağ hatasında eski listeyi koru
    }
  }, []);

  // Sekme her odaklandığında yenile (tamamlanan yolculuk hemen görünsün)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const submitRating = useCallback(
    async (rating: number, comment: string) => {
      if (!ratingRide) return;
      try {
        const res = await api.post<{ ride: Ride }>(`/rides/${ratingRide.id}/rate`, { rating, comment: comment || undefined });
        setRides((prev) => prev.map((r) => (r.id === res.ride.id ? res.ride : r)));
      } catch (e) {
        Alert.alert('Puan kaydedilemedi', e instanceof Error ? e.message : 'Bir hata oluştu');
      }
      setRatingRide(null);
    },
    [ratingRide],
  );

  const subtitle = role === 'driver' ? 'Yolcuyu puanla' : 'Sürücünü puanla';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Yolculuklarım</Text>
      <FlatList
        contentContainerStyle={{ padding: spacing(4), paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        data={rides}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const { label, tone } = rideStatusLabel(item.status);
          const rating = ratingSummary(item, role);
          return (
            <Card style={styles.rideCard}>
              <View style={styles.rideTop}>
                <Badge text={label} tone={tone} />
                <Text style={styles.fare}>
                  {item.status === 'cancelled' ? 'Ücret yok' : `${item.finalFare ?? item.estFare} TL`}
                </Text>
              </View>
              <Text style={styles.route} numberOfLines={2}>
                📍 {item.pickup.address}
                {'\n'}🏁 {item.drop.address}
              </Text>
              <Text style={styles.date}>
                {new Date(item.requestedAt).toLocaleString('tr-TR')} · ~{item.estDistanceKm.toFixed(1)} km
                {item.status === 'cancelled' && cancelReasonLabel(item.cancelReason)
                  ? ` · ${cancelReasonLabel(item.cancelReason)}`
                  : ''}
              </Text>
              {(rating.given || rating.received || rating.canRate) && (
                <View style={styles.ratingRow}>
                  <View style={{ flex: 1 }}>
                    {rating.given && <Text style={styles.ratingText}>{rating.given}</Text>}
                    {rating.comment ? (
                      <Text style={styles.commentText} numberOfLines={2}>
                        “{rating.comment}”
                      </Text>
                    ) : null}
                    {rating.received && <Text style={styles.ratingText}>{rating.received}</Text>}
                  </View>
                  {rating.canRate && (
                    <Pressable onPress={() => setRatingRide(item)} hitSlop={8} style={styles.rateButton}>
                      <Text style={styles.rateButtonText}>⭐ Puanla</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Card>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz yolculuğun yok.</Text>}
      />

      <RatingSheet
        visible={ratingRide !== null}
        title="Yolculuğu puanla"
        headline={ratingRide ? `${ratingRide.finalFare ?? ratingRide.estFare} TL` : null}
        subtitle={subtitle}
        onSubmit={submitRating}
        onSkip={() => setRatingRide(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, padding: spacing(4) },
  rideCard: { marginBottom: spacing(3) },
  rideTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2.5),
  },
  fare: { fontSize: 18, fontWeight: '800', color: colors.ink },
  route: { fontSize: 14, color: colors.inkSoft, lineHeight: 21, marginBottom: spacing(2) },
  date: { fontSize: 12, color: colors.muted },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing(2.5),
    paddingTop: spacing(2.5),
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ratingText: { fontSize: 13, fontWeight: '600', color: colors.inkSoft, marginBottom: 2 },
  commentText: { fontSize: 12, color: colors.muted, fontStyle: 'italic', marginBottom: 2 },
  rateButton: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    marginLeft: spacing(2),
  },
  rateButtonText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  emptyText: { textAlign: 'center', color: colors.muted, marginTop: spacing(8) },
});
