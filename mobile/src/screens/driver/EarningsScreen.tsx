import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { Card } from '../../components/ui';
import { colors, spacing } from '../../theme';
import type { Earnings } from '../../types';

export default function EarningsScreen() {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<Earnings>('/driver/earnings');
      setEarnings(res);
    } catch {
      // Ağ hatasında eski veriyi göstermeye devam et
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>Kazançlarım</Text>
      <FlatList
        contentContainerStyle={{ padding: spacing(4), paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <Card style={styles.netCard}>
              <Text style={styles.netLabel}>Net Kazanç</Text>
              <Text style={styles.netValue}>{earnings?.netEarnings ?? 0} TL</Text>
              <Text style={styles.netMeta}>{earnings?.rideCount ?? 0} tamamlanan yolculuk</Text>
            </Card>
            <View style={styles.row}>
              <Card style={styles.halfCard}>
                <Text style={styles.smallLabel}>Brüt Hasılat</Text>
                <Text style={styles.smallValue}>{earnings?.grossEarnings ?? 0} TL</Text>
              </Card>
              <Card style={styles.halfCard}>
                <Text style={styles.smallLabel}>Toplam Komisyon</Text>
                <Text style={styles.smallValue}>{earnings?.totalCommission ?? 0} TL</Text>
              </Card>
            </View>
            <Card style={[styles.dueCard, (earnings?.commissionDue ?? 0) > 0 && styles.dueCardActive]}>
              <Text style={styles.smallLabel}>Ödenecek Komisyon Borcu</Text>
              <Text style={[styles.dueValue, (earnings?.commissionDue ?? 0) > 0 && { color: colors.danger }]}>
                {earnings?.commissionDue ?? 0} TL
              </Text>
              <Text style={styles.dueNote}>
                Komisyon, her tamamlanan yolculuktan otomatik hesaplanır ve Ulak ofisine ödenir.
              </Text>
            </Card>
            <Text style={styles.sectionTitle}>Hesap Hareketleri</Text>
          </>
        }
        data={earnings?.ledger ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <Card style={styles.ledgerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ledgerNote}>
                {item.note ?? (item.type === 'commission' ? 'Komisyon' : 'Ödeme')}
              </Text>
              <Text style={styles.ledgerDate}>{new Date(item.createdAt).toLocaleString('tr-TR')}</Text>
            </View>
            <Text
              style={[
                styles.ledgerAmount,
                { color: item.type === 'commission' ? colors.danger : colors.success },
              ]}
            >
              {item.type === 'commission' ? '-' : '+'}
              {item.amount} TL
            </Text>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Henüz hareket yok. İlk yolculuğunu tamamla! 🚕</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, padding: spacing(4) },
  netCard: { backgroundColor: colors.ink, marginBottom: spacing(3) },
  netLabel: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  netValue: { color: colors.primary, fontSize: 36, fontWeight: '800', marginVertical: spacing(1) },
  netMeta: { color: '#CBD5E1', fontSize: 13 },
  row: { flexDirection: 'row', gap: spacing(3), marginBottom: spacing(3) },
  halfCard: { flex: 1 },
  smallLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  smallValue: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: spacing(1) },
  dueCard: { marginBottom: spacing(4) },
  dueCardActive: { borderWidth: 1.5, borderColor: '#FECACA' },
  dueValue: { fontSize: 24, fontWeight: '800', color: colors.success, marginTop: spacing(1) },
  dueNote: { fontSize: 12, color: colors.muted, marginTop: spacing(2), lineHeight: 17 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.ink, marginBottom: spacing(2) },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing(2), padding: spacing(3) },
  ledgerNote: { fontSize: 14, fontWeight: '600', color: colors.ink },
  ledgerDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  ledgerAmount: { fontSize: 16, fontWeight: '800' },
  emptyText: { textAlign: 'center', color: colors.muted, marginTop: spacing(6) },
});
