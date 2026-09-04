import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { Badge, Card, rideStatusLabel } from '../components/ui';
import { colors, spacing } from '../theme';
import type { Ride } from '../types';

export default function RideHistoryScreen() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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
          return (
            <Card style={styles.rideCard}>
              <View style={styles.rideTop}>
                <Badge text={label} tone={tone} />
                <Text style={styles.fare}>
                  {item.finalFare ?? item.estFare} TL
                </Text>
              </View>
              <Text style={styles.route} numberOfLines={2}>
                📍 {item.pickup.address}
                {'\n'}🏁 {item.drop.address}
              </Text>
              <Text style={styles.date}>
                {new Date(item.requestedAt).toLocaleString('tr-TR')} · ~{item.estDistanceKm.toFixed(1)} km
              </Text>
            </Card>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>Henüz yolculuğun yok.</Text>}
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
  emptyText: { textAlign: 'center', color: colors.muted, marginTop: spacing(8) },
});
