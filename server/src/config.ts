import type { CountryCode } from './lib/regions.js';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'ulak-dev-secret-change-in-production',
  jwtExpiresIn: '30d',
  dbPath: process.env.ULAK_DB_PATH ?? 'ulak.db',
  // Sürücü konumu bu süreden eskiyse eşleştirmede aday sayılmaz (ms)
  driverLocationTtlMs: 120_000,
  // Bir çağrı bu süre içinde kabul edilmezse otomatik iptal edilir (ms)
  rideOfferTimeoutMs: 90_000,
  // Çağrı yayını: alıcıya en yakın bu kadar sürücüye teklif gider
  offerBatchSize: 8,
  // Eşleştirme yarıçapı (km)
  matchRadiusKm: 15,
  // Kuş uçuşu mesafeden yol mesafesi tahmini için çarpan
  roadFactor: 1.3,
  adminPhone: process.env.ULAK_ADMIN_PHONE ?? '+903920000000',
  adminPassword: process.env.ULAK_ADMIN_PASSWORD ?? 'ulak-admin',
  // SMS / OTP telefon doğrulama
  smsProvider: (process.env.SMS_PROVIDER ?? 'console') as 'console' | 'twilio',
  // false yapılırsa kayıt sırasında SMS doğrulaması istenmez (yalnızca yerel geliştirme için)
  otpRequired: (process.env.ULAK_OTP_REQUIRED ?? 'true') !== 'false',
  otpTtlMs: 5 * 60_000,
  otpResendCooldownMs: 45_000,
  otpMaxAttempts: 5,
  otpMaxSendsPerHour: 5,
  otpVerifiedTokenTtl: '15m',
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    from: process.env.TWILIO_FROM ?? '',
  },
} as const;

/** Ücret ve komisyon varsayılanları (TL). Çalışma anında settings tablosundan okunur. */
export const defaultSettings = {
  base_fare: '90',
  per_km: '25',
  min_fare: '150',
  commission_rate: '0.15',
} as const;

export type SettingKey = keyof typeof defaultSettings;

/**
 * Ülkeye özel tarife varsayılanları (TL). İlk açılışta settings tablosuna
 * `${ülke}:${anahtar}` biçiminde bir kez yazılır; yönetici panelden değiştirebilir
 * ya da kaldırıp genel tarifeye dönebilir. Tanımlı olmayan anahtarlar (örn.
 * commission_rate) genel değere düşer.
 *
 * DİKKAT: Türkiye değerleri YER TUTUCUDUR — gerçek tarife, şehir bazlı resmi
 * taksimetre ücretleri ve saha verisiyle belirlenmelidir.
 */
export const defaultCountrySettings: Readonly<
  Partial<Record<CountryCode, Readonly<Partial<Record<SettingKey, string>>>>>
> = {
  TR: {
    base_fare: '42',
    per_km: '28',
    min_fare: '150',
  },
};
