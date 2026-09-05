import { DEFAULT_API_URL, resolveApiUrl } from '../client';

describe('resolveApiUrl', () => {
  it('EXPO_PUBLIC_API_URL her şeyden önce gelir', () => {
    expect(
      resolveApiUrl({
        explicitUrl: 'https://api.ulak.app',
        hostUri: '192.168.1.5:8081',
        debuggerHost: '10.0.0.2:8081',
      }),
    ).toBe('https://api.ulak.app');
  });

  it('açık adresin sonundaki eğik çizgiyi atar', () => {
    expect(resolveApiUrl({ explicitUrl: 'http://10.0.0.5:4000/' })).toBe('http://10.0.0.5:4000');
  });

  it('boş ya da yalnızca boşluk ortam değişkenini yok sayar', () => {
    expect(resolveApiUrl({ explicitUrl: '   ', hostUri: '192.168.1.5:8081' })).toBe('http://192.168.1.5:4000');
    expect(resolveApiUrl({ explicitUrl: '', hostUri: null })).toBe(DEFAULT_API_URL);
  });

  it('Expo Go hostUri varsa Metro makinesinin IP + 4000 kullanılır', () => {
    expect(resolveApiUrl({ hostUri: '192.168.1.5:8081' })).toBe('http://192.168.1.5:4000');
  });

  it('hostUri yoksa debuggerHost kullanılır', () => {
    expect(resolveApiUrl({ hostUri: null, debuggerHost: '10.0.0.2:8081' })).toBe('http://10.0.0.2:4000');
  });

  it("hostUri debuggerHost'tan önceliklidir", () => {
    expect(resolveApiUrl({ hostUri: '192.168.1.5:8081', debuggerHost: '10.0.0.2:8081' })).toBe(
      'http://192.168.1.5:4000',
    );
  });

  it('localhost / 127.0.0.1 hostUri simülatör demektir: varsayılana düşer', () => {
    expect(resolveApiUrl({ hostUri: 'localhost:8081' })).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl({ hostUri: '127.0.0.1:8081' })).toBe(DEFAULT_API_URL);
  });

  it('hiçbir girdi yoksa varsayılan adres', () => {
    expect(resolveApiUrl({})).toBe(DEFAULT_API_URL);
    expect(DEFAULT_API_URL).toBe('http://localhost:4000');
  });
});

// babel-preset-expo, process.env.EXPO_PUBLIC_* değerlerini derleme anında gömer;
// değişken tanımlıysa modül düzeyi kablolama testleri anlamsızlaşır, o yüzden atlanır.
const describeWiring = process.env.EXPO_PUBLIC_API_URL ? describe.skip : describe;

describeWiring('API_URL (modül yüklenirken expo-constants ile hesaplanır)', () => {
  afterEach(() => {
    jest.dontMock('expo-constants');
    jest.resetModules();
  });

  function loadApiUrlWith(constants: unknown): string {
    jest.doMock('expo-constants', () => ({ __esModule: true, default: constants }));
    let url = '';
    jest.isolateModules(() => {
      url = (require('../client') as typeof import('../client')).API_URL;
    });
    return url;
  }

  it('Expo Go hostUri ile Metro makinesine bağlanır', () => {
    expect(loadApiUrlWith({ expoConfig: { hostUri: '10.0.0.7:8081' }, expoGoConfig: null })).toBe(
      'http://10.0.0.7:4000',
    );
  });

  it('eski Expo Go debuggerHost ile de çalışır', () => {
    expect(loadApiUrlWith({ expoConfig: null, expoGoConfig: { debuggerHost: '10.0.0.8:8081' } })).toBe(
      'http://10.0.0.8:4000',
    );
  });

  it('bilgi yoksa localhost:4000', () => {
    expect(loadApiUrlWith({ expoConfig: null, expoGoConfig: null })).toBe('http://localhost:4000');
  });
});
