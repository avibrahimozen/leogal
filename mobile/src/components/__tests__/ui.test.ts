import { rideStatusLabel } from '../ui';

describe('rideStatusLabel', () => {
  it.each([
    ['requested', 'Sürücü aranıyor', 'warning'],
    ['accepted', 'Sürücü yolda', 'info'],
    ['arrived', 'Sürücü kapıda', 'info'],
    ['in_progress', 'Yolculuk sürüyor', 'info'],
    ['completed', 'Tamamlandı', 'success'],
    ['cancelled', 'İptal edildi', 'danger'],
  ])('%s → "%s" (%s)', (status, label, tone) => {
    expect(rideStatusLabel(status)).toEqual({ label, tone });
  });

  it('bilinmeyen durumu olduğu gibi, bilgi tonuyla döner', () => {
    expect(rideStatusLabel('weird')).toEqual({ label: 'weird', tone: 'info' });
  });
});
