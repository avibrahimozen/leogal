import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../components/ui';
import { colors, spacing } from '../theme';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>
          ulak<Text style={{ color: colors.primary }}>.</Text>
        </Text>
        <Text style={styles.tagline}>Kuzey Kıbrıs'ın taksi ağı</Text>
        <Text style={styles.subtitle}>
          Tek dokunuşla en yakın taksiyi çağır, sürücünü canlı takip et, yolculuğunu güvenle tamamla.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title="Giriş Yap" onPress={() => navigation.navigate('Login')} />
        <View style={{ height: spacing(3) }} />
        <Button title="Yolcu Olarak Kaydol" variant="dark" onPress={() => navigation.navigate('Register')} />
        <View style={{ height: spacing(3) }} />
        <Button
          title="Taksici misin? Ulak'a katıl"
          variant="outline"
          onPress={() => navigation.navigate('DriverRegister')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    padding: spacing(6),
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 64,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
    marginTop: spacing(2),
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#CBD5E1',
    marginTop: spacing(4),
  },
  actions: {
    paddingBottom: spacing(4),
  },
});
