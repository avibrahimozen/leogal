import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Ön plan konum iznini ister ve durumunu izler.
 * Dönen değer: null = henüz bilinmiyor, true = verildi, false = reddedildi.
 * Kullanıcı Ayarlar'dan izin verip uygulamaya dönünce izin yeniden sorgulanır;
 * böylece uyarı kartı kendiliğinden kaybolur ve konum akışı başlar.
 */
export function useLocationPermission(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    Location.requestForegroundPermissionsAsync()
      .then((res) => {
        if (!cancelled) setGranted(res.granted);
      })
      .catch(() => {
        if (!cancelled) setGranted(false);
      });

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      Location.getForegroundPermissionsAsync()
        .then((res) => {
          if (!cancelled) setGranted(res.granted);
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return granted;
}
