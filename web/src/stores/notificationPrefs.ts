import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { notificationsApi } from '@/api/notifications'
import {
  NotificationLevel,
  type NotificationPrefDto,
  type NotifTargetType,
  type NotificationLevel as NotificationLevelType,
} from '@/types'

/**
 * Bildirim tercihleri store'u (GET/PUT /notifications/prefs).
 *
 * Guild/kanal bazlı sustur + bildirim seviyesi. Kayıt yoksa varsayılan: susturulmamış,
 * seviye 'ALL'. CHANNEL için kayıt yoksa GUILD tercihine düşer (effectiveLevel).
 *
 * Hidrasyon: uygulama açılışında bir kez `load()` (AppShell onMounted).
 */
function key(targetType: NotifTargetType, targetId: string) {
  return `${targetType}:${targetId}`
}

export const useNotificationPrefsStore = defineStore('notificationPrefs', () => {
  // key=`${targetType}:${targetId}` → pref
  const prefs = reactive(new Map<string, NotificationPrefDto>())

  // Uygulama açılışında bir kez — mevcut tercihleri Map'e doldur
  async function load() {
    const res = await notificationsApi.getPrefs()
    prefs.clear()
    for (const pref of res.data) {
      prefs.set(key(pref.targetType, pref.targetId), pref)
    }
  }

  function prefFor(type: NotifTargetType, id: string): NotificationPrefDto | undefined {
    return prefs.get(key(type, id))
  }

  function isMuted(type: NotifTargetType, id: string): boolean {
    const pref = prefs.get(key(type, id))
    if (!pref?.muted) return false
    // Süreli sustur: bitiş geçmişse artık susturulmuş sayılmaz.
    if (pref.mutedUntil && new Date(pref.mutedUntil).getTime() <= Date.now()) return false
    return true
  }

  /** Susturma bitiş zamanı (ISO) — null = süresiz veya susturulmamış. UI etiketi için. */
  function mutedUntilFor(type: NotifTargetType, id: string): string | null {
    return prefs.get(key(type, id))?.mutedUntil ?? null
  }

  /**
   * Sprint WEB-PARITE §2.1 — canlı rozet artışının uyguladığı tablo (mobil
   * `mobile/src/stores/notificationPrefs.ts` `channelBadgeEffect` ile BİREBİR; backend
   * `guilds.service.ts` `resolveChannelBadgeEffect` de aynı tabloyu kullanır — üç kaynak örtüşür).
   *
   * 🔴 Yalnız kanalın KENDİ (`CHANNEL`) tercihine bakar, GUILD'e DÜŞMEZ: ortam düzeyi süzgeci
   * `ServerRail` çizim anında zaten uyguluyor, burada da uygulansa çift süzgeç olurdu.
   *
   * pref yok → { true, true } · aktif mute / NONE → { false, false } · MENTIONS → { false, true }.
   */
  function channelBadgeEffect(channelId: string): { countUnread: boolean; countMention: boolean } {
    const pref = prefs.get(key('CHANNEL', channelId))
    if (!pref) return { countUnread: true, countMention: true } // varsayılan: ALL, susturulmamış
    if (isMuted('CHANNEL', channelId)) return { countUnread: false, countMention: false }
    if (pref.level === NotificationLevel.NONE) return { countUnread: false, countMention: false }
    if (pref.level === NotificationLevel.MENTIONS) return { countUnread: false, countMention: true }
    return { countUnread: true, countMention: true } // ALL
  }

  /**
   * Sprint R14 — ortam düzeyi bastırma bayrakları. Yalnız GUILD hedefinde anlamlı;
   * kayıt yoksa varsayılan `false` (bastırma kapalı = bugünkü davranış).
   */
  function suppressEveryone(guildId: string): boolean {
    return prefs.get(key('GUILD', guildId))?.suppressEveryone ?? false
  }

  function suppressEvents(guildId: string): boolean {
    return prefs.get(key('GUILD', guildId))?.suppressEvents ?? false
  }

  /**
   * Efektif bildirim seviyesi. CHANNEL için kanal kaydı yoksa (guildId verildiyse)
   * GUILD tercihine düşer; o da yoksa 'ALL'.
   */
  function effectiveLevel(
    type: NotifTargetType,
    id: string,
    guildId?: string,
  ): NotificationLevelType {
    const own = prefs.get(key(type, id))
    if (own) return own.level
    if (type === 'CHANNEL' && guildId) {
      const guild = prefs.get(key('GUILD', guildId))
      if (guild) return guild.level
    }
    return NotificationLevel.ALL
  }

  // Optimistik: PUT → dönen pref'i Map'e yaz. Hata → throw (çağıran toast'lar).
  async function setPref(body: {
    targetType: NotifTargetType
    targetId: string
    muted?: boolean
    mutedUntil?: string | null
    level?: NotificationLevelType
    // R14 — sunucu bu ikisini yalnız targetType=GUILD ile kabul eder (aksi 400 INVALID_PREF_TARGET).
    suppressEveryone?: boolean
    suppressEvents?: boolean
  }) {
    const res = await notificationsApi.setPref(body)
    const pref = res.data
    prefs.set(key(pref.targetType, pref.targetId), pref)
    return pref
  }

  return {
    prefs,
    load,
    prefFor,
    isMuted,
    mutedUntilFor,
    channelBadgeEffect,
    suppressEveryone,
    suppressEvents,
    effectiveLevel,
    setPref,
  }
})
