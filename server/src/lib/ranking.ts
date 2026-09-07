import { config } from '../config.js';

/**
 * Puana göre eşleştirme önceliği. Saf fonksiyonlar; Matcher adayları bununla sıralar.
 *
 * Skor = mesafe (km) + (5 − etkin puan) × kmPerStar [+ düşük puan cezası]. Daha düşük skor
 * önce teklif alır. Henüz yeterli puanı olmayan sürücü nötr puanla değerlendirilir ki yeni
 * sürücü cezalandırılmasın; düşük puanlı sürücü uzaktaymış gibi geriye düşer ama radyus
 * içinde başka aday yoksa yine de teklif alır.
 */
export interface RatingInput {
  ratingSum: number;
  ratingCount: number;
}

/** Ortalama puan (1 ondalık); hiç puan yoksa null. */
export function averageRating(r: RatingInput): number | null {
  return r.ratingCount > 0 ? Math.round((r.ratingSum / r.ratingCount) * 10) / 10 : null;
}

/** Sıralamada kullanılan puan: yeterli puan yoksa nötr değer. */
export function effectiveRating(r: RatingInput): number {
  const { minRatings, neutralRating } = config.ratingPriority;
  if (r.ratingCount < minRatings) return neutralRating;
  return r.ratingSum / r.ratingCount;
}

/** Yönetici uyarısı ve ek ceza eşiği: yeterli puanı var ve ortalaması eşiğin altında. */
export function isLowRated(r: RatingInput): boolean {
  const { minRatings, lowRatingThreshold } = config.ratingPriority;
  return r.ratingCount >= minRatings && r.ratingSum / r.ratingCount < lowRatingThreshold;
}

/** Aday skoru: küçük olan önce. */
export function candidateScore(distanceKm: number, r: RatingInput): number {
  const { kmPerStar, lowRatingPenaltyKm } = config.ratingPriority;
  const penalty = (5 - effectiveRating(r)) * kmPerStar + (isLowRated(r) ? lowRatingPenaltyKm : 0);
  return Math.round((distanceKm + penalty) * 1000) / 1000;
}
