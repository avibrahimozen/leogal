import type { Ride } from '../../types';
import {
  bearing,
  driverLegTargets,
  followTargets,
  haversineKm,
  movedBeyond,
  resolveHeading,
  routeKey,
  trimRouteToPosition,
} from '../geo';

const LEFKOSA = { lat: 35.1856, lng: 33.3823 };
const GIRNE = { lat: 35.3417, lng: 33.3223 };
/** ~200 m kuzey */
const NORTH_200M = { lat: LEFKOSA.lat + 0.0018, lng: LEFKOSA.lng };
/** ~2 m kuzey (GPS gürültüsü) */
const JITTER = { lat: LEFKOSA.lat + 0.00002, lng: LEFKOSA.lng };

function ride(overrides: Partial<Ride>): Pick<Ride, 'status' | 'pickup' | 'drop' | 'stops'> {
  return {
    status: 'accepted',
    pickup: { ...LEFKOSA, address: 'Lefkoşa' },
    drop: { ...GIRNE, address: 'Girne' },
    ...overrides,
  };
}

describe('haversineKm / bearing', () => {
  it('Lefkoşa–Girne yaklaşık 18 km', () => {
    const km = haversineKm(LEFKOSA, GIRNE);
    expect(km).toBeGreaterThan(17.5);
    expect(km).toBeLessThan(19);
    expect(haversineKm(LEFKOSA, LEFKOSA)).toBe(0);
  });

  it('kuzey 0°, doğu 90°, güney 180°', () => {
    expect(Math.round(bearing({ lat: 35, lng: 33 }, { lat: 36, lng: 33 }))).toBe(0);
    expect(Math.round(bearing({ lat: 35, lng: 33 }, { lat: 35, lng: 34 }))).toBe(90);
    expect(Math.round(bearing({ lat: 35, lng: 33 }, { lat: 34, lng: 33 }))).toBe(180);
  });
});

describe('resolveHeading', () => {
  it('bildirilen geçerli yön her zaman kazanır (360 → 0)', () => {
    expect(resolveHeading(LEFKOSA, NORTH_200M, 45, 10)).toBe(45);
    expect(resolveHeading(null, NORTH_200M, 360, null)).toBe(0);
  });

  it('geçersiz yön (-1, NaN) yok sayılır ve hareketten hesaplanır', () => {
    expect(Math.round(resolveHeading(LEFKOSA, NORTH_200M, -1, null) ?? -1)).toBe(0);
    expect(Math.round(resolveHeading(LEFKOSA, NORTH_200M, Number.NaN, null) ?? -1)).toBe(0);
  });

  it('5 m altındaki kıpırdanmada önceki yön korunur; ilk konumda yön yoktur', () => {
    expect(resolveHeading(LEFKOSA, JITTER, null, 270)).toBe(270);
    expect(resolveHeading(null, LEFKOSA, null, null)).toBeNull();
  });
});

describe('movedBeyond', () => {
  it('başlangıç yoksa true; eşik altında false, üstünde true', () => {
    expect(movedBeyond(null, LEFKOSA, 0.12)).toBe(true);
    expect(movedBeyond(LEFKOSA, JITTER, 0.12)).toBe(false);
    expect(movedBeyond(LEFKOSA, NORTH_200M, 0.12)).toBe(true);
  });
});

describe('trimRouteToPosition', () => {
  const route = [
    { lat: 35.18, lng: 33.38 },
    { lat: 35.19, lng: 33.38 },
    { lat: 35.2, lng: 33.38 },
    { lat: 35.21, lng: 33.38 },
  ];

  it('araç bir köşenin yakınındaysa öncesini atar ve araçtan başlar', () => {
    const pos = { lat: 35.1902, lng: 33.38 }; // 2. köşeye ~20 m
    expect(trimRouteToPosition(route, pos)).toEqual([pos, route[2], route[3]]);
  });

  it('araç rotadan uzaksa rotanın tamamını araç konumuna bağlar', () => {
    const pos = { lat: 35.18, lng: 33.4 }; // ~1.8 km doğu
    expect(trimRouteToPosition(route, pos)).toEqual([pos, ...route]);
  });

  it('boş rota için yalnızca araç konumu', () => {
    expect(trimRouteToPosition([], LEFKOSA)).toEqual([LEFKOSA]);
  });
});

describe('driverLegTargets / followTargets', () => {
  it('alışa giderken hedef alış noktası, yolculukta duraklar + varış', () => {
    const stop = { lat: 35.25, lng: 33.35, address: 'Durak' };
    expect(driverLegTargets(ride({ status: 'accepted' }))).toEqual([{ ...LEFKOSA, address: 'Lefkoşa' }]);
    expect(driverLegTargets(ride({ status: 'arrived' }))).toHaveLength(1);
    expect(driverLegTargets(ride({ status: 'in_progress', stops: [stop] }))).toEqual([stop, { ...GIRNE, address: 'Girne' }]);
    expect(driverLegTargets(ride({ status: 'requested' }))).toEqual([]);
  });

  it('kamera: araç + sıradaki hedef; hedef yoksa yalnız araç', () => {
    const driver = { lat: 35.2, lng: 33.4 };
    expect(followTargets(driver, ride({ status: 'accepted' }))).toEqual([driver, LEFKOSA]);
    expect(followTargets(driver, ride({ status: 'completed' }))).toEqual([driver]);
  });
});

describe('routeKey', () => {
  it('4 ondalığa yuvarlar ve | ile birleştirir', () => {
    expect(routeKey([{ lat: 35.18564, lng: 33.38231 }, GIRNE])).toBe('35.1856,33.3823|35.3417,33.3223');
    expect(routeKey([])).toBe('');
  });
});
