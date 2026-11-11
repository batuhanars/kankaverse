// Oturum düşürme kararı (D97): refresh token YALNIZ sunucu yenilemeyi kesin reddettiğinde silinir.
// Kesin red = /auth/refresh HTTP 401/403 döndü, ya da secure store'da refresh token hiç yok.
// Ağ hatası, zaman aşımı, 5xx: sunucu oturumu iptal etmedi, bağlantı bozuktu — token korunur,
// bir sonraki istek/açılış yeniden dener. REFRESH_RESPONSE_INVALID de "kesin değil" sayılır:
// sunucu yenilemeyi reddetmedi (2xx döndü), yalnız gövde beklenmedik; bu bir sunucu/dağıtım
// uyumsuzluğudur ve geçici olabilir, oturumu geri alınamaz biçimde silmek için kanıt değildir.
/**
 * `fn`'i dener; kesin olmayan (geçici) hatada `delaysMs` kadar bekleyip yeniden dener
 * (toplam deneme = delaysMs.length + 1). Kesin hata beklemeden fırlatılır; denemeler tükenirse
 * son hata fırlatılır.
 */
export async function retryTransient<T>(
  fn: () => Promise<T>,
  delaysMs: readonly number[],
  isDefinitive: (error: unknown) => boolean,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (isDefinitive(e) || attempt >= delaysMs.length) throw e;
      await new Promise<void>((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

export function isDefinitiveRefreshRejection(error: unknown): boolean {
  if (error instanceof Error && error.message === 'NO_REFRESH_TOKEN') return true;
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return status === 401 || status === 403;
}
