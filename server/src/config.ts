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
} as const;

/** Ücret ve komisyon varsayılanları (TL). Çalışma anında settings tablosundan okunur. */
export const defaultSettings = {
  base_fare: '90',
  per_km: '25',
  min_fare: '150',
  commission_rate: '0.15',
} as const;

export type SettingKey = keyof typeof defaultSettings;
