/**
 * useVoiceNudge — kamera ve ekran paylaşımı tek-seferlik uyarı yönetimi (§E2/§E3).
 *
 * Kamera nudge: genel/açık GUILD_VOICE kanalda (ageGated && adultsOnly değil), per-kanal-session.
 * Ekran nudge: herhangi bir ilk ekran paylaşımında, per-session.
 *
 * Hatırlama: sessionStorage — tab/sekme kapanınca sıfırlanır, yeniden açılınca gösterilir.
 * Sunucu-taraf tercih saklama YAGNI (sözleşme §E4).
 */
import { ref, computed } from 'vue'
import { useVoiceStore } from '@/stores/voice'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'

const CAMERA_NUDGE_PREFIX = 'kv.nudge.camera.'
const SCREEN_NUDGE_KEY = 'kv.nudge.screen'

export function useVoiceNudge() {
  const voiceStore = useVoiceStore()
  const channelsStore = useChannelsStore()
  const guildsStore = useGuildsStore()

  // Modal görünürlük durumları
  const showCameraNudge = ref(false)
  const showScreenNudge = ref(false)

  // Bağlı GUILD_VOICE kanalı (tüm guild kanal listelerinde ara)
  const connectedChannel = computed(() => {
    const id = voiceStore.connectedChannelId
    if (!id) return null
    for (const list of Object.values(channelsStore.channelsByGuild)) {
      const ch = list.find((c) => c.id === id)
      if (ch) return ch
    }
    return null
  })

  // Bağlı kanalın guild'i
  const connectedGuild = computed(() => {
    const guildId = connectedChannel.value?.guildId
    if (!guildId) return null
    return guildsStore.guilds.find((g) => g.id === guildId) ?? null
  })

  /**
   * Genel/açık bağlam: ageGated değil VE adultsOnly değil.
   * Yetişkin kanallarında (18+) kamera nudge gösterilmez; rıza bağlamı zaten kurulmuş.
   * DM bağlamında connectedChannel null → false döner (doğru).
   */
  const isGeneralVoiceChannel = computed<boolean>(() => {
    const ch = connectedChannel.value
    if (!ch || ch.type !== 'GUILD_VOICE') return false
    const adultsOnly = connectedGuild.value?.adultsOnly ?? false
    return !ch.ageGated && !adultsOnly
  })

  // ── Kamera nudge ──────────────────────────────────────────────────────────

  /** Kamera nudge gösterilmeli mi? Genel kanal + bu kanal için henüz gösterilmedi. */
  function shouldShowCameraNudge(): boolean {
    if (!isGeneralVoiceChannel.value) return false
    const channelId = voiceStore.connectedChannelId
    if (!channelId) return false
    return !sessionStorage.getItem(`${CAMERA_NUDGE_PREFIX}${channelId}`)
  }

  /** Kamera nudge göster (kamera açma işlemini ertele). */
  function triggerCameraNudge() {
    showCameraNudge.value = true
  }

  /** Kullanıcı "Kamerayı Aç" dedi → hatırla, modalı kapat. */
  function confirmCameraNudge() {
    const channelId = voiceStore.connectedChannelId
    if (channelId) sessionStorage.setItem(`${CAMERA_NUDGE_PREFIX}${channelId}`, '1')
    showCameraNudge.value = false
  }

  /** Kullanıcı modalı kapattı (Vazgeç) → sadece kapat, hafıza kaydetme. */
  function dismissCameraNudge() {
    showCameraNudge.value = false
  }

  // ── Ekran nudge ───────────────────────────────────────────────────────────

  /** Ekran nudge gösterilmeli mi? Per-session, herhangi bir kanalda. */
  function shouldShowScreenNudge(): boolean {
    return !sessionStorage.getItem(SCREEN_NUDGE_KEY)
  }

  /** Ekran nudge göster (ekran paylaşma işlemini ertele). */
  function triggerScreenNudge() {
    showScreenNudge.value = true
  }

  /** Kullanıcı "Devam Et" dedi → hatırla, modalı kapat. */
  function confirmScreenNudge() {
    sessionStorage.setItem(SCREEN_NUDGE_KEY, '1')
    showScreenNudge.value = false
  }

  /** Kullanıcı modalı kapattı (Vazgeç) → sadece kapat, hafıza kaydetme. */
  function dismissScreenNudge() {
    showScreenNudge.value = false
  }

  return {
    showCameraNudge,
    showScreenNudge,
    isGeneralVoiceChannel,
    shouldShowCameraNudge,
    triggerCameraNudge,
    confirmCameraNudge,
    dismissCameraNudge,
    shouldShowScreenNudge,
    triggerScreenNudge,
    confirmScreenNudge,
    dismissScreenNudge,
  }
}
