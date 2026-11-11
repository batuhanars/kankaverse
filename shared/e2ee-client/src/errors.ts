/** Sunucunun makine hata kodu (envelope `error`), yoksa undefined. */
export function e2eeErrorCode(e: unknown): string | undefined {
  return (e as { response?: { data?: { error?: string } } }).response?.data?.error
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
