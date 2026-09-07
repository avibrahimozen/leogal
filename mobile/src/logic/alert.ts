/**
 * Tarayıcıda RN `Alert.alert` karşılığı: react-native-web'de Alert uygulanmamıştır,
 * bu yüzden düğmeler window.alert / window.confirm'e eşlenir. Saf planlama; DOM yok.
 */
export interface AlertChoice {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  /** RN AlertButton ile uyumlu; web'de hiçbir zaman değer geçilmez */
  onPress?: (value?: never) => void;
}

export type WebAlertPlan =
  | { kind: 'alert'; then?: AlertChoice }
  | { kind: 'confirm'; ok: AlertChoice; cancel: AlertChoice };

/**
 * 0–1 düğme → alert (düğme varsa kapanınca onPress).
 * 2+ düğme → confirm: `style: 'cancel'` olan (yoksa ilk) düğme "İptal", onun dışındaki
 * son düğme "Tamam" (RN'de eylem düğmesi genelde en sondadır).
 */
export function planWebAlert(buttons?: AlertChoice[]): WebAlertPlan {
  const list = buttons ?? [];
  if (list.length <= 1) return { kind: 'alert', then: list[0] };
  const cancel = list.find((b) => b.style === 'cancel') ?? list[0]!;
  const ok = [...list].reverse().find((b) => b !== cancel) ?? cancel;
  return { kind: 'confirm', ok, cancel };
}

/** alert/confirm kutusunda gösterilecek metin */
export function webAlertText(title: string, message: string | undefined, plan: WebAlertPlan): string {
  const body = [title, message].filter((s): s is string => !!s && s.trim() !== '').join('\n\n');
  if (plan.kind === 'alert') return body;
  return `${body}\n\nTamam: ${plan.ok.text ?? 'Evet'} · İptal: ${plan.cancel.text ?? 'Vazgeç'}`;
}
