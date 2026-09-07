import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { Button, Card } from './ui';

/** Sunucuyla aynı sınır */
export const COMMENT_MAX = 200;
export const RATING_LABELS: Record<number, string> = {
  1: 'Çok kötü',
  2: 'Kötü',
  3: 'İdare eder',
  4: 'İyi',
  5: 'Mükemmel',
};

interface Props {
  visible: boolean;
  title: string;
  /** Büyük yazılan tutar (örn. "850 TL"); yoksa gizli */
  headline?: string | null;
  subtitle: string;
  onSubmit: (rating: number, comment: string) => void | Promise<void>;
  onSkip: () => void;
}

/**
 * Yolculuk sonu puanlama: 1–5 yıldız + isteğe bağlı kısa yorum. Yıldıza dokunmak seçer,
 * "Gönder" kaydeder; "Şimdilik geç" ile atlanır (Yolculuklarım'dan sonradan puanlanabilir).
 */
export function RatingSheet({ visible, title, headline, subtitle, onSubmit, onSkip }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setRating(0);
      setComment('');
      setBusy(false);
    }
  }, [visible]);

  const submit = async () => {
    if (rating === 0 || busy) return;
    setBusy(true);
    try {
      await onSubmit(rating, comment.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Card style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {headline ? <Text style={styles.headline}>{headline}</Text> : null}
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${star} yıldız`}
              >
                <Text style={[styles.star, star > rating && styles.starOff]}>⭐</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.ratingLabel}>{rating ? RATING_LABELS[rating] : 'Yıldıza dokun'}</Text>
          <TextInput
            style={styles.input}
            placeholder="Kısa bir yorum bırak (isteğe bağlı)"
            placeholderTextColor={colors.muted}
            value={comment}
            onChangeText={(t) => setComment(t.slice(0, COMMENT_MAX))}
            maxLength={COMMENT_MAX}
            multiline
          />
          <Text style={styles.counter}>
            {comment.length}/{COMMENT_MAX}
          </Text>
          <Button title="Gönder" onPress={submit} disabled={rating === 0} loading={busy} />
          <Pressable onPress={onSkip} style={styles.skip} hitSlop={6}>
            <Text style={styles.skipText}>Şimdilik geç</Text>
          </Pressable>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center',
    padding: spacing(6),
  },
  card: { alignItems: 'stretch', paddingVertical: spacing(6) },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  headline: { fontSize: 32, fontWeight: '800', color: colors.success, textAlign: 'center', marginVertical: spacing(2) },
  subtitle: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: spacing(3) },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing(2) },
  star: { fontSize: 36 },
  starOff: { opacity: 0.25 },
  ratingLabel: { textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.inkSoft, marginTop: spacing(1), marginBottom: spacing(3) },
  input: {
    minHeight: 64,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing(3),
    fontSize: 14,
    color: colors.ink,
    textAlignVertical: 'top',
    backgroundColor: colors.bg,
  },
  counter: { alignSelf: 'flex-end', fontSize: 11, color: colors.muted, marginTop: spacing(1), marginBottom: spacing(3) },
  skip: { alignSelf: 'center', marginTop: spacing(3) },
  skipText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
});
