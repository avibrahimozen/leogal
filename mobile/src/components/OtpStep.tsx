import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { colors, radius, spacing } from '../theme';
import { Button } from './ui';

interface Props {
  phone: string;
  /** Doğrulama başarılı: kayıt isteğinde kullanılacak token ile çağrılır. */
  onVerified: (verificationToken: string) => void;
  onBack: () => void;
}

/**
 * SMS doğrulama adımı: kodu ister, 6 haneli girişi doğrular,
 * bekleme süresi dolunca yeniden gönderime izin verir.
 */
export default function OtpStep({ phone, onVerified, onBack }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const requested = useRef(false);

  const requestCode = useCallback(async () => {
    setError('');
    try {
      const res = await api.post<{ resendAfterSec: number; devCode?: string }>('/auth/otp/request', {
        phone,
      });
      setResendIn(res.resendAfterSec);
      setDevCode(res.devCode ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kod gönderilemedi');
    }
  }, [phone]);

  // İlk açılışta kodu iste (StrictMode'da çift istek atmasın diye ref ile korunur)
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    requestCode();
  }, [requestCode]);

  // Yeniden gönderim sayacı
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const verify = useCallback(
    async (fullCode: string) => {
      setBusy(true);
      setError('');
      try {
        const res = await api.post<{ verificationToken: string }>('/auth/otp/verify', {
          phone,
          code: fullCode,
        });
        onVerified(res.verificationToken);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Doğrulama başarısız');
        setCode('');
      } finally {
        setBusy(false);
      }
    },
    [phone, onVerified],
  );

  function handleChange(text: string) {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) verify(digits);
  }

  return (
    <View>
      <Text style={styles.title}>Telefonunu doğrula 📲</Text>
      <Text style={styles.subtitle}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>{phone}</Text> numarasına 6 haneli bir
        doğrulama kodu gönderdik.
      </Text>
      <TextInput
        style={styles.codeInput}
        value={code}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="••••••"
        placeholderTextColor={colors.muted}
        autoFocus
      />
      {devCode !== null && (
        <Text style={styles.devHint}>Geliştirme modu — kodun: {devCode}</Text>
      )}
      {error !== '' && <Text style={styles.error}>{error}</Text>}
      <Button
        title={busy ? 'Doğrulanıyor...' : 'Doğrula'}
        onPress={() => code.length === 6 && verify(code)}
        loading={busy}
        disabled={code.length !== 6}
      />
      <View style={styles.footer}>
        <Pressable onPress={onBack}>
          <Text style={styles.footerLink}>← Bilgileri düzenle</Text>
        </Pressable>
        <Pressable disabled={resendIn > 0} onPress={requestCode}>
          <Text style={[styles.footerLink, resendIn > 0 && { color: colors.muted }]}>
            {resendIn > 0 ? `Yeniden gönder (${resendIn})` : 'Kodu yeniden gönder'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing(1), marginBottom: spacing(6), lineHeight: 21 },
  codeInput: {
    height: 64,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 12,
    color: colors.ink,
    marginBottom: spacing(3),
  },
  devHint: {
    fontSize: 13,
    color: colors.info,
    textAlign: 'center',
    marginBottom: spacing(3),
    fontWeight: '600',
  },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center', marginBottom: spacing(3), fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing(5),
  },
  footerLink: { fontSize: 14, fontWeight: '600', color: colors.info },
});
