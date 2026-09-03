import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  textColor,
  borderColor,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'dark' | 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  /** Yazı rengini geçersiz kıl (örn. koyu zeminde outline buton) */
  textColor?: string;
  /** Outline kenarlık rengini geçersiz kıl */
  borderColor?: string;
}) {
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'dark'
        ? colors.ink
        : variant === 'danger'
          ? colors.danger
          : 'transparent';
  const fg = textColor ?? (variant === 'primary' ? colors.ink : variant === 'outline' ? colors.ink : '#fff');
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'outline' && { borderWidth: 1.5, borderColor: borderColor ?? colors.line },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: spacing(4) }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...rest} style={styles.input} />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ text, tone = 'info' }: { text: string; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  const palette = {
    info: { bg: '#DBEAFE', fg: '#1D4ED8' },
    success: { bg: '#DCFCE7', fg: '#15803D' },
    warning: { bg: '#FEF3C7', fg: '#B45309' },
    danger: { bg: '#FEE2E2', fg: '#B91C1C' },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={{ color: palette.fg, fontWeight: '600', fontSize: 12 }}>{text}</Text>
    </View>
  );
}

/** Yolculuk durumunun Türkçe karşılığı ve renk tonu. */
export function rideStatusLabel(status: string): { label: string; tone: 'info' | 'success' | 'warning' | 'danger' } {
  switch (status) {
    case 'requested':
      return { label: 'Sürücü aranıyor', tone: 'warning' };
    case 'accepted':
      return { label: 'Sürücü yolda', tone: 'info' };
    case 'arrived':
      return { label: 'Sürücü kapıda', tone: 'info' };
    case 'in_progress':
      return { label: 'Yolculuk sürüyor', tone: 'info' };
    case 'completed':
      return { label: 'Tamamlandı', tone: 'success' };
    case 'cancelled':
      return { label: 'İptal edildi', tone: 'danger' };
    default:
      return { label: status, tone: 'info' };
  }
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(6),
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: spacing(1.5),
  },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing(4),
    ...shadow.card,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
  },
});
