// Oturum düşürme kararı (D97 + D108): oturum YALNIZ gerçekten bittiği kesinleşince düşer.
//  - 'definitive': sunucu oturumun bittiğini söyledi (zincir iptal/yeniden kullanım, kanal uyuşmazlığı)
//    ya da 403. Hemen oturum sonu.
//  - 'ambiguous': kodu bu kararı vermeye yetmeyen 401 (örn. INVALID_REFRESH: "az önce yenilendi" yarışı da
//    süresi dolmuş/çerezi yok oturum da aynı kodu taşır). Bir kez kısa beklenip yeniden denenir;
//    yine 401 ise kesin sayılır (refreshWithAmbiguityRetry).
//  - 'transient': ağ hatası, zaman aşımı, 5xx. Sunucu oturumu iptal etmedi → kullanıcı atılmaz (D97).
export type RefreshFailure = 'definitive' | 'ambiguous' | 'transient'

// Sunucunun (auth.service.refresh) kesin oturum sonu kodları.
const DEFINITIVE_CODES = new Set(['REFRESH_REUSE_DETECTED', 'REFRESH_CHANNEL_MISMATCH'])

// Bilinmeyen 401'in yeniden denemesi de 401 verirse hata bununla işaretlenir.
const RETRIED_FLAG = '__kvRefreshRetried'

export const AMBIGUOUS_RETRY_DELAY_MS = 400

type ErrorShape = {
  response?: { status?: unknown; data?: { error?: unknown } }
  [RETRIED_FLAG]?: boolean
}

export function classifyRefreshFailure(error: unknown): RefreshFailure {
  const e = error as ErrorShape | null
  const status = e?.response?.status
  if (status === 403) return 'definitive'
  if (status !== 401) return 'transient'
  const code = e?.response?.data?.error
  if (typeof code === 'string' && DEFINITIVE_CODES.has(code)) return 'definitive'
  return e?.[RETRIED_FLAG] ? 'definitive' : 'ambiguous'
}

export function isDefinitiveRefreshRejection(error: unknown): boolean {
  return classifyRefreshFailure(error) === 'definitive'
}

/**
 * Refresh denemesi bilinmeyen 401 verirse bir kez kısa bekleyip yeniden dener. İkinci 401 hata nesnesine
 * "yeniden denendi" işareti taşır → classifyRefreshFailure 'definitive' döner. Çağıranlar (axios, useSocket)
 * yalnız isDefinitiveRefreshRejection'a bakar: tek karar yeri.
 */
export async function refreshWithAmbiguityRetry<T>(
  attempt: () => Promise<T>,
  delayMs = AMBIGUOUS_RETRY_DELAY_MS,
): Promise<T> {
  try {
    return await attempt()
  } catch (first) {
    if (classifyRefreshFailure(first) !== 'ambiguous') throw first
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    try {
      return await attempt()
    } catch (second) {
      if (second && typeof second === 'object') (second as ErrorShape)[RETRIED_FLAG] = true
      throw second
    }
  }
}
