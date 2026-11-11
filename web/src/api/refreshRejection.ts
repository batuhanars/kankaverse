// Oturum düşürme kararı (D97): oturum YALNIZ sunucu yenilemeyi kesin reddettiğinde (HTTP 401/403) biter.
// Ağ hatası, zaman aşımı, 5xx: sunucu oturumu iptal etmedi, bağlantı bozuktu — kullanıcı atılmaz,
// bir sonraki istek yeniden dener. (Mobildeki aynı kuralın web karşılığı; refresh burada cookie'de.)
export function isDefinitiveRefreshRejection(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return status === 401 || status === 403
}
