import { computed, unref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { dmApi } from '@/api/dm'
import { useDmStore } from '@/stores/dm'
import { useFriendsStore } from '@/stores/friends'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { useToastStore } from '@/stores/toast'
import { NotifTargetType, type DmChannelDto, type NotificationLevel } from '@/types'

/**
 * DM satırı context-menüsü aksiyonları — `useChannelMenuActions`'ın DM eşdeğeri
 * (SPRINT_DM_MENU §3). Hedef kanal reaktif kaynakla verilir (Ref veya getter):
 * sağ-tıklanan satır değişince computed'ler izler.
 *
 * 🔴 Susturma/bildirim hedefi her zaman `CHANNEL` + DM kanal id'si — DM'ler `guildId: null`
 * ile `Channel` tablosunda yaşıyor, ayrı bir tür yok (mobil `DmMenuSheet` ile aynı sözleşme).
 * Ortam fallback'i YOK: DM'in bağlı olduğu bir ortam yok.
 *
 * Backend otoritesi korunur; burası yalnız UI tetikler + store'a yazar. İkinci bir mute
 * mantığı yazılmaz, mevcut `notificationPrefs` store'u okunur.
 */
export function useDmMenuActions(channel: Ref<DmChannelDto | null> | (() => DmChannelDto | null)) {
  const { t } = useI18n()
  const dmStore = useDmStore()
  const friendsStore = useFriendsStore()
  const prefsStore = useNotificationPrefsStore()
  const toast = useToastStore()

  const target = computed(() => (typeof channel === 'function' ? channel() : unref(channel)))

  // ── Okundu işaretle ──
  async function markDmRead() {
    const c = target.value
    if (!c) return
    try {
      await dmStore.markRead(c.id)
    } catch {
      // okundu kritik değil — sessiz (guild menüsündeki davranış)
    }
  }

  // ── Sustur (süreli; MuteDurationFlyout ile) ──
  const isDmMuted = computed(() =>
    prefsStore.isMuted(NotifTargetType.CHANNEL, target.value?.id ?? ''),
  )
  const dmMutedUntil = computed(() =>
    prefsStore.mutedUntilFor(NotifTargetType.CHANNEL, target.value?.id ?? ''),
  )

  // minutes=null → süresiz; aksi → şimdi + dakika.
  async function muteDmFor(minutes: number | null) {
    const c = target.value
    if (!c) return
    const mutedUntil =
      minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString()
    try {
      await prefsStore.setPref({
        targetType: NotifTargetType.CHANNEL,
        targetId: c.id,
        muted: true,
        mutedUntil,
      })
    } catch {
      toast.error(t('guildMenu.muteError'))
    }
  }

  async function unmuteDm() {
    const c = target.value
    if (!c) return
    try {
      await prefsStore.setPref({
        targetType: NotifTargetType.CHANNEL,
        targetId: c.id,
        muted: false,
        mutedUntil: null,
      })
    } catch {
      toast.error(t('guildMenu.muteError'))
    }
  }

  // ── Bildirim seviyesi (ALL / MENTIONS / NONE) — guildId verilmez, fallback yok ──
  const dmLevel = computed(() =>
    prefsStore.effectiveLevel(NotifTargetType.CHANNEL, target.value?.id ?? ''),
  )

  async function setDmLevel(level: NotificationLevel) {
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

  // ── Sohbeti temizle (onayı çağıran gösterir; burası yalnız uygular) ──
  async function clearDm(channelId: string) {
    await dmApi.clearChannel(channelId)
    dmStore.removeChannel(channelId)
  }

  // ── Kanka Ekle — yalnız 1-1 DM'de ve karşı taraf kanka değilken görünür ──
  const otherUserId = computed(() =>
    target.value?.type === 'DM' ? target.value.otherUser.id : null,
  )

  const canAddFriend = computed(
    () =>
      !!otherUserId.value &&
      target.value?.type === 'DM' &&
      !target.value.selfBlocked &&
      !friendsStore.friends.some((f) => f.user.id === otherUserId.value),
  )

  /** Ret **jenerik** — sebep/statü sızdırılmaz (Sprint 4A G2 kuralı). */
  async function addFriendFromDm() {
    const id = otherUserId.value
    if (!id) return
    try {
      await friendsStore.sendRequestByUser(id)
      toast.success(t('friends.requestSent'))
    } catch {
      toast.error(t('friends.addFailed'))
    }
  }

  return {
    markDmRead,
    isDmMuted,
    dmMutedUntil,
    muteDmFor,
    unmuteDm,
    dmLevel,
    setDmLevel,
    clearDm,
    canAddFriend,
    addFriendFromDm,
  }
}
