import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { Button, Field } from '../components/ui';
import { useAuth } from '../store/auth';
import { colors, spacing } from '../theme';
import type { User } from '../types';

export default function RegisterScreen() {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleRegister() {
    setBusy(true);
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/register', {
        name: name.trim(),
        phone: phone.replace(/\s/g, ''),
        password,
      });
      await signIn(res.token, res.user);
    } catch (e) {
      Alert.alert('Kayıt başarısız', e instanceof Error ? e.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Ulak'a katıl</Text>
          <Text style={styles.subtitle}>Birkaç saniyede hesabını oluştur, taksin kapında olsun.</Text>
          <Field label="Ad Soyad" placeholder="Ayşe Yılmaz" value={name} onChangeText={setName} />
          <Field
            label="Telefon Numarası"
            placeholder="+90 542 812 34 56"
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
          <Button title="Hesap Oluştur" onPress={handleRegister} loading={busy} />
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
