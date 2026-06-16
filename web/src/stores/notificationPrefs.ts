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
    return prefs.get(key(type, id))?.muted ?? false
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
    level?: NotificationLevelType
  }) {
    const res = await notificationsApi.setPref(body)
    const pref = res.data
    prefs.set(key(pref.targetType, pref.targetId), pref)
    return pref
  }

  return { prefs, load, prefFor, isMuted, effectiveLevel, setPref }
})
