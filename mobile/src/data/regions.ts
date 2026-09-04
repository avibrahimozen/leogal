import { api } from '../api/client';

/**
 * Hizmet verilen ülkeler ve şehir listeleri.
 *
 * Doğruluk kaynağı sunucudur (GET /api/public/regions); `fetchRegions()` sonucu
 * modül içinde önbelleğe alır. Sunucuya ulaşılamazsa aşağıdaki gömülü liste
 * kullanılır, böylece sürücü kaydı çevrimdışıyken de çalışır.
 */

export type CountryCode = 'KKTC' | 'TR';

export interface Country {
  code: CountryCode;
  name: string;
  cities: string[];
}

export interface Regions {
  countries: Country[];
}

export const COUNTRY_NAMES: Record<CountryCode, string> = {
  KKTC: 'Kuzey Kıbrıs',
  TR: 'Türkiye',
};

const KKTC: Country = {
  code: 'KKTC',
  name: 'Kuzey Kıbrıs',
  cities: ['Lefkoşa', 'Girne', 'Gazimağusa', 'Güzelyurt', 'İskele', 'Lefke'],
};

/** Türkiye'nin 81 ili — Türkçe alfabetik sırayla; sunucudaki listeyle birebir aynı. */
const TR: Country = {
  code: 'TR',
  name: 'Türkiye',
  cities: [
    'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın',
    'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa',
    'Çanakkale', 'Çankırı', 'Çorum',
    'Denizli', 'Diyarbakır', 'Düzce',
    'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir',
    'Gaziantep', 'Giresun', 'Gümüşhane',
    'Hakkâri', 'Hatay',
    'Iğdır', 'Isparta',
    'İstanbul', 'İzmir',
    'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya',
    'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
    'Nevşehir', 'Niğde',
    'Ordu', 'Osmaniye',
    'Rize',
    'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas',
    'Şanlıurfa', 'Şırnak',
    'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli',
    'Uşak',
    'Van',
    'Yalova', 'Yozgat',
    'Zonguldak',
  ],
};

/** Çevrimdışı yedek: sunucu listesiyle aynı içerik. */
export const BUNDLED_REGIONS: Regions = { countries: [KKTC, TR] };

let cached: Regions | null = null;
let inflight: Promise<Regions> | null = null;

function isRegions(value: unknown): value is Regions {
  if (!value || typeof value !== 'object') return false;
  const countries = (value as { countries?: unknown }).countries;
  return (
    Array.isArray(countries) &&
    countries.length > 0 &&
    countries.every(
      (c) =>
        c &&
        typeof c === 'object' &&
        typeof (c as Country).code === 'string' &&
        typeof (c as Country).name === 'string' &&
        Array.isArray((c as Country).cities),
    )
  );
}

/**
 * Bölge listesini getirir. Başarılı ilk yanıt önbelleğe alınır; hata olursa
 * gömülü liste döner ve bir sonraki çağrıda yeniden denenir.
 */
export function fetchRegions(): Promise<Regions> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = api
    .get<unknown>('/public/regions')
    .then((res) => {
      if (!isRegions(res)) return BUNDLED_REGIONS;
      cached = res;
      return res;
    })
    .catch(() => BUNDLED_REGIONS)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Koddan ülkeyi bulur; bilinmiyorsa gömülü KKTC kaydına düşer. */
export function countryByCode(regions: Regions, code: CountryCode): Country {
  return regions.countries.find((c) => c.code === code) ?? (code === 'TR' ? TR : KKTC);
}

/**
 * Kıbrıs adasını çevreleyen kutu (sunucudaki lib/regions.ts ile aynı):
 * içi KKTC, dışı Türkiye sayılır.
 */
export function regionForPoint(lat: number, lng: number): CountryCode {
  return lat >= 34.5 && lat <= 35.75 && lng >= 32.2 && lng <= 34.65 ? 'KKTC' : 'TR';
}

/** Türkçe duyarlı arama normalizasyonu: küçük harf (İ→i, I→ı) ve şapkalı harfler sadeleşir. */
export function normalizeTr(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u').trim();
}
