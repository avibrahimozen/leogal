import {
  followStep,
  headingAt,
  OFF_ROUTE_KM,
  pathBetween,
  projectOntoRoute,
  routeLengthKm,
  SNAP_KM,
  type FollowRoute,
} from '../routeFollow';

// Kuzeye giden düz yol: 4 köşe, her parça ~111 m
const ROAD = [
  { lat: 35.18, lng: 33.38 },
  { lat: 35.181, lng: 33.38 },
  { lat: 35.182, lng: 33.38 },
  { lat: 35.183, lng: 33.38 },
];
const route: FollowRoute = { key: 'r1', points: ROAD, totalKm: routeLengthKm(ROAD) };
/** 0.0001° boylam ≈ 9 m (35° enlemde) */
const EAST_9M = 0.0001;

describe('projectOntoRoute', () => {
  it('parça ortasındaki noktayı yola diker: aynı enlem, ~9 m sapma, doğru mesafe', () => {
    const p = projectOntoRoute(ROAD, { lat: 35.1815, lng: 33.38 + EAST_9M })!;
    expect(p.segment).toBe(1);
    expect(p.t).toBeCloseTo(0.5, 2);
    expect(p.point.lat).toBeCloseTo(35.1815, 5);
    expect(p.point.lng).toBeCloseTo(33.38, 6);
    expect(p.offsetKm).toBeGreaterThan(0.008);
    expect(p.offsetKm).toBeLessThan(0.01);
    expect(p.alongKm).toBeCloseTo(routeLengthKm(ROAD.slice(0, 2)) * 1.5, 3);
  });

  it('pencere verilince yalnızca aralıktaki parçalara bakar', () => {
    const near = { lat: 35.1805, lng: 33.38 };
    expect(projectOntoRoute(ROAD, near)!.segment).toBe(0);
    const later = projectOntoRoute(ROAD, near, { minAlongKm: 0.2, maxAlongKm: 1 })!;
    expect(later.segment).toBeGreaterThanOrEqual(1);
    expect(projectOntoRoute(ROAD, near, { minAlongKm: 5, maxAlongKm: 6 })).toBeNull();
  });

  it('boş rota null, tek nokta o noktayı döner', () => {
    expect(projectOntoRoute([], ROAD[0]!)).toBeNull();
    expect(projectOntoRoute([ROAD[0]!], ROAD[1]!)!.point).toEqual(ROAD[0]);
  });
});

describe('pathBetween / headingAt', () => {
  it('ileri hareket: başlangıç, aradaki köşeler, bitiş', () => {
    const from = projectOntoRoute(ROAD, { lat: 35.1805, lng: 33.38 })!;
    const to = projectOntoRoute(ROAD, { lat: 35.1825, lng: 33.38 })!;
    const path = pathBetween(ROAD, from, to);
    expect(path).toHaveLength(4);
    expect(path[0]).toEqual(from.point);
    expect(path[1]).toEqual(ROAD[1]);
    expect(path[2]).toEqual(ROAD[2]);
    expect(path[3]).toEqual(to.point);
  });

  it('geri kayma (gürültü) doğrudan çizgi döner; köşe üstündeki tekrarlar atılır', () => {
    const from = projectOntoRoute(ROAD, { lat: 35.1825, lng: 33.38 })!;
    const to = projectOntoRoute(ROAD, { lat: 35.1805, lng: 33.38 })!;
    expect(pathBetween(ROAD, from, to)).toEqual([from.point, to.point]);
    const atVertex = projectOntoRoute(ROAD, ROAD[1]!)!;
    const ahead = projectOntoRoute(ROAD, { lat: 35.1815, lng: 33.38 })!;
    expect(pathBetween(ROAD, atVertex, ahead)).toHaveLength(2);
  });

  it('yolun yönü kuzey (0°)', () => {
    const p = projectOntoRoute(ROAD, { lat: 35.1815, lng: 33.38 })!;
    expect(Math.round(headingAt(ROAD, p) ?? -1)).toBe(0);
  });
});

