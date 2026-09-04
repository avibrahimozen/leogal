import { regionForPoint } from '../data/regions';
import type { Place } from '../data/places';

/**
 * OpenStreetMap Nominatim ile adres arama (ileri) ve koordinattan adres (geri) çözümleme.
 *
 * Nominatim kullanım politikası — https://operations.osmfoundation.org/policies/nominatim/
 *  - En fazla 1 istek/saniye. Bu modül tüm istekleri tek bir kuyruktan, aralarında en az
 *    1 sn bırakarak gönderir (arama + geri çözümleme aynı kuyruğu paylaşır).
 *  - Uygulamayı tanımlayan bir User-Agent (veya Referer) zorunludur. React Native'de fetch
 *    her platformda User-Agent'ı geçirmez; yine de gönderilir, ayrıca Accept-Language: tr
 *    ile Türkçe adlar istenir.
 *  - Otomatik tamamlama (her tuş vuruşunda sorgu) ve toplu coğrafi kodlama yasaktır. Bu
 *    yüzden DestinationPicker 500 ms bekler ve en az 3 karakter ister; geri çözümleme
 *    sonuçları koordinata göre önbelleğe alınır.
 *  - Sonuçlar gösterilirken "© OpenStreetMap katkıcıları" atfı yapılmalıdır.
 *
 * ÜRETİM NOTU: Ücretsiz Nominatim yalnızca geliştirme/MVP içindir; garanti ve SLA yoktur,
 * yoğun kullanımda engellenir. Gerçek trafikte ücretli bir geocoder (Google Places,
 * Mapbox Geocoding, HERE, OpenCage) ya da kendi Nominatim/Photon sunucunuz kullanılmalıdır.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT = 'UlakTaksi/0.1 (KKTC ve Turkiye taksi uygulamasi; gelistirme surumu)';

/** Arama sonucu: Place + kullanıcıya gösterilecek kısa açıklama ("Kadıköy, İstanbul"). */
export interface GeocodeResult extends Place {
  detail: string;
}

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  hamlet?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  province?: string;
  state?: string;
  country_code?: string;
}

interface NominatimPlace {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: NominatimAddress;
}

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function abortError(): Error {
  const err = new Error('İstek iptal edildi');
  err.name = 'AbortError';
  return err;
}

function buildUrl(path: string, params: Record<string, string>): string {
  const query = Object.entries({ ...params, format: 'jsonv2', 'accept-language': 'tr' })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${NOMINATIM_BASE}/${path}?${query}`;
}

/**
 * Nominatim'e sıralı ve hız sınırlı istek atar. Dış `signal` iptal edilirse istek
 * sıraya girmişse gönderilmez, gönderildiyse kesilir.
 */
function nominatimFetch<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const task = queue.then(async () => {
    if (signal?.aborted) throw abortError();
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    if (signal?.aborted) throw abortError();
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(buildUrl(path, params), {
        headers: { 'Accept-Language': 'tr', 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  });
  // Kuyruk bir hatadan dolayı kilitlenmesin
  queue = task.catch(() => undefined);
  return task;
}

function pickLocality(a: NominatimAddress | undefined): string {
  return a?.city ?? a?.town ?? a?.village ?? a?.municipality ?? a?.county ?? a?.province ?? a?.state ?? '';
}

function pickStreet(a: NominatimAddress | undefined): string {
  return a?.road ?? a?.pedestrian ?? a?.neighbourhood ?? a?.suburb ?? a?.quarter ?? a?.hamlet ?? '';
}

function toResult(item: NominatimPlace): GeocodeResult | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const segments = item.display_name.split(',').map((s) => s.trim()).filter(Boolean);
  const name = item.name?.trim() || segments[0] || '';
  if (!name) return null;
  const city = pickLocality(item.address) || segments[1] || '';
  // Açıklama: adın kendisi hariç ilk 2–3 parça (mahalle, ilçe, il)
  const detail = segments.filter((s) => s !== name).slice(0, 3).join(', ');
  return { name, city, country: regionForPoint(lat, lng), lat, lng, detail };
}

/**
 * Metinle yer arar (Türkiye + Kıbrıs). Hata durumunda fırlatır; çağıran taraf
 * kullanıcıya uygun mesajı gösterir. Boş sonuçta boş dizi döner.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  const items = await nominatimFetch<NominatimPlace[]>(
    'search',
    { q, limit: '8', countrycodes: 'tr,cy', addressdetails: '1' },
    signal,
  );
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const results: GeocodeResult[] = [];
  for (const item of items) {
    const r = toResult(item);
    if (!r) continue;
    const key = `${r.name}|${r.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(r);
  }
  return results;
}

/** Geri çözümleme önbelleği: ~11 m hassasiyetle (4 ondalık) aynı nokta tekrar sorulmaz. */
const reverseCache = new Map<string, string | null>();

/**
 * Koordinattan kısa Türkçe adres üretir: "Dereboyu, Lefkoşa" gibi.
 * Ağ hatası, zaman aşımı veya sonuç yoksa null döner — asla fırlatmaz.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = reverseCache.get(key);
  if (hit !== undefined) return hit;
  try {
    const item = await nominatimFetch<NominatimPlace & { error?: string }>('reverse', {
      lat: String(lat),
      lon: String(lng),
      zoom: '17',
      addressdetails: '1',
    });
    if (!item || item.error || !item.address) {
      reverseCache.set(key, null);
      return null;
    }
    const street = pickStreet(item.address);
    const locality = pickLocality(item.address);
    // "Dereboyu, Lefkoşa" — ikisi aynıysa tek parça; ikisi de boşsa display_name'in ilk parçası
    const parts = Array.from(new Set([street, locality].filter(Boolean)));
    const address = parts.join(', ') || item.display_name.split(',')[0]?.trim() || null;
    reverseCache.set(key, address);
    return address;
  } catch {
    return null;
  }
}
