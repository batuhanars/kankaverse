const TIMEOUT_MS = 8000;

/**
 * Dış platform çağrısı. Hata mesajına yalnız durum kodu ve adres (sorgusuz) girer: token, kod ve sır
 * (gövde/başlık) hiçbir zaman hata metnine ya da loga taşınmaz (§2.4).
 */
export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const target = new URL(url);
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(
      `Dış platform isteği başarısız: ${init.method ?? 'GET'} ${target.origin}${target.pathname} -> ${res.status}`,
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function formBody(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values);
}

/** Uygulama (client credentials) token'ı yalnız bellekte, süresi dolana dek tutulur; kullanıcı token'ı DEĞİL. */
export class AppTokenCache {
  private token: string | null = null;
  private expiresAt = 0;

  async get(fetcher: () => Promise<{ access_token: string; expires_in: number }>): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    const res = await fetcher();
    this.token = res.access_token;
    this.expiresAt = Date.now() + Math.max(60, res.expires_in - 120) * 1000;
    return this.token;
  }
}
