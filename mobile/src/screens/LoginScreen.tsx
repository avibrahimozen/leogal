import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { Button, Field } from '../components/ui';
import { useAuth } from '../store/auth';
import { colors, spacing } from '../theme';
import type { User } from '../types';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    if (!phone || !password) {
      Alert.alert('Eksik bilgi', 'Telefon numaranızı ve şifrenizi girin.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/login', {
        phone: phone.replace(/\s/g, ''),
        password,
      });
      await signIn(res.token, res.user);
    } catch (e) {
      Alert.alert('Giriş başarısız', e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Tekrar hoş geldin 👋</Text>
          <Text style={styles.subtitle}>Ulak hesabınla giriş yap.</Text>
          <Field
            label="Telefon Numarası"
            placeholder="+90 542 812 34 56"
            keyboardType="phone-pad"
            autoCapitalize="none"
            value={phone}
            onChangeText={setPhone}
          />
          <Field
            label="Şifre"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button title="Giriş Yap" onPress={handleLogin} loading={busy} />
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
});
