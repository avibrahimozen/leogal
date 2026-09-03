import Constants from 'expo-constants';

/**
 * Ulak API adresi.
 *
 * Öncelik sırası:
 *  1. EXPO_PUBLIC_API_URL ortam değişkeni (üretim / özel sunucu)
 *  2. Expo Go'da otomatik: Metro'nun çalıştığı bilgisayarın IP'si + 4000 portu
 *     (telefon "localhost"u göremez; bu sayede elle IP girmeye gerek kalmaz)
 *  3. localhost:4000 (simülatör / emülatör)
 */
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit;
  const hostUri: string | undefined =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost ??
    undefined;
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:4000`;
  }
  return 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
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
    throw new ApiError((data.error as string) ?? 'Beklenmeyen bir hata oluştu', res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => call<T>('PUT', path, body),
};
