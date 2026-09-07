import * as Location from 'expo-location';
import { useCallback, useState, type RefObject } from 'react';
import { Platform } from 'react-native';
import { openAppSettings, showAlert } from '../lib/alert';
import type { MapHandle } from '../components/map';

export type LatLng = { lat: number; lng: number };

/**
 * "Konumuma git" davranışı: izni ister, güncel konumu alır, haritayı o noktaya
 * yakınlaştırır ve isteğe bağlı olarak ekrana konumu bildirir. İzin yoksa Ayarlar'a
 * yönlendiren bir uyarı gösterir. `locating` düğmede bekleme göstergesi için.
 */
export function useCenterOnMe(mapRef: RefObject<MapHandle | null>, onLocated?: (coords: LatLng) => void) {
  const [locating, setLocating] = useState(false);

  const centerOnMe = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        if (Platform.OS === 'web') {
          showAlert('Konum izni gerekli', 'Tarayıcının adres çubuğundan bu site için konum iznini aç ve sayfayı yenile.');
          return;
        }
        showAlert('Konum izni gerekli', "Konumuna gidebilmek için Ayarlar'dan konum izni ver.", [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: "Ayarlar'ı Aç",
            onPress: () => {
              openAppSettings();
            },
          },
        ]);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      mapRef.current?.animateToRegion(
        { latitude: coords.lat, longitude: coords.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500,
      );
      onLocated?.(coords);
    } catch {
      showAlert('Konum alınamadı', 'GPS sinyali yok ya da konum servisleri kapalı görünüyor.');
    } finally {
      setLocating(false);
    }
  }, [locating, mapRef, onLocated]);

  return { centerOnMe, locating };
}
