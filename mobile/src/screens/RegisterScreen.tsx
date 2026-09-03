import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import OtpStep from '../components/OtpStep';
import { Button, Field } from '../components/ui';
import { useAuth } from '../store/auth';
import { colors, spacing } from '../theme';
import type { User } from '../types';

export default function RegisterScreen() {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [busy, setBusy] = useState(false);

  const cleanPhone = phone.replace(/\s/g, '');

  function goToVerification() {
    if (name.trim().length < 2 || cleanPhone.length < 10 || password.length < 6) {
      Alert.alert(
        'Eksik bilgi',
        'Ad soyad, geçerli bir telefon numarası ve en az 6 karakterli bir şifre girin.',
      );
      return;
    }
    setStep('otp');
  }

  async function handleRegister(verificationToken: string) {
    setBusy(true);
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/register', {
        name: name.trim(),
        phone: cleanPhone,
        password,
        verificationToken,
      });
      await signIn(res.token, res.user);
    } catch (e) {
      Alert.alert('Kayıt başarısız', e instanceof Error ? e.message : 'Bir hata oluştu');
      setStep('form');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 'form' ? (
            <>
              <Text style={styles.title}>Ulak'a katıl</Text>
              <Text style={styles.subtitle}>
                Birkaç saniyede hesabını oluştur, taksin kapında olsun.
              </Text>
              <Field label="Ad Soyad" placeholder="Ayşe Yılmaz" value={name} onChangeText={setName} />
              <Field
                label="Telefon Numarası"
                placeholder="0542 812 34 56"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              <Field
                label="Şifre"
                placeholder="En az 6 karakter"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              <Button title="Devam Et" onPress={goToVerification} loading={busy} />
              <Text style={styles.otpNote}>
                Devam ettiğinde telefonuna SMS ile doğrulama kodu göndereceğiz.
              </Text>
            </>
          ) : (
            <OtpStep phone={cleanPhone} onVerified={handleRegister} onBack={() => setStep('form')} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(6) },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing(1), marginBottom: spacing(6) },
  otpNote: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: spacing(4), lineHeight: 19 },
});
