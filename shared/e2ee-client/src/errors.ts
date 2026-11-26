/** Sunucunun makine hata kodu (envelope `error`), yoksa undefined. */
export function e2eeErrorCode(e: unknown): string | undefined {
  return (e as { response?: { data?: { error?: string } } }).response?.data?.error
}

/** HTTP durum kodu (axios biçimi `response.status`), ağ hatası ya da HTTP dışı hatada undefined. */
export function httpStatusOf(e: unknown): number | undefined {
  return (e as { response?: { status?: number } } | null)?.response?.status
}

/**
 * C77 §2: kanal yok ya da bu kullanıcının erişimi yok (404/403, ör. CHANNEL_NOT_FOUND, NOT_CHANNEL_MEMBER).
 * Kalıcıdır: o kanalın Welcome'ı hiçbir zaman işlenemez. `E2EE_*` kodlu 403/404 (cihaz yok/iptal, hesapta
 * şifreleme kapalı) kanala değil cihaza/hesaba aittir; onlar kalıcı sayılmaz (Welcome düşürülmez, sonra denenir).
 */
export function isChannelGoneError(e: unknown): boolean {
  const status = httpStatusOf(e)
  if (status !== 404 && status !== 403) return false
  return !(e2eeErrorCode(e) ?? '').startsWith('E2EE_')
}

/**
 * E2EE hata logu için İÇERİKSİZ etiket: hata adı + (HTTP ise) durum, sunucunun makine kodu ve istek yolu.
 * Mesaj gövdesi, anahtar, şifreli yük ASLA yazılmaz; yol yalnız uç adı ve kimlikler taşır (sorgu dizesi atılır).
 * Neden: "AxiosError" tek başına hangi isteğin neden düştüğünü söylemiyor (C77 teşhisi, 2026-11-26).
 */
export function e2eeErrorTag(e: unknown): string {
  if (!(e instanceof Error)) return typeof e
  const ax = e as Error & {
    response?: { status?: number; data?: { error?: unknown } }
    config?: { method?: string; url?: string }
  }
  const parts = [e.name]
  if (ax.response?.status) parts.push(String(ax.response.status))
  if (typeof ax.response?.data?.error === 'string') parts.push(ax.response.data.error)
  if (ax.config?.url) parts.push(`${(ax.config.method ?? '').toUpperCase()} ${ax.config.url.split('?')[0]}`)
  return parts.join(' ')
}

/**
 * E8: bu cihaz arama anahtarını türetemiyor; arama şifresiz bağlanmaz, kullanıcıya mesaj gösterilir.
 * NOT_MEMBER = cihaz kanalın grubunda değil (henüz eklenmedi ya da çıkarıldı). STALE = eşitlemeden sonra
 * hâlâ sunucunun epoch'unun gerisinde (commit henüz gelmedi), birkaç saniye sonra tekrar denenir.
 */
export class CallKeyUnavailableError extends Error {
  readonly reason: 'NOT_MEMBER' | 'STALE'

  constructor(reason: 'NOT_MEMBER' | 'STALE') {
    super(`Arama anahtarı yok: ${reason}`)
    this.name = 'CallKeyUnavailableError'
    this.reason = reason
  }
}

/** Yedek işlemi için BMK bu cihazda açık değil (önce `unlockBackup`/`setupBackup`). */
export class BackupLockedError extends Error {
  constructor() {
    super('Yedek bu cihazda açık değil')
    this.name = 'BackupLockedError'
  }
}

/** Sunucuda bu hesap için yedek kurulmamış. */
export class BackupNotConfiguredError extends Error {
  constructor() {
    super('Yedek kurulmamış')
    this.name = 'BackupNotConfiguredError'
  }
}

/** E5b: aktarım oturumu bu cihazda yok (uygulama yeniden açıldı ya da başka cihazın isteği): baştan başlatılır. */
export class TransferSessionError extends Error {
  constructor() {
    super('Aktarım oturumu bu cihazda yok')
    this.name = 'TransferSessionError'
  }
}

/** E5b: geçmiş aktarım sınırını (25 MB) aşıyor; kullanıcıya "yedekten geri yükle" denir. */
export class TransferTooLargeError extends Error {
  constructor() {
    super('Geçmiş aktarım için çok büyük')
    this.name = 'TransferTooLargeError'
  }
}

/** E5b: aktarım yükü bozuk ya da beklenen cihazdan değil (özet/şifre/biçim tutmadı). */
export class TransferPayloadError extends Error {
  constructor() {
    super('Aktarım yükü açılamadı')
    this.name = 'TransferPayloadError'
  }
}
