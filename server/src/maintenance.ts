import type { Db } from './db.js';
import type { Hub } from './realtime.js';

/** Bu süredir konum bildirmeyen çevrimiçi sürücü "düşmüş" sayılır ve çevrimdışı yapılır (ms). */
export const STALE_ONLINE_MS = 5 * 60_000;

/** Süpürmenin varsayılan çalışma aralığı (ms). */
export const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

/**
 * Uygulaması kapanan/çöken sürücüler is_online = 1 olarak kalır. Eşleştirme
 * onları zaten eski konum nedeniyle görmez; ama yönetim paneli ve istatistikler
 * çevrimiçi sayar. Bu süpürme, konumu 5 dakikadan eski (veya hiç olmayan)
 * çevrimiçi onaylı sürücüleri çevrimdışına çeker ve id'lerini döner.
 */
export function sweepStaleDrivers(db: Db, now: number = Date.now()): number[] {
  const cutoff = new Date(now - STALE_ONLINE_MS).toISOString();
  const rows = db
    .prepare(
      `UPDATE drivers SET is_online = 0
       WHERE is_online = 1 AND status = 'approved' AND (location_at IS NULL OR location_at < ?)
       RETURNING user_id`,
    )
    .all(cutoff) as unknown as Array<{ user_id: number }>;
  return rows.map((r) => r.user_id);
}

/**
 * Periyodik bakım işlerini başlatır (şimdilik: düşen sürücü süpürmesi).
 * İlk süpürme hemen çalışır. Zamanlayıcı süreci ayakta tutmaz (unref).
 * Durdurmak için dönen fonksiyonu çağırın.
 */
export function startMaintenance(db: Db, hub: Hub, options: { intervalMs?: number } = {}): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;

  const run = (): void => {
    try {
      const swept = sweepStaleDrivers(db);
      for (const driverId of swept) {
        // Uygulama hâlâ açıksa durumunu tazelesin diye haber ver
        hub.emitToUser(driverId, 'driver:status', { status: 'approved', online: false, reason: 'stale_location' });
      }
      if (swept.length > 0) {
        console.log(`🧹 ${swept.length} sürücü konum bildirmediği için çevrimdışı yapıldı`);
      }
    } catch (e) {
      console.error('Bakım süpürmesi hatası:', e);
    }
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
