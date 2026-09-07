import type { Ride } from '../../types';
import { ratingBadge, ratingSummary } from '../ratings';

function ride(overrides: Partial<Ride>): Pick<Ride, 'status' | 'passengerRating' | 'driverRating' | 'passengerComment' | 'driverComment'> {
  return { status: 'completed', passengerRating: null, driverRating: null, passengerComment: null, driverComment: null, ...overrides };
}

describe('ratingSummary', () => {
  it('yolcu: verdiği/aldığı puan ve yorumu; puanlamadıysa puanlayabilir', () => {
    expect(ratingSummary(ride({}), 'passenger')).toEqual({ given: null, received: null, comment: null, canRate: true });
    expect(ratingSummary(ride({ passengerRating: 5, driverRating: 4, passengerComment: 'Süper' }), 'passenger')).toEqual({
      given: 'Sürücüye ⭐ 5 verdin',
      received: 'Sürücü sana ⭐ 4 verdi',
      comment: 'Süper',
      canRate: false,
    });
  });

  it('sürücü: ayna görüntüsü', () => {
    expect(ratingSummary(ride({ passengerRating: 5, driverComment: 'Dakik' }), 'driver')).toEqual({
      given: null,
      received: 'Yolcu sana ⭐ 5 verdi',
      comment: 'Dakik',
      canRate: true,
    });
    expect(ratingSummary(ride({ driverRating: 3 }), 'driver').canRate).toBe(false);
  });

  it('yönetici yolcu gibi davranır; tamamlanmamış yolculuk puanlanamaz', () => {
    expect(ratingSummary(ride({}), 'admin').canRate).toBe(true);
    expect(ratingSummary(ride({ status: 'cancelled' }), 'passenger')).toEqual({ given: null, received: null, comment: null, canRate: false });
    expect(ratingSummary(ride({ status: 'in_progress' }), 'driver').canRate).toBe(false);
  });
});

describe('ratingBadge', () => {
  it('puan ve sayıyı kısaltır; puan yoksa null', () => {
    expect(ratingBadge(4.8, 12)).toBe('⭐ 4.8 (12)');
    expect(ratingBadge(4.8)).toBe('⭐ 4.8');
    expect(ratingBadge(null)).toBeNull();
    expect(ratingBadge(undefined, 3)).toBeNull();
  });
});
