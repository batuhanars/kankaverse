import { onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { gamesApi } from '@/api/games'
import { sendActivity } from '@/composables/useSocket'
import { useAppModals } from '@/composables/useAppModals'
import { useActivityStore } from '@/stores/activity'
import { useAuthStore } from '@/stores/auth'
import { useChannelsStore } from '@/stores/channels'
import { useToastStore } from '@/stores/toast'
import { useVoiceStore } from '@/stores/voice'

const GAME_LIST_REFRESH_MS = 6 * 60 * 60 * 1000
const NOTE_SEEN_KEY = 'kv_game_activity_note_seen'

function noteSeen(): boolean {
  try {
    return localStorage.getItem(NOTE_SEEN_KEY) === '1'
  } catch {
    return false
  }
}
function markNoteSeen() {
  try {
    localStorage.setItem(NOTE_SEEN_KEY, '1')
  } catch {
    // depolama yoksa not her algılamada bir kez daha gösterilir; zararsız
  }
}

/**
 * C31b §4 — masaüstü oyun algılama köprüsü. AppShell'de bir kez mount edilir.
 * Köprü yoksa (tarayıcı, 1.2.0 öncesi masaüstü) tamamen no-op.
 *
 *  1. Elle oyun listesini sunucudan çekip masaüstüne verir (açılışta + 6 saatte bir).
 *  2. Masaüstünün algıladığı oyunu `activity:set` ile sunucuya iletir. Yalnız ref gider;
 *     görünen ad sunucudan `activity:update` ile geri gelir.
 *  3. İlk algılamada bir kez gizlilik notu gösterir (yerelde hatırlanır).
 *  4. Yayın önerisi: ses kanalındayken oyun açılırsa oturum başına bir Windows bildirimi.
 */
export function useGameActivity() {
  const bridge = window.kankaverse
  if (!bridge?.onGameActivity) return

  const { t } = i18n.global
  const authStore = useAuthStore()
  const router = useRouter()
  const channelsStore = useChannelsStore()
  const activityStore = useActivityStore()
  const voiceStore = useVoiceStore()
  const toast = useToastStore()
  const { openUserSettings } = useAppModals()

  // ── 1. Elle liste ────────────────────────────────────────────────────────
  async function refreshGameList() {
    try {
      const { data } = await gamesApi.curated()
      bridge?.setGameList?.(data)
    } catch {
      // Sunucuya ulaşılamadı: masaüstü son başarılı listeyle (userData/games.json) sürer.
    }
  }
  void refreshGameList()
  const listTimer = setInterval(() => void refreshGameList(), GAME_LIST_REFRESH_MS)

  // ── 2. Algılanan oyun → sunucu ──────────────────────────────────────────
  // Ayar kapalıyken sunucu oyunu kaydetmez; açılınca masaüstü yeni bir değişiklik bildirmeyebilir
  // (oyun zaten açık). Bu yüzden son algılanan saklanır ve etkin ayar açılınca tekrar gönderilir.
  let lastDetected: { ref: string; epicName?: string } | null = null
  const unsubscribe = bridge.onGameActivity((activity) => {
    lastDetected = activity
    if (activity) {
      sendActivity({ ref: activity.ref, epicName: activity.epicName })
      maybeShowNote()
    } else {
      sendActivity({ ref: null })
    }
  })

  watch(
    () => authStore.user?.gameActivityEffective,
    (now, before) => {
      if (now && before === false) {
        sendActivity(
          lastDetected ? { ref: lastDetected.ref, epicName: lastDetected.epicName } : { ref: null },
        )
      }
    },
  )

  // ── 3. İlk algılama notu ────────────────────────────────────────────────
  function maybeShowNote() {
    if (noteSeen() || !authStore.user?.gameActivityEffective) return
    markNoteSeen()
    toast.info(t('activity.note'), {
      durationMs: 12000,
      action: { label: t('activity.noteAction'), run: () => openUserSettings('gizlilik') },
    })
  }

  // ── 4. Yayın önerisi bildirimi (oyun oturumu başına bir) ────────────────
  let offeredFor: string | null = null
  let notif: Notification | null = null

  function closeNotif() {
    notif?.close()
    notif = null
  }

  /** Bağlı olunan ses odasına git: ekran paylaşım düğmesi (ve nudge kapısı) orada yaşıyor. */
  function goToConnectedRoom() {
    const channelId = voiceStore.connectedChannelId
    if (!channelId) return
    for (const [guildId, list] of Object.entries(channelsStore.channelsByGuild)) {
      if (list.some((c) => c.id === channelId)) {
        void router.push({ name: 'channel', params: { guildId, channelId } })
        return
      }
    }
    void router.push({ name: 'dm', params: { channelId } })
  }

  function maybeOfferStream() {
    const game = activityStore.myGame()
    if (!game) {
      offeredFor = null // oyun kapandı: sonraki açılış yeni oturum
      closeNotif()
      return
    }
    if (offeredFor === game.gameId) return
    if (
      !voiceStore.connectedChannelId ||
      !voiceStore.canPublishScreen ||
      voiceStore.isScreenSharing
    )
      return
    // Oyun öndeyken uygulama arkada kalır; pencere odaktaysa düğme zaten ortada, rahatsız etme.
    if (document.hasFocus()) return
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') return
    offeredFor = game.gameId
    try {
      closeNotif()
      notif = new Notification(t('notification.nativeTitle'), {
        body: t('activity.gameOpened', { game: game.name }),
      })
      notif.onclick = () => {
        bridge?.focusWindow?.()
        goToConnectedRoom()
        activityStore.requestShare()
      }
    } catch {
      notif = null
    }
  }

  watch(
    [
      () => activityStore.myGame()?.gameId,
      () => voiceStore.connectedChannelId,
      () => voiceStore.canPublishScreen,
    ],
    maybeOfferStream,
  )

  onUnmounted(() => {
    clearInterval(listTimer)
    unsubscribe()
    closeNotif()
  })
}
