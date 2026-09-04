import Constants from 'expo-constants';

/** API adresini belirlerken kullanılan girdiler (saf çözümleyici için). */
export interface ApiUrlInputs {
  /** EXPO_PUBLIC_API_URL ortam değişkeni (üretim / özel sunucu) */
  explicitUrl?: string | null;
  /** Expo Go'da Metro'nun adresi, örn. "192.168.1.20:8081" */
  hostUri?: string | null;
  /** Eski Expo Go sürümlerinde aynı bilgi (debuggerHost) */
  debuggerHost?: string | null;
}

export const DEFAULT_API_URL = 'http://localhost:4000';
const API_PORT = 4000;

/**
 * Ulak API adresi.
 *
 * Öncelik sırası:
 *  1. EXPO_PUBLIC_API_URL ortam değişkeni (üretim / özel sunucu)
 *  2. Expo Go'da otomatik: Metro'nun çalıştığı bilgisayarın IP'si + 4000 portu
 *     (telefon "localhost"u göremez; bu sayede elle IP girmeye gerek kalmaz)
 *  3. localhost:4000 (simülatör / emülatör)
 *
 * Saf fonksiyon: tüm girdiler parametre olarak alınır, böylece test edilebilir.
 */
export function resolveApiUrl(inputs: ApiUrlInputs): string {
  const explicit = inputs.explicitUrl?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const hostUri = inputs.hostUri ?? inputs.debuggerHost ?? undefined;
  const host = hostUri?.split(':')[0]?.trim();
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${API_PORT}`;
  }
  return DEFAULT_API_URL;
}

function readApiUrlInputs(): ApiUrlInputs {
  return {
    explicitUrl: process.env.EXPO_PUBLIC_API_URL,
    hostUri: Constants.expoConfig?.hostUri,
    debuggerHost: (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost,
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
