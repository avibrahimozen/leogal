import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** API adresini belirlerken kullanılan girdiler (saf çözümleyici için). */
export interface ApiUrlInputs {
  /** EXPO_PUBLIC_API_URL ortam değişkeni (üretim / özel sunucu) */
  explicitUrl?: string | null;
  /** Expo Go'da Metro'nun adresi, örn. "192.168.1.20:8081" */
  hostUri?: string | null;
  /** Eski Expo Go sürümlerinde aynı bilgi (debuggerHost) */
  debuggerHost?: string | null;
  /** Web: sayfanın adresi (window.location); Metro geliştirme sunucusu ya da API'nin kendisi */
  webLocation?: { protocol: string; hostname: string; port: string } | null;
}

export const DEFAULT_API_URL = 'http://localhost:4000';
const API_PORT = 4000;
/** Expo/Metro web geliştirme sunucusunun kullandığı portlar: API bu makinede ayrı portta (4000) çalışır */
const DEV_WEB_PORTS = new Set(['8081', '8082', '19000', '19006']);

/**
 * Ulak API adresi.
 *
 * Öncelik sırası:
 *  1. EXPO_PUBLIC_API_URL ortam değişkeni (üretim / özel sunucu)
 *  2. Web: sayfa Metro geliştirme sunucusundan geliyorsa aynı makinenin 4000 portu;
 *     API sunucusunun kendisinden (npm run build:web sonrası) geliyorsa aynı köken
 *  3. Expo Go'da otomatik: Metro'nun çalıştığı bilgisayarın IP'si + 4000 portu
 *     (telefon "localhost"u göremez; bu sayede elle IP girmeye gerek kalmaz)
 *  4. localhost:4000 (simülatör / emülatör)
 *
 * Saf fonksiyon: tüm girdiler parametre olarak alınır, böylece test edilebilir.
 */
export function resolveApiUrl(inputs: ApiUrlInputs): string {
  const explicit = inputs.explicitUrl?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const web = inputs.webLocation;
  if (web && web.hostname) {
    if (DEV_WEB_PORTS.has(web.port)) return `http://${web.hostname}:${API_PORT}`;
    const protocol = web.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${web.hostname}${web.port ? `:${web.port}` : ''}`;
  }
  const hostUri = inputs.hostUri ?? inputs.debuggerHost ?? undefined;
  const host = hostUri?.split(':')[0]?.trim();
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${API_PORT}`;
  }
  return DEFAULT_API_URL;
}

function readWebLocation(): ApiUrlInputs['webLocation'] {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return null;
  const { protocol, hostname, port } = window.location;
  return { protocol, hostname, port };
}

function readApiUrlInputs(): ApiUrlInputs {
  return {
    explicitUrl: process.env.EXPO_PUBLIC_API_URL,
    hostUri: Constants.expoConfig?.hostUri,
    debuggerHost: (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost,
    webLocation: readWebLocation(),
  };
}

export const API_URL = resolveApiUrl(readApiUrlInputs());

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/**
 * Oturum düştüğünde (token'lı bir istek 401 aldığında) çağrılacak işleyiciyi
 * kaydeder; AuthProvider bununla kullanıcıyı çıkışa yönlendirir.
 * Kaydı kaldıran fonksiyonu döner.
 */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = authToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Sunucuya ulaşılamıyor (${API_URL}). Sunucunun açık ve aynı Wi-Fi'da olduğundan emin olun.`, 0);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Token'lı istek 401 aldıysa oturum geçersiz: işleyiciyi bir kez tetikle.
    // (token === authToken: çıkış zaten yapıldıysa ya da yeni oturum açıldıysa tekrar tetikleme)
    if (res.status === 401 && token && token === authToken && path !== '/auth/login') {
      unauthorizedHandler?.();
    }
    throw new ApiError((data.error as string) ?? 'Beklenmeyen bir hata oluştu', res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => call<T>('PUT', path, body),
};
