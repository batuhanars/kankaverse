// [Sprint M0 — R7] `X-Client-Type` başlığı allowlist normalizasyonu.
// Yalnız 'mobile' kabul edilir; başka değer (ör. 'desktop') veya başlığın hiç
// gelmemesi `null` olarak işlenir — hata verilmez, web gibi davranır (Sprint M0
// contract §2.2). register/login/login2fa/refresh dört uç bu kuralı paylaşır.
const ALLOWED_CLIENT_TYPES = new Set(['mobile']);

export function normalizeClientType(header: string | undefined): 'mobile' | null {
  const normalized = header?.trim().toLowerCase();
  return normalized != null && ALLOWED_CLIENT_TYPES.has(normalized) ? 'mobile' : null;
}