describe('followStep', () => {
  it('rota yoksa ham konumu döner', () => {
    const pos = { lat: 35.1805, lng: 33.3801, heading: 45 };
    const { state, display } = followStep(null, pos, null);
    expect(state).toBeNull();
    expect(display).toMatchObject({ lat: pos.lat, lng: pos.lng, heading: 45, snapped: false, ahead: null, remainingKm: null });
  });

  it('yola oturur: ikinci adımda rota köşelerinden geçen yol, yolun yönü, azalan kalan mesafe', () => {
    const first = followStep(null, { lat: 35.1805, lng: 33.38 + EAST_9M, heading: 77 }, route);
    expect(first.display.snapped).toBe(true);
    expect(first.display.lng).toBeCloseTo(33.38, 6); // yola çekildi
    expect(first.display.path).toBeUndefined(); // ilk adımda önceki nokta yok
    expect(Math.round(first.display.heading ?? -1)).toBe(0); // yolun yönü, GPS'in 77'si değil
    expect(first.display.ahead?.[0]).toEqual({ lat: first.display.lat, lng: first.display.lng });
    expect(first.display.ahead).toHaveLength(4); // izdüşüm + 3 köşe

    const second = followStep(first.state, { lat: 35.1825, lng: 33.38 - EAST_9M, heading: null }, route);
    expect(second.display.snapped).toBe(true);
    expect(second.display.path).toHaveLength(4);
    expect(second.display.path?.[1]).toEqual(ROAD[1]);
    expect(second.display.path?.[2]).toEqual(ROAD[2]);
    expect(second.display.remainingKm!).toBeLessThan(first.display.remainingKm!);
    expect(second.display.offRoute).toBe(false);
  });

  it('rotadan uzaktaysa yola oturmaz; 100 m üstünde rota bayat sayılır', () => {
    const near = followStep(null, { lat: 35.1815, lng: 33.38 + 8 * EAST_9M, heading: null }, route); // ~73 m
    expect(near.display.snapped).toBe(false);
    expect(near.display.offRoute).toBe(false);
    expect(near.display.ahead?.[0]).toEqual({ lat: 35.1815, lng: 33.38 + 8 * EAST_9M });
    const far = followStep(null, { lat: 35.1815, lng: 33.38 + 15 * EAST_9M, heading: null }, route); // ~136 m
    expect(far.display.snapped).toBe(false);
    expect(far.display.offRoute).toBe(true);
    expect(SNAP_KM).toBeLessThan(OFF_ROUTE_KM);
  });

  it('gidiş-dönüş yolda ikon dönüş şeridine zıplamaz', () => {
    // Kuzeye 1.1 km gidiş, 9 m doğudan güneye dönüş
    const out = [
      { lat: 35.18, lng: 33.38 },
      { lat: 35.19, lng: 33.38 },
    ];
    const back = [
      { lat: 35.19, lng: 33.38 + EAST_9M },
      { lat: 35.18, lng: 33.38 + EAST_9M },
    ];
    const loop = [...out, ...back];
    const loopRoute: FollowRoute = { key: 'loop', points: loop, totalKm: routeLengthKm(loop) };
    const start = followStep(null, { lat: 35.181, lng: 33.38, heading: null }, loopRoute);
    expect(start.state?.proj.alongKm).toBeLessThan(0.2);
    // Sürücü kuzeye ilerledi, GPS onu dönüş şeridine daha yakın gösteriyor (5.5 m gidişe, 3.6 m dönüşe)
    const pos = { lat: 35.182, lng: 33.38 + 0.6 * EAST_9M, heading: null };
    const naive = projectOntoRoute(loop, pos)!;
    expect(naive.alongKm).toBeGreaterThan(1); // pencere olmasa dönüş şeridini seçerdi
    const next = followStep(start.state, pos, loopRoute);
    expect(next.state?.proj.alongKm).toBeLessThan(0.5);
    expect(Math.round(next.display.heading ?? -1)).toBe(0); // hâlâ kuzeye
  });

  it('rota değişince önceki izdüşüm kullanılmaz (path yok), yeni rotaya oturur', () => {
    const first = followStep(null, { lat: 35.1805, lng: 33.38, heading: null }, route);
    const other: FollowRoute = { ...route, key: 'r2' };
    const next = followStep(first.state, { lat: 35.1815, lng: 33.38, heading: null }, other);
    expect(next.display.path).toBeUndefined();
    expect(next.state?.routeKey).toBe('r2');
  });
});
