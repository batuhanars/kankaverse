/** Sunucunun makine hata kodu (envelope `error`), yoksa undefined. */
export function e2eeErrorCode(e: unknown): string | undefined {
  return (e as { response?: { data?: { error?: string } } }).response?.data?.error
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
