/**
 * Bölge tanımları: Ulak'ın hizmet verdiği ülkeler ve şehir listeleri.
 *
 * Şehir listeleri sürücü kaydında doğrulama için, ülke kodu ise tarife
 * seçiminde kullanılır. Mobil uygulama aynı listeyi GET /api/public/regions
 * üzerinden alır; burası tek doğruluk kaynağıdır.
 */

export type CountryCode = 'KKTC' | 'TR';

export interface Country {
  code: CountryCode;
  name: string;
  /** Türkçe alfabetik sıralı şehir/il listesi. */
  cities: readonly string[];
}

const KKTC_CITIES = ['Lefkoşa', 'Girne', 'Gazimağusa', 'Güzelyurt', 'İskele', 'Lefke'] as const;

/** Türkiye'nin 81 ili — Türkçe alfabetik sırayla (ı < i; ç, ğ, ö, ş, ü kendi yerlerinde). */
const TR_CITIES = [
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
] as const;

export const COUNTRIES: Readonly<Record<CountryCode, Country>> = {
  KKTC: { code: 'KKTC', name: 'Kuzey Kıbrıs', cities: KKTC_CITIES },
  TR: { code: 'TR', name: 'Türkiye', cities: TR_CITIES },
};

export const COUNTRY_CODES: readonly CountryCode[] = ['KKTC', 'TR'];

export function isCountryCode(value: unknown): value is CountryCode {
  return value === 'KKTC' || value === 'TR';
}

/**
 * Kıbrıs adasını kabaca çevreleyen kutu. İçindeki noktalar KKTC tarifesine,
 * dışındaki her nokta Türkiye tarifesine tabidir. (Ada dışında hizmet verilen
 * tek ülke Türkiye olduğundan daha ince bir sınır testine gerek yok.)
 */
const CYPRUS_BBOX = { minLat: 34.5, maxLat: 35.75, minLng: 32.2, maxLng: 34.65 } as const;

/** Verilen koordinatın hangi ülke tarifesine girdiğini döner. */
export function regionForPoint(lat: number, lng: number): CountryCode {
  const inCyprus =
    lat >= CYPRUS_BBOX.minLat && lat <= CYPRUS_BBOX.maxLat && lng >= CYPRUS_BBOX.minLng && lng <= CYPRUS_BBOX.maxLng;
  return inCyprus ? 'KKTC' : 'TR';
}

/** Şehir adı ilgili ülkenin listesinde (birebir yazımla) var mı? */
export function isValidCity(country: CountryCode, city: string): boolean {
  return COUNTRIES[country].cities.includes(city);
}
