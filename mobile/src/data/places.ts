/** KKTC'de sık gidilen yerler — MVP hedef seçimi için yerel liste. */
export interface Place {
  name: string;
  city: string;
  lat: number;
  lng: number;
}

export const KKTC_CENTER = { lat: 35.1856, lng: 33.3823 };

export const PLACES: Place[] = [
  { name: 'Ercan Havalimanı', city: 'Lefkoşa', lat: 35.1547, lng: 33.4961 },
  { name: 'Dereboyu Caddesi', city: 'Lefkoşa', lat: 35.1897, lng: 33.3573 },
  { name: 'Girne Kapısı', city: 'Lefkoşa', lat: 35.1786, lng: 33.3609 },
  { name: 'Yakın Doğu Üniversitesi', city: 'Lefkoşa', lat: 35.2263, lng: 33.3233 },
  { name: 'Lefkoşa Devlet Hastanesi', city: 'Lefkoşa', lat: 35.1651, lng: 33.3465 },
  { name: 'Girne Limanı', city: 'Girne', lat: 35.3417, lng: 33.3223 },
  { name: 'Girne Amerikan Üniversitesi', city: 'Girne', lat: 35.3253, lng: 33.2861 },
  { name: 'Bellapais Manastırı', city: 'Girne', lat: 35.3057, lng: 33.3553 },
  { name: 'Alsancak Merkez', city: 'Girne', lat: 35.3459, lng: 33.1919 },
  { name: 'Salamis Harabeleri', city: 'Gazimağusa', lat: 35.1867, lng: 33.9006 },
  { name: 'Doğu Akdeniz Üniversitesi', city: 'Gazimağusa', lat: 35.1419, lng: 33.9072 },
  { name: 'Gazimağusa Suriçi', city: 'Gazimağusa', lat: 35.1246, lng: 33.9414 },
  { name: 'Güzelyurt Merkez', city: 'Güzelyurt', lat: 35.1988, lng: 32.9917 },
  { name: 'İskele Long Beach', city: 'İskele', lat: 35.2825, lng: 33.9106 },
  { name: 'Lefke Avrupa Üniversitesi', city: 'Lefke', lat: 35.1178, lng: 32.8517 },
];

const TR_FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

/**
 * Arama için Türkçe'ye duyarlı sadeleştirme: önce Türkçe kurallarıyla küçük
 * harfe çevirir (İ→i, I→ı), sonra Türkçe harfleri ASCII karşılığına indirger
 * ki İngilizce klavyeden yazılan "guzelyurt" da "Güzelyurt"u bulsun.
 */
export function normalizeForSearch(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (ch) => TR_FOLD[ch] ?? ch);
}

/** Yer adına veya şehre göre süzer; boş sorguda tüm liste döner. */
export function filterPlaces(query: string, places: readonly Place[] = PLACES): Place[] {
  const q = normalizeForSearch(query.trim());
  if (!q) return [...places];
  return places.filter((p) => normalizeForSearch(p.name).includes(q) || normalizeForSearch(p.city).includes(q));
}
