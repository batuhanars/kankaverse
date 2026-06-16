import { computed, unref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChannelsStore } from '@/stores/channels'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { useToastStore } from '@/stores/toast'
import { NotifTargetType, type ChannelDto, type NotificationLevel } from '@/types'

/**
 * Kanal context-menüsü aksiyonları — ChannelPanel'de kanal satırına sağ-tık menüsünün
 * paylaştığı mantık (useGuildMenuActions'ın kanal eşdeğeri; DRY / Rule of Three).
 *
 * channel reaktif kaynak alır (Ref veya getter): sağ-tıklanan hedef kanal değişir →
 * computed'ler izler. Backend otoritesi korunur; burası yalnız UI tetikler + optimistik
 * store yazar (markChannelRead store içinde sunucudan tazeler).
 */
export function useChannelMenuActions(channel: Ref<ChannelDto | null> | (() => ChannelDto | null)) {
  const { t } = useI18n()
  const channelsStore = useChannelsStore()
  const prefsStore = useNotificationPrefsStore()
  const toast = useToastStore()

  const target = computed(() => (typeof channel === 'function' ? channel() : unref(channel)))

  // ── Okunmuş olarak işaretle (store: optimistik 0 + sunucudan otoritatif tazele) ──
  async function markChannelRead() {
    const c = target.value
    if (!c) return
    await channelsStore.markChannelRead(c.id, c.guildId ?? undefined)
  }

  // ── Sustur (kanal seviyesi) ──
  const isChannelMuted = computed(() =>
    prefsStore.isMuted(NotifTargetType.CHANNEL, target.value?.id ?? ''),
  )

  async function toggleChannelMute() {
    const c = target.value
    if (!c) return
    try {
      await prefsStore.setPref({
        targetType: NotifTargetType.CHANNEL,
        targetId: c.id,
        muted: !isChannelMuted.value,
      })
    } catch {
      toast.error(t('guildMenu.muteError'))
    }
  }

  // ── Bildirim seviyesi (ALL / MENTIONS / NONE) — kayıt yoksa GUILD'e düşer ──
  const channelLevel = computed(() =>
    prefsStore.effectiveLevel(
      NotifTargetType.CHANNEL,
      target.value?.id ?? '',
      target.value?.guildId ?? undefined,
    ),
  )

  async function setChannelLevel(level: NotificationLevel) {
    const c = target.value
    if (!c) return
    try {
      await prefsStore.setPref({
        targetType: NotifTargetType.CHANNEL,
        targetId: c.id,
        level,
      })
    } catch {
      toast.error(t('guildMenu.levelError'))
    }
  }

  // ── Kanal ID'sini kopyala ──
  async function copyChannelId() {
    const c = target.value
    if (!c) return
    try {
      await navigator.clipboard.writeText(c.id)
      toast.success(t('channelMenu.idCopied'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  // ── Kanal bağlantısını kopyala (origin + /channels/:guildId/:channelId) ──
  async function copyChannelLink() {
    const c = target.value
    if (!c || !c.guildId) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/channels/${c.guildId}/${c.id}`)
      toast.success(t('channelMenu.linkCopied'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  return {
    markChannelRead,
    isChannelMuted,
    toggleChannelMute,
    channelLevel,
    setChannelLevel,
    copyChannelId,
    copyChannelLink,
  }
}
