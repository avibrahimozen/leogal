import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow } from '../theme';

/**
 * Haritanın üstünde yüzen "konumuma git" düğmesi. iOS'ta Apple Maps yerleşik
 * düğme göstermediği için her platformda aynı görünen kendi düğmemiz.
 */
export function MyLocationButton({
  onPress,
  busy,
  style,
}: {
  onPress: () => void;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Konumuma git"
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }, style]}
    >
      {busy ? <ActivityIndicator color={colors.ink} /> : <Ionicons name="locate" size={22} color={colors.ink} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
});
