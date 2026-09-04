import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import type { Ride } from '../types';

/**
 * Aktif çağrıyı sunucuyla eşitler: ekran açılınca, socket (yeniden)
 * bağlanınca ve uygulama ön plana dönünce `GET /rides/active` çekilir ve
 * sonuç `onRide` ile bildirilir. Böylece çevrimdışı ya da arka plandayken
 * kaçırılan durum değişiklikleri (kabul, iptal, tamamlanma) telafi edilir.
 *
 * Eşitlemeyi elle tetiklemek için dönen fonksiyon kullanılabilir.
 */
export function useActiveRideSync(onRide: (ride: Ride | null) => void): () => void {
  const callbackRef = useRef(onRide);
  useEffect(() => {
    callbackRef.current = onRide;
  }, [onRide]);

  // Yalnızca en son isteğin yanıtı uygulanır (gecikmiş eski yanıt yeni durumu ezmesin)
  const requestSeq = useRef(0);

  const sync = useCallback(() => {
    const seq = ++requestSeq.current;
    api
      .get<{ ride: Ride | null }>('/rides/active')
      .then((res) => {
        if (seq === requestSeq.current) callbackRef.current(res.ride);
      })
      .catch(() => {
        // Ağ hatasında mevcut durum korunur; bir sonraki tetiklemede yeniden denenir
      });
  }, []);

  useEffect(() => {
    sync();

    const socket = getSocket();
    socket?.on('connect', sync);

    let previous: AppStateStatus = AppState.currentState;
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous !== 'active') sync();
      previous = next;
    });

    return () => {
      requestSeq.current += 1; // ekran kapandıktan sonra gelen yanıtları yok say
      socket?.off('connect', sync);
      appStateSub.remove();
    };
  }, [sync]);

  return sync;
}

/**
 * Artık aktif olmayan bir çağrının son halini geçmişten bulur
 * (biz dinlemezken tamamlandı mı, iptal mi edildi?). Hata durumunda null döner.
 */
export async function fetchEndedRide(rideId: number): Promise<Ride | null> {
  try {
    const res = await api.get<{ rides: Ride[] }>('/rides/history');
    return res.rides.find((r) => r.id === rideId) ?? null;
  } catch {
    return null;
  }
}
