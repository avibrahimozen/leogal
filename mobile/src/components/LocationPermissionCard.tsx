import React from 'react';
import { Platform, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { openAppSettings } from '../lib/alert';
import { colors, radius, spacing } from '../theme';
import { Card } from './ui';

/**
 * Konum izni reddedildiğinde gösterilen küçük uyarı kartı; buton sistem ayarlarını açar.
 * Web'de sistem ayarı yoktur: izin tarayıcının adres çubuğundan verilir, düğme gösterilmez.
 */
export function LocationPermissionCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const web = Platform.OS === 'web';
  return (
    <Card style={[styles.card, style]}>
      <Text style={styles.text}>
        {web ? '📍 Konum izni gerekli — tarayıcının adres çubuğundan izin ver' : "📍 Konum izni gerekli — Ayarlar'dan izin ver"}
      </Text>
      {!web && (
      <Pressable
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        onPress={() => {
          openAppSettings();
        }}
      >
        <Text style={styles.buttonText}>Ayarlar</Text>
      </Pressable>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(3),
    marginBottom: spacing(3),
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink, lineHeight: 18 },
  button: {
    height: 36,
    paddingHorizontal: spacing(3.5),
    borderRadius: radius.sm,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing(2),
  },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
