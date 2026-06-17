import { computed, unref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChannelsStore } from '@/stores/channels'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { useToastStore } from '@/stores/toast'
import { channelsApi } from '@/api/channels'
import { NotifTargetType, type NotificationLevel } from '@/types'

/**
 * Ortam (guild) context-menüsü aksiyonları — ServerRail (sağ-tık) + ChannelPanel
 * (başlık dropdown) ikisinin paylaştığı mantık (DRY / Rule of Three).
 *
 * guildId reaktif kaynak alır (Ref veya getter): ServerRail'de sağ-tıklanan hedef
 * guild değişebilir, ChannelPanel'de aktif guild değişir → computed'ler izler.
 *
 * Backend otoritesi korunur; burası yalnız UI tetikler + optimistik store yazar.
 */
export function useGuildMenuActions(guildId: Ref<string> | (() => string)) {
  const { t } = useI18n()
  const channelsStore = useChannelsStore()
  const prefsStore = useNotificationPrefsStore()
  const toast = useToastStore()

  const gid = computed(() => (typeof guildId === 'function' ? guildId() : unref(guildId)))

  // ── Okunmuş olarak işaretle: guild'in TÜM kanallarını ardışık markRead ──
  // Az kanal varsayımı (ardışık kabul); hata sessiz (okundu kritik değil).
  async function markGuildRead() {
    const id = gid.value
    if (!id) return
    const channels = channelsStore.channelsForGuild(id)
    for (const channel of channels) {
      if (channel.unreadCount > 0 || channel.unreadMentionCount > 0) {
        try {
          await channelsApi.markRead(channel.id)
        } catch {
          // sessiz — tek kanal başarısız olsa da diğerleri denenir
        }
      }
    }
    // Sunucu-otoritesi: kanalları + guild sayacını tazele
    await channelsStore.fetchChannels(id).catch(() => {})
    window.dispatchEvent(new CustomEvent('kv:guild:recheck-unread', { detail: { guildId: id } }))
  }

  // ── Sustur (guild seviyesi; süreli — Görsel #15) ──
  const isGuildMuted = computed(() => prefsStore.isMuted(NotifTargetType.GUILD, gid.value))
  const guildMutedUntil = computed(() => prefsStore.mutedUntilFor(NotifTargetType.GUILD, gid.value))

  async function toggleGuildMute() {
    if (isGuildMuted.value) await unmuteGuild()
    else await muteGuildFor(null)
  }

  // minutes=null → süresiz; aksi → şimdi + dakika.
  async function muteGuildFor(minutes: number | null) {
    const id = gid.value
    if (!id) return
    const mutedUntil = minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString()
    try {
      await prefsStore.setPref({
        targetType: NotifTargetType.GUILD,
        targetId: id,
        muted: true,
        mutedUntil,
      })
    } catch {
      toast.error(t('guildMenu.muteError'))
    }
  }

  async function unmuteGuild() {
    const id = gid.value
    if (!id) return
    try {
      await prefsStore.setPref({
        targetType: NotifTargetType.GUILD,
        targetId: id,
        muted: false,
        mutedUntil: null,
      })
    } catch {
      toast.error(t('guildMenu.muteError'))
    }
  }

  // ── Bildirim seviyesi (ALL / MENTIONS / NONE) ──
  const guildLevel = computed(() => prefsStore.effectiveLevel(NotifTargetType.GUILD, gid.value))

  async function setGuildLevel(level: NotificationLevel) {
    const id = gid.value
    if (!id) return
    try {
      await prefsStore.setPref({
        targetType: NotifTargetType.GUILD,
        targetId: id,
        level,
      })
    } catch {
      toast.error(t('guildMenu.levelError'))
    }
  }

  // ── Sunucu ID'sini kopyala ──
  async function copyGuildId() {
    const id = gid.value
    if (!id) return
    try {
      await navigator.clipboard.writeText(id)
      toast.success(t('guildMenu.idCopied'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  return {
    markGuildRead,
    isGuildMuted,
    guildMutedUntil,
    toggleGuildMute,
    muteGuildFor,
    unmuteGuild,
    guildLevel,
    setGuildLevel,
    copyGuildId,
  }
}
