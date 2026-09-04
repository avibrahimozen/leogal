import type { Ride, RideUpdatePayload } from '../types';

/** Yolcu ekranının olay sonrası yapacağı ek iş (uyarı / puanlama). */
export type PassengerRideEvent =
  | { type: 'completed'; ride: Ride }
  | { type: 'no_driver' }
  | { type: 'reassigned' }
  /** Sürücü yolculuk sırasında bitirdi (ücret alınmaz) */
  | { type: 'driver_ended' };

export interface PassengerRideResult {
  ride: Ride | null;
  event: PassengerRideEvent | null;
}

function readIdAndStatus(payload: RideUpdatePayload) {
  return {
    id: payload.rideId ?? payload.ride?.id,
    status: payload.status ?? payload.ride?.status,
    reason: payload.cancelReason ?? payload.ride?.cancelReason ?? null,
  };
}

/**
 * Yolcu için `ride:update` olayını uygular. Saf fonksiyon: yan etkileri
 * (uyarı, puanlama) `event` ile bildirir, ekran bunları kendisi yapar.
 * `ride` nesnesi olmayan olaylarda (zaman aşımı iptali) da güvenle çalışır.
 */
export function applyPassengerRideUpdate(current: Ride | null, payload: RideUpdatePayload): PassengerRideResult {
  const { id, status, reason } = readIdAndStatus(payload);
  if (id === undefined || status === undefined) return { ride: current, event: null };
  // Başka bir çağrıya ait olay: yok say
  if (current && id !== current.id) return { ride: current, event: null };

  if (payload.reassigned) {
    // Sürücü iptal etti, çağrı yeniden yayınlandı: arama durumunda kal
    const ride =
      payload.ride ?? (current ? { ...current, status: 'requested' as const, driver: null, cancelReason: null } : null);
    return { ride, event: ride ? { type: 'reassigned' } : null };
  }
  if (status === 'completed') {
    const completed = payload.ride ?? current;
    return { ride: null, event: completed ? { type: 'completed', ride: completed } : null };
  }
  if (status === 'cancelled') {
    if (reason === 'no_driver') return { ride: null, event: { type: 'no_driver' } };
    if (reason === 'driver_cancelled') {
      // Sunucu bu iptalin hemen ardından ya çağrıyı yeniden yayınlar (reassigned)
      // ya da 'no_driver' ile kapatır; kartı kapatmak yerine aramaya dön, uyarıyı
      // takip eden olay verir.
      return {
        ride: current ? { ...current, status: 'requested', driver: null, cancelReason: null } : null,
        event: null,
      };
    }
    if (reason === 'driver_ended') return { ride: null, event: { type: 'driver_ended' } };
    // passenger_cancelled / passenger_ended: yolcu zaten biliyor, sessizce kapat
    return { ride: null, event: null };
  }
  // requested / accepted / arrived / in_progress
  return { ride: payload.ride ?? (current ? { ...current, status } : null), event: null };
}

export type DriverRideEvent = 'passenger_cancelled' | 'passenger_ended' | null;

export interface DriverRideResult {
  ride: Ride | null;
  event: DriverRideEvent;
}

/** Sürücü için `ride:update` olayını uygular (saf fonksiyon). */
export function applyDriverRideUpdate(current: Ride | null, payload: RideUpdatePayload): DriverRideResult {
  const { id, status, reason } = readIdAndStatus(payload);
  if (id === undefined || status === undefined) return { ride: current, event: null };
  if (current && id !== current.id) return { ride: current, event: null };

  if (status === 'cancelled') {
    // Elimizde olmayan çağrının iptali ya da sürücünün kendi iptali/bitirmesi: uyarı yok
    if (!current || reason === 'driver_cancelled' || reason === 'driver_ended') return { ride: null, event: null };
    if (reason === 'passenger_ended') return { ride: null, event: 'passenger_ended' };
    return { ride: null, event: 'passenger_cancelled' };
  }
  // Tamamlandı (puanlama zaten POST yanıtıyla açılır) veya yeniden yayına düştü: artık bizim değil
  if (status === 'completed' || status === 'requested') return { ride: null, event: null };
  // accepted / arrived / in_progress: sunucu bize atadıysa göster
  return { ride: payload.ride ?? (current ? { ...current, status } : null), event: null };
}
