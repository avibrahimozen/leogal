import type { Ride, Role } from '../types';

/** Geçmiş ekranındaki puan satırları: verdiğin, aldığın, yorumun ve sonradan puanlanabilir mi */
export interface RatingSummary {
  given: string | null;
  received: string | null;
  comment: string | null;
  canRate: boolean;
}

type RideRatingFields = Pick<Ride, 'status' | 'passengerRating' | 'driverRating' | 'passengerComment' | 'driverComment'>;

/**
 * Bakan kişinin rolüne göre puan özetini üretir. Yönetici uygulamada yolcu gibi davranır.
 * Yalnızca tamamlanan yolculuklar puanlanır; iptal/bitirilenlerde puan yoktur.
 */
export function ratingSummary(ride: RideRatingFields, role: Role): RatingSummary {
  if (ride.status !== 'completed') return { given: null, received: null, comment: null, canRate: false };
  if (role === 'driver') {
    return {
      given: ride.driverRating ? `Yolcuya ⭐ ${ride.driverRating} verdin` : null,
      received: ride.passengerRating ? `Yolcu sana ⭐ ${ride.passengerRating} verdi` : null,
      comment: ride.driverComment ?? null,
      canRate: ride.driverRating === null,
    };
  }
  return {
    given: ride.passengerRating ? `Sürücüye ⭐ ${ride.passengerRating} verdin` : null,
    received: ride.driverRating ? `Sürücü sana ⭐ ${ride.driverRating} verdi` : null,
    comment: ride.passengerComment ?? null,
    canRate: ride.passengerRating === null,
  };
}

/** "⭐ 4.8 (12)" biçiminde kısa puan etiketi; puan yoksa null */
export function ratingBadge(rating: number | null | undefined, count?: number): string | null {
  if (!rating) return null;
  return count ? `⭐ ${rating} (${count})` : `⭐ ${rating}`;
}
