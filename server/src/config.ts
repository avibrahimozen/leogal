import type { CountryCode } from './lib/regions.js';
/**
 * Varsayılan gizli değerler — yalnızca yerel geliştirme içindir.
 * NODE_ENV=production iken bu değerlerle sunucu başlatılmaz (bkz. assertProductionSecrets).
 */
export const DEFAULT_JWT_SECRET = 'ulak-dev-secret-change-in-production';
export const DEFAULT_ADMIN_PASSWORD = 'ulak-admin';
/** Üretimde JWT gizli anahtarı için asgari uzunluk (HS256 için kaba kuvvete karşı). */
export const MIN_JWT_SECRET_LENGTH = 32;

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET,
  jwtExpiresIn: '30d',
  dbPath: process.env.ULAK_DB_PATH ?? 'ulak.db',
  // Ters vekil (nginx, Caddy, yük dengeleyici) arkasında gerçek istemci IP'sini
  // X-Forwarded-For başlığından okumak için TRUST_PROXY=1. Doğrudan internete
  // açık sunucuda KAPALI kalmalı; aksi halde istemci IP'sini sahteleyebilir.
  trustProxy: process.env.TRUST_PROXY === '1',
  // JSON istek gövdesi üst sınırı (express.json). Aşılırsa 413 döner.
  jsonBodyLimit: '100kb',
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
  /**
   * Yol rotalama (OSRM). ULAK_ROUTING=none ile kapatılır; testlerde (NODE_ENV=test)
   * ağ erişimi olmasın diye varsayılan kapalıdır. Kapalıyken düz çizgi × yol çarpanı.
   */
  routing: {
    enabled: (process.env.ULAK_ROUTING ?? (process.env.NODE_ENV === 'test' ? 'none' : 'osrm')) === 'osrm',
    osrmBaseUrl: (process.env.ULAK_OSRM_URL ?? 'https://router.project-osrm.org').replace(/\/+$/, ''),
    timeoutMs: 4000,
  },
  /**
   * Puana göre eşleştirme önceliği (bkz. lib/ranking.ts). Adaylar mesafe + puan cezasıyla
   * sıralanır: 5 yıldızdan her eksik yıldız kmPerStar km uzaklık gibi sayılır. minRatings'ten az
   * puanı olan sürücü nötr (neutralRating) kabul edilir. Ortalaması lowRatingThreshold altına
   * düşen sürücü lowRatingPenaltyKm ek ceza alır ve yönetici panelinde işaretlenir.
   */
  ratingPriority: {
    kmPerStar: 0.5,
    minRatings: 3,
    neutralRating: 4.5,
    lowRatingThreshold: 3.5,
    lowRatingPenaltyKm: 3,
  },
  adminPhone: process.env.ULAK_ADMIN_PHONE ?? '+903920000000',
  adminPassword: process.env.ULAK_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD,
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

/** Pozitif tam sayı ortam değişkeni; yoksa/geçersizse varsayılan. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * HTTP hız sınırları (kayan pencere; bkz. lib/rateLimit.ts).
 * Kasıtlı olarak değiştirilebilir bir nesnedir: testler createApp'ten önce
 * değerleri düşürür; üretimde ULAK_RL_* ortam değişkenleriyle ayarlanır
 * (örn. yerel bot/demo koşularında ULAK_RL_LOGIN_IP yükseltilebilir).
 */
export const rateLimits = {
  /** POST /api/auth/login — telefon numarası başına */
  loginPerPhone: { windowMs: 15 * 60_000, max: envInt('ULAK_RL_LOGIN_PHONE', 10) },
  /** POST /api/auth/login — IP başına */
  loginPerIp: { windowMs: 15 * 60_000, max: envInt('ULAK_RL_LOGIN_IP', 30) },
  /** POST /api/auth/otp/request — IP başına (telefon başına sınır OtpService içinde) */
  otpRequestPerIp: { windowMs: 60 * 60_000, max: envInt('ULAK_RL_OTP_IP', 20) },
  /** GET /api/public/nearby-drivers — IP başına */
  nearbyPerIp: { windowMs: 60_000, max: envInt('ULAK_RL_NEARBY_IP', 120) },
  /** Yol rotası ucu (OSRM vekili): IP başına dakikada 60 */
  routePerIp: { windowMs: 60_000, max: envInt('ULAK_RL_ROUTE_IP', 60) },
};

type Env = Record<string, string | undefined>;

/** Varsayılan/zayıf gizli değerleri listeler (boşsa sorun yok). Saf fonksiyon. */
export function findWeakSecrets(env: Env): string[] {
  const problems: string[] = [];
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === DEFAULT_JWT_SECRET) {
    problems.push("JWT_SECRET varsayılan değerde (oturum token'ları herkes tarafından üretilebilir)");
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET çok kısa (en az ${MIN_JWT_SECRET_LENGTH} karakter olmalı)`);
  }
  const adminPassword = env.ULAK_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword === DEFAULT_ADMIN_PASSWORD) {
    problems.push('ULAK_ADMIN_PASSWORD varsayılan değerde (yönetici hesabı herkese açık)');
  }
  return problems;
}

/**
 * Başlangıç güvenlik denetimi. Saf fonksiyondur: yalnızca verilen `env`'i okur,
 * uyarıları `warn` geri çağrısıyla bildirir (test için enjekte edilebilir).
 *
 *  - NODE_ENV=production: varsayılan/zayıf gizli değerlerle Error fırlatır (sunucu başlamaz);
 *    OTP kapalıysa veya SMS sağlayıcısı console ise (kod API yanıtında sızar) uyarır.
 *  - Diğer ortamlar: tek satırlık uyarı yazar, başlatmayı engellemez.
 */
export function assertProductionSecrets(env: Env, warn: (message: string) => void = console.warn): void {
  const production = env.NODE_ENV === 'production';
  const problems = findWeakSecrets(env);

  if (production) {
    if (problems.length > 0) {
      throw new Error(
        `Üretim ortamında (NODE_ENV=production) güvensiz yapılandırmayla başlatılamaz: ${problems.join('; ')}. ` +
          'JWT_SECRET için rastgele ve uzun bir değer (örn. `openssl rand -base64 48`), ' +
          'ULAK_ADMIN_PASSWORD için güçlü bir şifre ayarlayıp sunucuyu yeniden başlatın.',
      );
    }
    const notes: string[] = [];
    const otpRequired = env.ULAK_OTP_REQUIRED !== 'false';
    if (!otpRequired) {
      notes.push('ULAK_OTP_REQUIRED=false — kayıtta telefon doğrulaması yapılmıyor');
    } else if ((env.SMS_PROVIDER ?? 'console') === 'console') {
      notes.push(
        'SMS_PROVIDER=console — OTP kodu API yanıtında (devCode) döner, telefon doğrulaması etkisizdir; SMS_PROVIDER=twilio kullanın',
      );
    }
    if (notes.length > 0) warn(`⚠️  Güvenlik uyarısı: ${notes.join('; ')}`);
    return;
  }

  if (problems.length > 0) {
    warn(
      `⚠️  Güvenlik uyarısı: ${problems.join('; ')} — yalnızca yerel geliştirme için uygundur; üretimde sunucu başlamaz.`,
    );
  }
}

/** Ücret ve komisyon varsayılanları (TL). Çalışma anında settings tablosundan okunur. */
export const defaultSettings = {
  base_fare: '90',
  per_km: '33',
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
    per_km: '33',
    min_fare: '150',
  },
};
