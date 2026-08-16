import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, Button, Card } from '../components/ui';
import { useAuth } from '../store/auth';
import { colors, radius, spacing } from '../theme';

const DRIVER_STATUS_TR: Record<string, { text: string; tone: 'info' | 'success' | 'warning' | 'danger' }> = {
  pending: { text: 'Onay bekliyor', tone: 'warning' },
  approved: { text: 'Onaylı sürücü', tone: 'success' },
  rejected: { text: 'Başvuru reddedildi', tone: 'danger' },
  suspended: { text: 'Hesap askıda', tone: 'danger' },
};

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const driverStatus = user.driver ? DRIVER_STATUS_TR[user.driver.status] : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <View style={styles.avatar}>
          <Text style={{ fontSize: 36 }}>{user.role === 'driver' ? '🚕' : '🧑'}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.phone}>{user.phone}</Text>

        {user.driver && (
          <Card style={{ marginTop: spacing(5) }}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Araç Bilgileri</Text>
              {driverStatus && <Badge text={driverStatus.text} tone={driverStatus.tone} />}
            </View>
            <InfoRow label="Plaka" value={user.driver.vehiclePlate} />
            <InfoRow label="Araç" value={user.driver.vehicleModel} />
            <InfoRow label="Şehir" value={user.driver.city} />
            <InfoRow label="Ruhsat No" value={user.driver.licenseNo} />
            <InfoRow
              label="Puan"
              value={user.driver.rating ? `⭐ ${user.driver.rating}` : 'Henüz puanlanmadı'}
            />
          </Card>
        )}

        <View style={{ height: spacing(6) }} />
        <Button title="Çıkış Yap" variant="outline" onPress={() => signOut()} />
        <Text style={styles.version}>Ulak v0.1 · Kuzey Kıbrıs 🇹🇷</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing(4),
  },
  name: { fontSize: 24, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: spacing(3) },
  phone: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: spacing(1) },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.ink },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing(2.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  infoLabel: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  infoValue: { fontSize: 14, color: colors.ink, fontWeight: '700' },
  version: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: spacing(6) },
});
