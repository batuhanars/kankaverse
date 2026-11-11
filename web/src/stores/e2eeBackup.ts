import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  BackupScheduler,
  type BackupRunResult,
  type BackupState,
  type E2eeEngine,
  type Reauth,
} from '@kankaverse/e2ee-client'
import { BackupPasswordError, type BackupPasswordRejection } from '@kankaverse/e2ee-core'
import { useAuthStore } from '@/stores/auth'
import { useDmStore } from '@/stores/dm'
import { useE2eeStore } from '@/stores/e2ee'

/** Kurulum sorusu cihaz başına bir kez (E5a §4.4-1); anahtar kullanıcıya özel. */
const askedKey = (userId: string) => `kv.e2ee.backupAsked.${userId}`
const STALE_MS = 24 * 60 * 60 * 1000

export type BackupOutcome =
  | { ok: true }
  | { ok: false; reason: 'wrong-password' | 'generic' | BackupPasswordRejection; message?: string }

/** Ham hata asla kullanıcıya gitmez: yanlış şifre ayrı, geri kalanı genel. Sunucunun Türkçe mesajı (reauth) korunur. */
function toOutcome(e: unknown): BackupOutcome {
  if (e instanceof BackupPasswordError) return { ok: false, reason: 'wrong-password' }
  const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
  console.error('[e2ee] yedek işlemi başarısız', e instanceof Error ? e.name : typeof e)
  return { ok: false, reason: 'generic', message }
}

/**
 * E5a yedek akışlarının tek girişi (web). Kripto ve motor `shared/e2ee-client` içinde; burada yalnız bağlama:
 * zamanlayıcı yaşam döngüsü, durum, "bir kez sor" bayrağı, geri yükleme bandı ve eylemler.
 */
