import { buildRouteQuery, clearRouteCache, fetchRoadRoute, straightRoute } from '../route';

const A = { lat: 35.1856, lng: 33.3823 };
const B = { lat: 35.3417, lng: 33.3223 };

type FetchMock = jest.Mock;
const g = globalThis as unknown as { fetch?: unknown };

describe('buildRouteQuery / straightRoute', () => {
  it('sorgu biçimi lat,lng|lat,lng (5 ondalık)', () => {
    expect(buildRouteQuery([A, B])).toBe('35.18560,33.38230|35.34170,33.32230');
  });

  it('düz çizgi: kuş uçuşu × 1.3, süre yok', () => {
    const r = straightRoute([A, B]);
    expect(r.source).toBe('straight');
    expect(r.durationMin).toBeNull();
    expect(r.points).toEqual([A, B]);
    expect(r.distanceKm).toBeGreaterThan(22);
    expect(r.distanceKm).toBeLessThan(25);
  });
});

describe('fetchRoadRoute', () => {
  let original: unknown;
  beforeEach(() => {
    original = g.fetch;
    clearRouteCache();
  });
  afterEach(() => {
    g.fetch = original;
  });

  it('ağ hatasında düz çizgi yedeğine düşer, fırlatmaz', async () => {
    g.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    const r = await fetchRoadRoute([A, B]);
    expect(r.source).toBe('straight');
    expect(r.points).toEqual([A, B]);
  });

  it('sunucu yol rotasını döner ve aynı noktalar için önbellekten verir', async () => {
    const body = { points: [A, { lat: 35.25, lng: 33.35 }, B], distanceKm: 24.5, durationMin: 27, source: 'osrm' };
    const fetchMock: FetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
    g.fetch = fetchMock;

    const r1 = await fetchRoadRoute([A, B]);
    expect(r1.source).toBe('osrm');
    expect(r1.durationMin).toBe(27);
    expect(r1.points).toHaveLength(3);

    const r2 = await fetchRoadRoute([A, B]);
    expect(r2).toBe(r1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/api/public/route?points=');
    expect(decodeURIComponent(url)).toContain('35.18560,33.38230|35.34170,33.32230');
  });

  it('sunucu düz çizgi döndürürse önbelleğe almaz (yol servisi açılınca tekrar dener)', async () => {
    const body = { points: [A, B], distanceKm: 23.6, durationMin: null, source: 'straight' };
    const fetchMock: FetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
    g.fetch = fetchMock;
    expect((await fetchRoadRoute([A, B])).source).toBe('straight');
    await fetchRoadRoute([A, B]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tek nokta için ağa gitmez', async () => {
    const fetchMock: FetchMock = jest.fn();
    g.fetch = fetchMock;
    const r = await fetchRoadRoute([A]);
    expect(r.points).toEqual([A]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
