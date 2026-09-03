import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import OtpStep from '../components/OtpStep';
import { Button, Field } from '../components/ui';
import { useAuth } from '../store/auth';
import { colors, radius, spacing } from '../theme';
import type { User } from '../types';

const CITIES = ['Lefkoşa', 'Girne', 'Gazimağusa', 'Güzelyurt', 'İskele', 'Lefke'] as const;

export default function DriverRegisterScreen() {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [city, setCity] = useState<(typeof CITIES)[number]>('Lefkoşa');
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [busy, setBusy] = useState(false);

  const cleanPhone = phone.replace(/\s/g, '');

  function goToVerification() {
    if (
      name.trim().length < 2 ||
      cleanPhone.length < 10 ||
      password.length < 6 ||
      licenseNo.trim().length < 3 ||
      vehiclePlate.trim().length < 3 ||
      vehicleModel.trim().length < 2
    ) {
      Alert.alert('Eksik bilgi', 'Tüm alanları eksiksiz doldurun (şifre en az 6 karakter).');
      return;
    }
    setStep('otp');
  }

  async function handleRegister(verificationToken: string) {
    setBusy(true);
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/register-driver', {
        name: name.trim(),
        phone: cleanPhone,
        password,
        licenseNo: licenseNo.trim(),
        vehiclePlate: vehiclePlate.trim(),
        vehicleModel: vehicleModel.trim(),
        city,
        verificationToken,
      });
      await signIn(res.token, res.user);
      Alert.alert(
        'Başvurun alındı 🚕',
        'Sürücü hesabın onay bekliyor. Belgelerin incelendikten sonra çevrimiçi olabileceksin.',
      );
    } catch (e) {
      Alert.alert('Kayıt başarısız', e instanceof Error ? e.message : 'Bir hata oluştu');
      setStep('form');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'otp') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <OtpStep phone={cleanPhone} onVerified={handleRegister} onBack={() => setStep('form')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Ulak sürücüsü ol</Text>
          <Text style={styles.subtitle}>
            Boş beklemek yok: Ulak sana müşteri getirir, sen sadece tamamlanan yolculuklardan küçük bir
            komisyon ödersin.
          </Text>
          <Field label="Ad Soyad" placeholder="Mehmet Kaya" value={name} onChangeText={setName} />
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
          <Field
            label="Ehliyet / T Ruhsat No"
            placeholder="KKTC-123456"
            autoCapitalize="characters"
            value={licenseNo}
            onChangeText={setLicenseNo}
          />
          <Field
            label="Araç Plakası"
            placeholder="GM 123"
            autoCapitalize="characters"
            value={vehiclePlate}
            onChangeText={setVehiclePlate}
          />
          <Field
            label="Araç Marka / Model"
            placeholder="Toyota Corolla"
            value={vehicleModel}
            onChangeText={setVehicleModel}
          />
          <Text style={styles.label}>Çalıştığın Şehir</Text>
          <View style={styles.cityRow}>
            {CITIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCity(c)}
                style={[styles.cityChip, city === c && styles.cityChipActive]}
              >
                <Text style={[styles.cityText, city === c && styles.cityTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Devam Et" onPress={goToVerification} loading={busy} />
          <Text style={styles.otpNote}>
            Devam ettiğinde telefonuna SMS ile doğrulama kodu göndereceğiz.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(6) },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing(1), marginBottom: spacing(6), lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkSoft, marginBottom: spacing(2) },
  cityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(6) },
  cityChip: {
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  cityChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  cityText: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  cityTextActive: { color: '#fff' },
  otpNote: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: spacing(4), lineHeight: 19 },
});