export const useE2eeBackupStore = defineStore('e2eeBackup', () => {
  const state = ref<BackupState | null>(null)
  const lastRun = ref<BackupRunResult['status'] | null>(null)
  /** Geri yükleme sonrası artar; açık sohbet mesajlarını yeniden yükler. */
  const restoreTick = ref(0)
  const setupPromptOpen = ref(false)
  const bannerDismissed = ref(false)
  const engine = shallowRef<E2eeEngine | null>(null)
  let scheduler: BackupScheduler | null = null
  let onVisibility: (() => void) | null = null

  const identity = () => {
    const u = useAuthStore().user
    return { username: u?.username ?? '', email: u?.email ?? '' }
  }

  async function refresh(): Promise<void> {
    const backup = engine.value?.backup
    if (!backup) return
    try {
      state.value = await backup.backupState()
    } catch (e) {
      console.error('[e2ee] yedek durumu okunamadı', e instanceof Error ? e.name : typeof e)
    }
  }

  async function run(now: number): Promise<BackupRunResult> {
    const result: BackupRunResult = (await engine.value?.backup?.runBackupIfDue(now)) ?? {
      status: 'skipped',
      reason: 'disabled',
    }
    lastRun.value = result.status
    // Başka cihaz anahtarı geçersiz kıldı (key-dropped): durum "kilitli" olur, bant/ayarlar açılır (§4.4-5).
    if (result.status === 'uploaded' || result.status === 'key-dropped') void refresh()
    return result
  }

  /** Motor hazır olunca bir kez: bayrak açıksa zamanlayıcı başlar, sekme gizlenince hemen denenir (§4.3). */
  async function start(e: E2eeEngine): Promise<void> {
    stop()
    engine.value = e
    await refresh()
    if (!state.value?.enabled) return
    scheduler = new BackupScheduler({ run })
    scheduler.start()
    onVisibility = () => {
      if (document.visibilityState === 'hidden') scheduler?.onBackground()
    }
    document.addEventListener('visibilitychange', onVisibility)
  }

  function stop(): void {
    scheduler?.stop()
    scheduler = null
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility)
    onVisibility = null
    engine.value = null
    state.value = null
    lastRun.value = null
    setupPromptOpen.value = false
    bannerDismissed.value = false
  }

  /** Şifreli DM ilk açıldığında çağrılır: yedek açık + kurulu değil + bu cihazda hiç sorulmadıysa BİR KEZ sorar. */
  function maybePromptSetup(): void {
    const userId = useAuthStore().user?.id
    const s = state.value
    if (!userId || !s?.enabled || s.configured || setupPromptOpen.value) return
    try {
      if (localStorage.getItem(askedKey(userId))) return
      localStorage.setItem(askedKey(userId), '1')
    } catch {
      return // depolama yoksa soru hiç çıkmaz: her açılışta sormak "bir kez" kuralını bozardı
    }
    setupPromptOpen.value = true
  }

  /** Yedek kurulu, bu cihazda kilitli ve bant bu oturumda kapatılmadıysa. */
  const showBanner = () =>
    !!state.value?.configured && !state.value.unlockedHere && !bannerDismissed.value

  async function setup(password: string): Promise<BackupOutcome> {
    try {
      const r = await engine.value!.backup!.setupBackup(password, identity())
      if (!r.ok) return { ok: false, reason: r.reason }
      await refresh()
      return { ok: true }
    } catch (e) {
      return toOutcome(e)
    }
  }

  /** Anahtarı açar, erişilebilir 1-1 DM'lere geri yükler, açık sohbeti yeniden yükletir. */
  async function unlockAndRestore(
    password: string,
  ): Promise<BackupOutcome & { restored?: number; badSnapshots?: number }> {
    try {
      const backup = engine.value!.backup!
      await backup.unlockBackup(password)
      const ids = useDmStore()
        .channels.filter((c) => c.type === 'DM')
        .map((c) => c.id)
      const res = await backup.restoreBackup(ids)
      await refresh()
      restoreTick.value++
      useE2eeStore().plainTick++
      return { ok: true, restored: res.restored, badSnapshots: res.badSnapshots }
    } catch (e) {
      return toOutcome(e)
    }
  }

  async function change(oldPassword: string, newPassword: string): Promise<BackupOutcome> {
    try {
      const r = await engine.value!.backup!.changeBackupPassword(
        oldPassword,
        newPassword,
        identity(),
      )
      if (!r.ok) return { ok: false, reason: r.reason }
      await refresh()
      return { ok: true }
    } catch (e) {
      return toOutcome(e)
    }
  }

  async function reset(newPassword: string, reauth: Reauth): Promise<BackupOutcome> {
    try {
      const r = await engine.value!.backup!.resetBackup(newPassword, identity(), reauth)
      if (!r.ok) return { ok: false, reason: r.reason }
      await refresh()
      return { ok: true }
    } catch (e) {
      return toOutcome(e)
    }
  }

  async function disable(reauth: Reauth): Promise<BackupOutcome> {
    try {
      await engine.value!.backup!.deleteBackup(reauth)
      await refresh()
      return { ok: true }
    } catch (e) {
      return toOutcome(e)
    }
  }

  /** "Şimdi yedekle": zamanlayıcının kullandığı aynı koşullu çalıştırma (6 saat/kirli denetimi motorda). */
  function backupNow(): Promise<BackupRunResult> {
    return run(Date.now())
  }

  /** 24 saati geçen başarısızlık: son çalıştırma hata ve son başarılı yedek yok ya da 24 saatten eski. */
  const isStale = () => {
    const s = state.value
    if (!s?.unlockedHere || lastRun.value !== 'failed') return false
    return s.lastBackupAt === undefined || Date.now() - s.lastBackupAt > STALE_MS
  }

  return {
    state,
    restoreTick,
    setupPromptOpen,
    bannerDismissed,
    start,
    stop,
    refresh,
    maybePromptSetup,
    showBanner,
    setup,
    unlockAndRestore,
    change,
    reset,
    disable,
    backupNow,
    isStale,
  }
})
