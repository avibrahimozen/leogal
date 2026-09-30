import { planWebAlert, webAlertText } from '../alert';

describe('planWebAlert', () => {
  it('düğme yoksa yalın alert', () => {
    expect(planWebAlert()).toEqual({ kind: 'alert', then: undefined });
    expect(planWebAlert([])).toEqual({ kind: 'alert', then: undefined });
  });

  it('tek düğme: alert kapanınca o düğme çalışır', () => {
    const onPress = jest.fn();
    const plan = planWebAlert([{ text: 'Tamam', onPress }]);
    expect(plan.kind).toBe('alert');
    if (plan.kind === 'alert') plan.then?.onPress?.();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('iki düğme: cancel stili İptal, diğeri Tamam', () => {
    const cancel = { text: 'Vazgeç', style: 'cancel' as const };
    const end = { text: 'Bitir', style: 'destructive' as const };
    expect(planWebAlert([cancel, end])).toEqual({ kind: 'confirm', ok: end, cancel });
    // Sıra tersse de aynı sonuç
    expect(planWebAlert([end, cancel])).toEqual({ kind: 'confirm', ok: end, cancel });
  });

  it('cancel stili yoksa ilk düğme İptal, son düğme Tamam', () => {
    const a = { text: 'Hayır' };
    const b = { text: 'Belki' };
    const c = { text: 'Evet' };
    expect(planWebAlert([a, b, c])).toEqual({ kind: 'confirm', ok: c, cancel: a });
  });

  it('metin: başlık + mesaj, confirm için düğme adları', () => {
    expect(webAlertText('Başlık', undefined, { kind: 'alert' })).toBe('Başlık');
    expect(webAlertText('Başlık', 'Mesaj', { kind: 'alert' })).toBe('Başlık\n\nMesaj');
    expect(
      webAlertText('Yolculuğu bitir', 'Emin misin?', {
        kind: 'confirm',
        ok: { text: 'Bitir' },
        cancel: { text: 'Vazgeç', style: 'cancel' },
      }),
    ).toBe('Yolculuğu bitir\n\nEmin misin?\n\nTamam: Bitir · İptal: Vazgeç');
  });
});
