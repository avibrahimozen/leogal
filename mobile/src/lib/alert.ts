import { Alert, Linking, Platform, type AlertButton } from 'react-native';
import { planWebAlert, webAlertText } from '../logic/alert';

/**
 * Platformdan bağımsız uyarı kutusu. iOS/Android'de Alert.alert; web'de
 * window.alert / window.confirm (react-native-web Alert'i uygulamaz, sessizce yutar).
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const plan = planWebAlert(buttons);
  const text = webAlertText(title, message, plan);
  if (plan.kind === 'alert') {
    window.alert(text);
    plan.then?.onPress?.();
    return;
  }
  const ok = window.confirm(text);
  (ok ? plan.ok : plan.cancel).onPress?.();
}

/** Sistem ayarlarını açar (web'de karşılığı yok; tarayıcı izinleri adres çubuğundan yönetilir). */
export function openAppSettings(): void {
  if (Platform.OS === 'web') return;
  Linking.openSettings().catch(() => {});
}
