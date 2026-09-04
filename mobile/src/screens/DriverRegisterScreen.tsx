import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import OtpStep from '../components/OtpStep';
import { Button, Field } from '../components/ui';
import {
  BUNDLED_REGIONS,
  COUNTRY_NAMES,
  countryByCode,
  fetchRegions,
  normalizeTr,
  type CountryCode,
  type Regions,
} from '../data/regions';
import { useAuth } from '../store/auth';
import { colors, radius, spacing } from '../theme';
import type { User } from '../types';

const COUNTRY_OPTIONS: CountryCode[] = ['KKTC', 'TR'];

export default function DriverRegisterScreen() {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [regions, setRegions] = useState<Regions>(BUNDLED_REGIONS);
  const [country, setCountry] = useState<CountryCode>('KKTC');
  const [city, setCity] = useState('Lefkoşa');
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [busy, setBusy] = useState(false);

  const cleanPhone = phone.replace(/\s/g, '');

  // Şehir listesi sunucudan gelir; ulaşılamazsa gömülü liste kullanılır
  useEffect(() => {
    let alive = true;
    fetchRegions().then((r) => {
      if (alive) setRegions(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const currentCountry = countryByCode(regions, country);

  const filteredCities = useMemo(() => {
    const q = normalizeTr(citySearch);
    return q ? currentCountry.cities.filter((c) => normalizeTr(c).includes(q)) : currentCountry.cities;
  }, [currentCountry, citySearch]);

  function selectCountry(code: CountryCode) {
    if (code === country) return;
    setCountry(code);
    setCity(''); // ülke değişince şehir yeniden seçilmeli
  }

  function selectCity(value: string) {
    setCity(value);
    setCityPickerOpen(false);
    setCitySearch('');
  }

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
    if (!city) {
      Alert.alert('Şehir seçilmedi', `${COUNTRY_NAMES[country]} içinde çalıştığın şehri seç.`);
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
        country,
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
            Üyelik ücretsiz, boş beklemek yok: Ulak sana müşteri getirir, sen sadece tamamlanan
            yolculuklardan küçük bir komisyon ödersin. Hesabın yönetici onayından sonra çağrı almaya başlar.
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
          <Text style={styles.label}>Çalıştığın Ülke</Text>
          <View style={styles.chipRow}>
            {COUNTRY_OPTIONS.map((code) => (
              <Pressable
                key={code}
                onPress={() => selectCountry(code)}
                style={[styles.chip, country === code && styles.chipActive]}
              >
                <Text style={[styles.chipText, country === code && styles.chipTextActive]}>
                  {COUNTRY_NAMES[code]}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="Ehliyet / T Ruhsat No"
            placeholder={country === 'TR' ? 'Ehliyet no' : 'KKTC-123456'}
            autoCapitalize="characters"
            value={licenseNo}
            onChangeText={setLicenseNo}
          />
          <Field
            label="Araç Plakası"
            placeholder={country === 'TR' ? '34 ABC 123' : 'GM 123'}
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
          <Pressable style={styles.cityPicker} onPress={() => setCityPickerOpen(true)}>
            <Text style={city ? styles.cityPickerText : styles.cityPickerPlaceholder}>
              {city || `${COUNTRY_NAMES[country]} içinde şehir seç...`}
            </Text>
            <Text style={styles.cityPickerChevron}>▾</Text>
          </Pressable>
          <Button title="Devam Et" onPress={goToVerification} loading={busy} />
          <Text style={styles.otpNote}>
            Devam ettiğinde telefonuna SMS ile doğrulama kodu göndereceğiz.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Şehir seçici */}
      <Modal visible={cityPickerOpen} animationType="slide" onRequestClose={() => setCityPickerOpen(false)}>
        <SafeAreaView style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{COUNTRY_NAMES[country]} · Şehir</Text>
            <Pressable onPress={() => setCityPickerOpen(false)} hitSlop={8}>
              <Text style={styles.pickerClose}>Kapat</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.pickerSearch}
            placeholder="Şehir ara..."
            placeholderTextColor={colors.muted}
            value={citySearch}
            onChangeText={setCitySearch}
            autoFocus
            autoCorrect={false}
          />
          <FlatList
            data={filteredCities}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable style={styles.cityRow} onPress={() => selectCity(item)}>
                <Text style={[styles.cityName, item === city && styles.cityNameActive]}>{item}</Text>
                {item === city && <Text style={styles.cityCheck}>✓</Text>}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>Şehir bulunamadı.</Text>}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(6) },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: spacing(1), marginBottom: spacing(6), lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkSoft, marginBottom: spacing(2) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginBottom: spacing(4) },
  chip: {
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.inkSoft },
  chipTextActive: { color: '#fff' },
  cityPicker: {
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(6),
  },
  cityPickerText: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  cityPickerPlaceholder: { fontSize: 16, color: colors.muted },
  cityPickerChevron: { fontSize: 16, color: colors.muted },
  otpNote: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: spacing(4), lineHeight: 19 },
  pickerContainer: { flex: 1, backgroundColor: colors.bg },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing(4),
  },
  pickerTitle: { fontSize: 22, fontWeight: '800', color: colors.ink },
  pickerClose: { fontSize: 15, fontWeight: '600', color: colors.info },
  pickerSearch: {
    marginHorizontal: spacing(4),
    marginBottom: spacing(2),
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: spacing(3.5),
    fontSize: 16,
    color: colors.ink,
  },
  cityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  cityName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  cityNameActive: { color: colors.info },
  cityCheck: { fontSize: 16, fontWeight: '700', color: colors.info },
  emptyText: { textAlign: 'center', color: colors.muted, marginTop: spacing(8) },
});
