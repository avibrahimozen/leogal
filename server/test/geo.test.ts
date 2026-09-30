import { describe, expect, it } from 'vitest';
import { commissionOf, estimateFare, haversineKm } from '../src/lib/geo.js';

// Test noktaları: KKTC şehir merkezleri (yaklaşık)
const LEFKOSA = { lat: 35.1856, lng: 33.3823 };
const GIRNE = { lat: 35.3364, lng: 33.3182 };
const MAGUSA = { lat: 35.125, lng: 33.95 };

const PARAMS = { baseFare: 90, perKm: 25, minFare: 150, roadFactor: 1.3 };

describe('haversineKm', () => {
  it('aynı nokta için 0 döner', () => {
    expect(haversineKm(LEFKOSA.lat, LEFKOSA.lng, LEFKOSA.lat, LEFKOSA.lng)).toBe(0);
  });

  it('Lefkoşa-Girne arası ~17 km', () => {
    const km = haversineKm(LEFKOSA.lat, LEFKOSA.lng, GIRNE.lat, GIRNE.lng);
    expect(km).toBeGreaterThan(15);
    expect(km).toBeLessThan(20);
  });

  it('Lefkoşa-Gazimağusa arası ~52 km', () => {
    const km = haversineKm(LEFKOSA.lat, LEFKOSA.lng, MAGUSA.lat, MAGUSA.lng);
    expect(km).toBeGreaterThan(48);
    expect(km).toBeLessThan(56);
  });
});

describe('estimateFare', () => {
  it('kısa mesafede asgari ücret uygulanır', () => {
    // ~500 m'lik yolculuk
    const est = estimateFare(35.1856, 33.3823, 35.19, 33.3823, PARAMS);
    expect(est.fare).toBe(PARAMS.minFare);
  });

  it('uzun mesafede taban + km ücreti hesaplanır ve 5 TL"ye yuvarlanır', () => {
    const est = estimateFare(LEFKOSA.lat, LEFKOSA.lng, GIRNE.lat, GIRNE.lng, PARAMS);
    expect(est.distanceKm).toBeGreaterThan(20); // 17 km kuş uçuşu * 1.3 yol çarpanı
    expect(est.fare).toBeGreaterThan(PARAMS.minFare);
    expect(est.fare % 5).toBe(0);
    // Beklenen değerin makul aralıkta olduğunu doğrula: 90 + 25 * ~22.5 ≈ 650
    expect(est.fare).toBeGreaterThan(500);
    expect(est.fare).toBeLessThan(800);
  });

  it('yol çarpanı mesafeye uygulanır', () => {
    const est = estimateFare(LEFKOSA.lat, LEFKOSA.lng, GIRNE.lat, GIRNE.lng, PARAMS);
    const straight = haversineKm(LEFKOSA.lat, LEFKOSA.lng, GIRNE.lat, GIRNE.lng);
    expect(est.distanceKm).toBeCloseTo(straight * 1.3, 1);
  });
});

describe('commissionOf', () => {
  it('yüzde 15 komisyonu kuruş hassasiyetiyle hesaplar', () => {
    expect(commissionOf(650, 0.15)).toBe(97.5);
    expect(commissionOf(155, 0.15)).toBe(23.25);
  });

  it('sıfır oran sıfır komisyon verir', () => {
    expect(commissionOf(650, 0)).toBe(0);
  });
});
