import type { CountryCode } from './regions';

/** Sık gidilen yerler — hedef seçicide arama boşken gösterilen yerel liste (şimdilik yalnızca KKTC). */
export interface Place {
  name: string;
  city: string;
  country: CountryCode;
  lat: number;
  lng: number;
}

/** Lefkoşa merkezi — konum alınamadığında KKTC odaklı ekranların varsayılanı. */
export const KKTC_CENTER = { lat: 35.1856, lng: 33.3823 };

/**
 * Türkiye ve Kıbrıs'ı birlikte kapsayan başlangıç harita bölgesi (react-native-maps Region).
 * Kullanıcı konumu gelene kadar iki ülkede de anlamlı bir açılış görünümü verir.
 */
export const DEFAULT_REGION = {
  latitude: 37.8,
  longitude: 33.5,
  latitudeDelta: 12,
  longitudeDelta: 14,
} as const;

export const PLACES: Place[] = [
  { name: 'Ercan Havalimanı', city: 'Lefkoşa', country: 'KKTC', lat: 35.1547, lng: 33.4961 },
  { name: 'Dereboyu Caddesi', city: 'Lefkoşa', country: 'KKTC', lat: 35.1897, lng: 33.3573 },
  { name: 'Girne Kapısı', city: 'Lefkoşa', country: 'KKTC', lat: 35.1786, lng: 33.3609 },
  { name: 'Yakın Doğu Üniversitesi', city: 'Lefkoşa', country: 'KKTC', lat: 35.2263, lng: 33.3233 },
  { name: 'Lefkoşa Devlet Hastanesi', city: 'Lefkoşa', country: 'KKTC', lat: 35.1651, lng: 33.3465 },
  { name: 'Girne Limanı', city: 'Girne', country: 'KKTC', lat: 35.3417, lng: 33.3223 },
  { name: 'Girne Amerikan Üniversitesi', city: 'Girne', country: 'KKTC', lat: 35.3253, lng: 33.2861 },
  { name: 'Bellapais Manastırı', city: 'Girne', country: 'KKTC', lat: 35.3057, lng: 33.3553 },
  { name: 'Alsancak Merkez', city: 'Girne', country: 'KKTC', lat: 35.3459, lng: 33.1919 },
  { name: 'Salamis Harabeleri', city: 'Gazimağusa', country: 'KKTC', lat: 35.1867, lng: 33.9006 },
  { name: 'Doğu Akdeniz Üniversitesi', city: 'Gazimağusa', country: 'KKTC', lat: 35.1419, lng: 33.9072 },
  { name: 'Gazimağusa Suriçi', city: 'Gazimağusa', country: 'KKTC', lat: 35.1246, lng: 33.9414 },
  { name: 'Güzelyurt Merkez', city: 'Güzelyurt', country: 'KKTC', lat: 35.1988, lng: 32.9917 },
  { name: 'İskele Long Beach', city: 'İskele', country: 'KKTC', lat: 35.2825, lng: 33.9106 },
  { name: 'Lefke Avrupa Üniversitesi', city: 'Lefke', country: 'KKTC', lat: 35.1178, lng: 32.8517 },
];
