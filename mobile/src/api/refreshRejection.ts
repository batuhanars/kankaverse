// Oturum düşürme kararı (D97): refresh token YALNIZ sunucu yenilemeyi kesin reddettiğinde silinir.
// Kesin red = /auth/refresh HTTP 401/403 döndü, ya da secure store'da refresh token hiç yok.
// Ağ hatası, zaman aşımı, 5xx: sunucu oturumu iptal etmedi, bağlantı bozuktu — token korunur,
// bir sonraki istek/açılış yeniden dener. REFRESH_RESPONSE_INVALID de "kesin değil" sayılır:
// sunucu yenilemeyi reddetmedi (2xx döndü), yalnız gövde beklenmedik; bu bir sunucu/dağıtım
// uyumsuzluğudur ve geçici olabilir, oturumu geri alınamaz biçimde silmek için kanıt değildir.
export function isDefinitiveRefreshRejection(error: unknown): boolean {
  if (error instanceof Error && error.message === 'NO_REFRESH_TOKEN') return true;
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return status === 401 || status === 403;
}
