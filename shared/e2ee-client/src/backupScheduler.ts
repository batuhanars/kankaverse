// Yedek zamanlayıcısı (E5a §4.3). Platformdan bağımsız: saat ve zamanlayıcı enjekte edilir; web/mobil yaşam
// döngüsüne bağlama (görünürlük, AppState) çağıranın işi: `start()` ve `onBackground()` buradan çağrılır.
import type { BackupRunResult } from './backup'

const MINUTE = 60_000
/** Açılıştan sonraki ilk deneme. */
export const BACKUP_FIRST_DELAY_MS = MINUTE
/** Başarıda ya da yapacak işi yokken bir sonraki deneme; aynı zamanda geri çekilmenin tavanı. */
export const BACKUP_MAX_DELAY_MS = 6 * 60 * MINUTE

export interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export interface SchedulerDeps {
  /** `engine.backup.runBackupIfDue`: hata fırlatmaz, sonuç döner. */
  run(now: number): Promise<BackupRunResult>
  now?: () => number
  timers?: Timers
}

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as never) }

export class BackupScheduler {
  private handle: unknown = null
  private active = false
  private busy = false
  private backoff = 0

  private d: SchedulerDeps

  constructor(deps: SchedulerDeps) {
    this.d = deps
  }

  private get timers() {
    return this.d.timers ?? realTimers
  }

  /** İlk deneme 1 dk sonra. İkinci çağrı bir şey yapmaz. */
  start(): void {
    if (this.active) return
    this.active = true
    this.schedule(BACKUP_FIRST_DELAY_MS)
  }

  stop(): void {
    this.active = false
    if (this.handle !== null) this.timers.clear(this.handle)
    this.handle = null
  }

  /** Uygulama/sekme arka plana geçerken: hemen dener (yine de `runBackupIfDue`un koşullarına tabi). */
  onBackground(): void {
    if (this.active) void this.attempt()
  }

  private schedule(ms: number): void {
    if (this.handle !== null) this.timers.clear(this.handle)
    this.handle = this.timers.set(() => void this.attempt(), ms)
  }

  private async attempt(): Promise<void> {
    if (this.busy) return
    this.busy = true
    if (this.handle !== null) this.timers.clear(this.handle)
    this.handle = null
    let result: BackupRunResult
    try {
      result = await this.d.run((this.d.now ?? Date.now)())
    } catch {
      result = { status: 'failed' } // run hata fırlatmamalı; fırlatırsa da zamanlayıcı ölmesin
    } finally {
      this.busy = false
    }
    if (!this.active) return
    // Hata: 1 dk, 2 dk, 4 dk ... en çok 6 saat. Diğer sonuçlar geri çekilmeyi sıfırlar, 6 saat sonra bakılır.
    this.backoff = result.status === 'failed' ? Math.min(this.backoff === 0 ? MINUTE : this.backoff * 2, BACKUP_MAX_DELAY_MS) : 0
    this.schedule(this.backoff || BACKUP_MAX_DELAY_MS)
  }
}
