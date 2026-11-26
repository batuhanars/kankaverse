import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { io, type Socket } from 'socket.io-client'
import { useMessagesStore } from '@/stores/messages'
import { useFriendsStore } from '@/stores/friends'
import { usePresenceStore, type PresenceStatus } from '@/stores/presence'
import { useNotificationsStore } from '@/stores/notifications'
import { useDmStore } from '@/stores/dm'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useMembersStore } from '@/stores/members'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import type { GuildMemberDto, ChannelDto, CategoryDto, RoleDto, GroupDmEventPayload } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { useE2eeStore, type SocketE2ee } from '@/stores/e2ee'
import { useGroupEventsStore } from '@/stores/groupEvents'
import { bindE2eeSocket } from '@/composables/useE2eeSocket'
import { useRolesStore } from '@/stores/roles'
import { useActivityStore } from '@/stores/activity'
import { useEventsStore } from '@/stores/events'
import { useVoiceStore, setLeaveWhileRingingHandler, type VoiceParticipant } from '@/stores/voice'
import { useCallStore, type IncomingCall } from '@/stores/call'
import { useEmergencyAlertsStore, type EmergencyAlert } from '@/stores/emergencyAlerts'
import { useCallSounds } from '@/composables/useCallSounds'
import { useToastStore } from '@/stores/toast'
import { useAiVideoViewer } from '@/composables/useAiVideoViewer'
import { i18n } from '@/i18n'
import { getAccessToken, refreshAccessToken } from '@/api/axios'
import { isDefinitiveRefreshRejection } from '@/api/refreshRejection'
import {
  _bindTypingEmitters,
  handleTypingUpdate,
  handleTypingClear,
  clearTypingForChannel,
} from '@/composables/useTyping'
import { invalidateReactionUsers } from '@/composables/useReactionUsers'
import { REACTION_NOTIFY_EVENT, type ReactionNotifyPayload } from '@/utils/reactionNotification'
import { maybeFireDmToast, maybeFireChannelToast } from '@/composables/useMessageToasts'
import { playMessageTone } from '@/utils/messageTone'
import {
  setMobileForeground,
  closeOsNotificationsForChannel,
  closeAllOsNotifications,
} from '@/utils/activeDevice'
import type {
  MessageDto,
  FriendRequestDto,
  FriendDto,
  EventDto,
  NotificationDto,
  DmLastReactionDto,
} from '@/types'

let socket: Socket | null = null
let refCount = 0
// Reconnect sonrası yeniden join için aktif kanalı modül seviyesinde sakla
let activeChannelId: string | null = null
// Ses presence abonelikleri (sidebar "kim var" canlı) — reconnect'te yeniden abone.
// **Referans sayılı** (kanal → izleyen tüketici sayısı), D47/mobil [[D45]] ile aynı sınıf düzeltme:
// aynı kanalı birden çok tüketici izleyebiliyor (açık grup DM'de `DmConversation` + DM listesindeki
// `DmList` ses göstergesi). Düz bir Set'te ilk unmount `voice:unsubscribe` gönderiyordu ve hâlâ
// izleyen öbür tüketici sessizce kör kalıyordu — "seste biri var ama listede görünmüyor".
const voiceSubscriptions = new Map<string, number>()

// Ses presence aboneliği — tüketici mount'ta abone olur, unmount'ta bırakır.
// Modül-seviyesi (useSocket'in ağır store kurulumu olmadan doğrudan import edilir).
// Map reconnect'te yeniden aboneyi de sağlar (bkz. connect handler).
export function voiceSubscribe(channelId: string) {
  const count = (voiceSubscriptions.get(channelId) ?? 0) + 1
  voiceSubscriptions.set(channelId, count)
  // Sunucuya yalnız GERÇEK ilk abonede (0 → 1) gider; sonrakiler sayacı artırır.
  if (count === 1) socket?.emit('voice:subscribe', { channelId })
}
export function voiceUnsubscribe(channelId: string) {
  const count = voiceSubscriptions.get(channelId)
  if (count === undefined) return
  if (count > 1) {
    voiceSubscriptions.set(channelId, count - 1)
    return
  }
  // GERÇEK son tüketici çıktı (1 → 0) → aboneliği bırak.
  voiceSubscriptions.delete(channelId)
  socket?.emit('voice:unsubscribe', { channelId })
}
// #1 — Yayın durumu sinyali: ekran paylaşımı aç/kapa → tüm abonelere YAYINDA rozeti
export function voiceBroadcast(channelId: string, active: boolean) {
  socket?.emit('voice:broadcast', { channelId, active })
}
// C31b §4.1 — masaüstünün algıladığı oyun. Son değer saklanır: yeniden bağlanınca (sunucu presence'ı
// sıfırlar) ve "oyunumu göster" ayarı açılınca tekrar gönderilir. Ad gönderilmez, yalnız ref.
export type ActivityPayload = { ref: string; epicName?: string } | { ref: null }
let lastActivity: ActivityPayload | null = null
export function sendActivity(payload: ActivityPayload) {
  lastActivity = payload
  socket?.emit('activity:set', payload)
}

// C76 §3 — bu penceredeki aktiflik (hareketsizlik algısı `useIdlePresence`'te, tek `useIdle` kaynağı).
// Son değer saklanır: yeniden bağlanınca tekrar gönderilir. Başlangıç true (sunucu da bağlanınca true sayar).
let lastClientActive = true
export function sendClientActivity(active: boolean) {
  lastClientActive = active
  socket?.emit('client:activity', { active })
}

/** Yapay zeka video bitti/başarısız: hazırsa "İzle" düğmeli bilgi, başarısızsa hata toast'ı. */
/** Toast çözmeyi en çok bu kadar bekler (E3 Rev.5); aşılırsa genel metin (liste yine kendiliğinden güncellenir). */
const TOAST_DECRYPT_WAIT_MS = 3000

type SocketPreview = Awaited<ReturnType<ReturnType<typeof useE2eeStore>['resolveSocketPreview']>>

function decryptForToast(
  store: ReturnType<typeof useE2eeStore>,
  channelId: string,
  last: { id: string; createdAt: string; e2ee: SocketE2ee },
  senderId: string,
): Promise<SocketPreview> {
  const none: SocketPreview = { kind: 'none' }
  const timeout = new Promise<SocketPreview>((r) => setTimeout(() => r(none), TOAST_DECRYPT_WAIT_MS))
  return Promise.race([
    store.resolveSocketPreview(channelId, last, senderId).catch(() => none),
    timeout,
  ])
}

function showAiVideoDoneToast(dto: NotificationDto, openView: (id: string) => void) {
  const { t } = i18n.global
  const toast = useToastStore()
  if (dto.type === 'AI_VIDEO_FAILED') {
    toast.error(t('aiVideo.doneToastFailed'))
    return
  }
  const id = dto.aiVideoId
  toast.info(t('aiVideo.doneToastReady'), {
    durationMs: 8000,
    action: id ? { label: t('aiVideo.doneToastWatch'), run: () => openView(id) } : undefined,
  })
}
// auth_error sonrası art arda tazele-dene sayacı (sonsuz döngü koruması; başarılı connect'te sıfırlanır)
let authRetryCount = 0

// D39 §2/§11 — voice store'un leave()'i hâlâ "çalıyor" durumundayken çağrılırsa (iptal/"Bağlantıyı
// Kes"/sekme kapama) buradan call_cancel emit edilir. Modül seviyesi: voiceSubscribe/voiceBroadcast
// ile aynı desen, döngüsel import'tan kaçınır (voice.ts bu dosyayı DEĞİL, tersini import eder zaten).
// 🔴 M4z §F — grup dalı: `voice:call_cancel` grupta KULLANILAMAZ (sunucuda `otherDmMember` tek
// bir "karşı taraf" bulur, grup kanalında rastgele bir üyeye giderdi). Grubun kendi event'i
// sunucuda `voice:group_call_start` ile AYNI kapılardan geçer.
setLeaveWhileRingingHandler((channelId, kind) =>
  socket?.emit(kind === 'group' ? 'voice:group_call_cancel' : 'voice:call_cancel', { channelId }),
)

export function useSocket() {
  const connected = ref(false)
  const router = useRouter()
  const messagesStore = useMessagesStore()
  const friendsStore = useFriendsStore()
  const presenceStore = usePresenceStore()
  const notificationsStore = useNotificationsStore()
  const dmStore = useDmStore()
  const channelsStore = useChannelsStore()
  const guildsStore = useGuildsStore()
  const membersStore = useMembersStore()
  const prefsStore = useNotificationPrefsStore()
  const authStore = useAuthStore()
  const e2eeStore = useE2eeStore()
  const rolesStore = useRolesStore()
  const eventsStore = useEventsStore()
  const voiceStore = useVoiceStore()
  const callStore = useCallStore()
  const emergencyAlertsStore = useEmergencyAlertsStore()
  const activityStore = useActivityStore()

  /** C21: yalnız zaten yüklenmiş üye listesini tazeler (yüklenmemişse girince çekilir). */
  function refreshLoadedMembers(guildId: string) {
    if (membersStore.membersFor(guildId).length > 0) void membersStore.fetchMembers(guildId)
  }

  function _joinRoom(channelId: string) {
    socket?.emit('channel:join', { channelId }, (ack: { ok: boolean; error?: string }) => {
      // Reconnect sonrası yeniden join ack'i artık yutulmuyor (denetim #4)
      if (!ack?.ok) {
        console.warn('[WS] reconnect yeniden-join başarısız:', ack?.error ?? 'bilinmiyor')
      }
    })
  }

  function connect() {
    if (socket?.connected) {
      connected.value = true
      refCount++
      return
    }

    // Prod: VITE_API_URL host'una bağlan (socket.io /socket.io yolunu o host'ta arar).
    // Dev: '/' → vite proxy (ws:true) 127.0.0.1:3001'e taşır.
    socket = io(import.meta.env.VITE_API_URL || '/', {
      // auth fonksiyon formu: her (yeniden) bağlantıda sessionStorage'dan EN GÜNCEL access token okunur.
      // Sabit token verilseydi (denetim #4) 15dk sonra reconnect bayat token'la el sıkışıp auth'ta düşerdi.
      // C76 §2.1: bağlantı türü. Electron köprüsü varsa masaüstü, yoksa web.
      auth: (cb: (data: { token: string; client: 'web' | 'desktop' }) => void) =>
        cb({
          token: getAccessToken() ?? '',
          client: window.kankaverse?.isElectron === true ? 'desktop' : 'web',
        }),
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      connected.value = true
      // C76: sunucu bağlantı başına aktiflik tutar (bağlanınca true varsayar) → mevcut değeri tekrar gönder.
      socket?.emit('client:activity', { active: lastClientActive })
      authRetryCount = 0 // başarılı el sıkışma → tazele-dene sayacını sıfırla
      // Reconnect durumunda aktif kanala yeniden join et
      if (activeChannelId) {
        _joinRoom(activeChannelId)
      }
      // Reconnect: ses presence aboneliklerini yeniden kur (sidebar canlı kalsın)
      for (const channelId of voiceSubscriptions.keys()) {
        socket?.emit('voice:subscribe', { channelId })
      }
      // Reconnect sonrası sunucu bellek-içi presence'ı sıfırladı (online döner).
      // Kullanıcının manuel seçimini (DND/away) koru → sunucuya geri uygula.
      const manual = presenceStore.manualStatus
      if (manual !== 'online') {
        socket?.emit('presence:set', { status: manual })
      }
      // C31b: sunucu bağlantı başına oyunu da unuttu → son algılananı geri bildir.
      if (lastActivity) socket?.emit('activity:set', lastActivity)
    })

    socket.on('disconnect', () => {
      connected.value = false
      setMobileForeground(false) // C76 K2: bilgi bayatlar; kopunca OS bildirimi serbest
    })

    // C76 K2: telefon ön planda mı (sunucu hesap düzeyinde yayar; bağlanınca güncel değer bir kez gelir)
    socket.on('client:mobile_foreground', (data: { active: boolean }) => {
      setMobileForeground(data?.active === true)
    })

    socket.on('connect_error', (err) => {
      console.error('[WS] connect_error', err.message)
    })

    // Bayat access token (~15dk) reconnect el sıkışmasında reddedilir. Kalıcı kapatma
    // YERİNE token'ı tazele + yeniden bağlan → kullanıcı çevrimdışı takılmaz.
    // Refresh de başarısızsa (refresh token da geçersiz) → gerçekten yetkisiz → login.
    socket.on('auth_error', async (data: { error: string }) => {
      if (authRetryCount >= 3) {
        console.error('[WS] auth tazelemeye rağmen reddedildi, bağlantı kapatılıyor:', data.error)
        socket?.disconnect()
        window.dispatchEvent(new CustomEvent('kv:auth:expired'))
        return
      }
      authRetryCount++
      try {
        await refreshAccessToken()
        socket?.connect() // auth callback taze token'ı okur (sunucu io disconnect'inden sonra manuel reconnect gerekir)
      } catch (refreshError) {
        socket?.disconnect()
        // D97: yalnız kesin red oturumu düşürür; ağ/5xx'te kullanıcı atılmaz.
        if (isDefinitiveRefreshRejection(refreshError)) {
          window.dispatchEvent(new CustomEvent('kv:auth:expired'))
        }
      }
    })

    bindE2eeSocket(socket) // E1: e2ee:welcome / e2ee:commit / e2ee:devices-changed

    socket.on('message.created', (message: MessageDto) => {
      // E1: şifreli mesaj önce çözülür (sıra korunur: motor işleri art arda yürütür), şifresiz anında.
      if (message.encrypted) {
        void e2eeStore.hydrateOne(message).then((m) => m && messagesStore.appendMessage(m))
      } else messagesStore.appendMessage(message)
      // Mesaj gelince o kanalda yazıyor göstergesini temizle
      clearTypingForChannel(message.channelId)
    })

    // Sprint 6.2: mesaj düzenleme / silme WS olayları
    socket.on('message.updated', (message: MessageDto) => {
      if (message.encrypted) {
        void e2eeStore.hydrateOne(message).then((m) => m && messagesStore.updateMessage(m))
      } else messagesStore.updateMessage(message)
    })

    socket.on('message.deleted', (data: { messageId: string; channelId: string }) => {
      messagesStore.removeMessage(data.channelId, data.messageId)
      void e2eeStore.forgetMessage(data.channelId, data.messageId) // E5a §4.1: yerel düz kayıt da gider
    })

    socket.on(
      'dm.message',
      (data: {
        channelId: string
        lastMessage: {
          id?: string
          content: string
          createdAt: string
          encrypted?: boolean
          e2ee?: SocketE2ee
        }
        senderId: string
      }) => {
        // Sprint WEB-PARITE §2.2 — susturulmuş/`NONE` DM okunmamış SAYILMAZ; ama sohbet listede
        // yaşamaya devam eder: son mesaj önizlemesi + sıralama yine güncellenir (yalnız rozet yanmaz).
        const { countUnread } = prefsStore.channelBadgeEffect(data.channelId)
        dmStore.applyActivity(data, { countUnread })
        // Masaüstü toast (DM/grup) — pencere arkada VEYA bu DM açık değilse
        const isActive = dmStore.activeDmChannelId === data.channelId
        // Bu DM'e bakarken karşıdan mesaj: mobildeki kısa mesaj sesi (mobil stores/dm.ts ile aynı
        // kural). Pencere arkadaysa çalmaz: o durumda bildirim çıkar ve bildirim sesi çalar.
        const lookingAtIt = !document.hidden && document.hasFocus()
        if (isActive && lookingAtIt && data.senderId !== authStore.user?.id) playMessageTone()
        const { id, e2ee } = data.lastMessage
        if (!data.lastMessage.encrypted || !e2ee || !id) {
          maybeFireDmToast(data, isActive)
          return
        }
        // E3 Rev.5: önce motorla çöz (liste `plainTick` ile kendiliğinden güncellenir), toast çözmeyi
        // en çok TOAST_DECRYPT_WAIT_MS bekler; motor yoksa beklemeden, çözülemezse genel metin.
        void decryptForToast(
          e2eeStore,
          data.channelId,
          { id, createdAt: data.lastMessage.createdAt, e2ee },
          data.senderId,
        ).then(
          (r) => {
            if (r.kind === 'hidden') return // iptal cihazdan: bildirim yok
            maybeFireDmToast(data, isActive, r.kind === 'text' ? r.text : undefined)
          },
        )
      },
    )

    // C20 — başka cihazım okudu / cevapladı (yalnız kendi soketlerime gelir). DM ise rozet düşer;
    // ortam kanalıysa mevcut yerel "okundu" yolu (kopya mantık yok). `channelIds` = read-all.
    socket.on(
      'read:self',
      (data: { channelId?: string; channelIds?: string[]; guildId: string | null }) => {
        if (data.channelIds) {
          closeAllOsNotifications()
          channelsStore.applyAllReadLocal()
          return
        }
        if (!data.channelId) return
        // C76 K3: başka cihazda okundu → bu cihazdaki açık OS bildirimi kalkar
        closeOsNotificationsForChannel(data.channelId)
        if (data.guildId) channelsStore.applyChannelReadLocal(data.channelId, data.guildId)
        else dmStore.applyReadSelf(data.channelId)
      },
    )

    // C46 §4b — DM/grup satırında tepki göstergesi (süzgeç sunucuda)
    socket.on(
      'dm.reaction',
      (data: { channelId: string; lastReaction: DmLastReactionDto | null }) => {
        dmStore.applyReaction(data.channelId, data.lastReaction)
      },
    )

    // C12 §3.3 — karşı taraf DM'i okudu → gönderdiğim mesajların tiki çifte döner.
    // Gizlilik süzgeci SUNUCUDA (`visibleReadAt`, R7): görmeye hakkımız yoksa olay hiç gelmez.
    socket.on('dm:read', (data: { channelId: string; userId: string; readAt: string }) => {
      dmStore.applyReadReceipt(data)
    })

    // C34 — grup DM'de bir üye okudu: toplu "herkes okudu" zamanı (sunucu bu izleyicinin gözünden hesaplar)
    socket.on(
      'dm:groupRead',
      (data: { channelId: string; receiptsEnabled: boolean; groupAllReadAt: string | null }) => {
        dmStore.applyGroupReadReceipt(data)
      },
    )

    // C67 — bir okuyucunun konumu güncellendi (görüldü avatarı); görebilme kararı sunucuda
    socket.on('dm:seen', (data: { channelId: string; userId: string; readAt: string }) => {
      dmStore.applySeen(data)
    })

    // C62 — bu gruptan ayrıldım/çıkarıldım (yalnız benim soketlerime): sohbet listede kalır, band çıkar.
    socket.on(
      'dm.group_departed',
      (data: { channelId: string; reason: 'LEFT' | 'REMOVED'; leftAt: string }) => {
        void dmStore.applyGroupDeparted(data).catch(() => {})
        // Sunucu bizi o kanalın arama odasından da çıkardı; bundan sonra güncelleme gelmez, eski simge/sayı kalmasın.
        voiceStore.clearChannelPresence(data.channelId)
      },
    )

    // C64 — grup üyelik olayı: üye listesi anında güncellenir, açık sohbetin akışına satır eklenir
    socket.on('dm.group_event', (data: GroupDmEventPayload) => {
      useGroupEventsStore().add(data.event)
      void dmStore.applyGroupEvent(data).catch(() => {})
    })

    // C9 — bana yeni mesaj isteği geldi (sessiz: masaüstü toast YOK, yalnız "Mesaj İstekleri" rozeti güncellenir)
    socket.on('dm.request', () => {
      dmStore.fetchRequests().catch(() => {})
    })

    // C75 §2.6 — giden mesaj isteğim kabul edildi (alıcı yazmasa bile): gönderen kutusunun kilidi kalkar
    socket.on('dm.request_accepted', (data: { channelId: string }) => {
      dmStore.applyRequestAccepted(data.channelId)
    })

    // C75 §2.7 — gelen isteği başka cihazımda kabul/ret ettim: istek listesinden düşer
    socket.on(
      'dm.request_resolved',
      (data: { channelId: string; outcome: 'accepted' | 'rejected' }) => {
        dmStore.applyRequestResolved(data.channelId, data.outcome)
      },
    )

    // friend.* event'leri YALNIZ friends store senkronu için kalır (arkadaş listesi).
    // Bell artık bunlardan beslenmiyor → kalıcı `notification` event'i kullanır (Sprint C1).
    socket.on('friend.request', (request: FriendRequestDto) => {
      friendsStore.wsAddIncomingRequest(request)
    })

    socket.on('friend.accept', (friend: FriendDto) => {
      friendsStore.wsHandleAccepted(friend)
    })

    socket.on('friend.remove', (data: { userId: string }) => {
      friendsStore.wsHandleRemoved(data.userId)
    })

    // Sprint C1: kalıcı bildirim — anlık teslim + handshake snapshot (§3).
    // Bell'in TEK kaynağı; friend.*/mention'a paralel, T&S-süzülmüş tetikleyicilerden doğar.
    socket.on('notification', (dto: NotificationDto) => {
      notificationsStore.handleIncoming(dto)
      // C49 R3: üretim bitti/başarısız → giriş butonundaki "sürüyor" göstergesi söner
      if (dto.type === 'AI_VIDEO_READY' || dto.type === 'AI_VIDEO_FAILED') {
        const viewer = useAiVideoViewer()
        viewer.clearActive()
        // Mobil eşi (socket.ts C56 §4): pencere görünür + video diyaloğu kapalıysa uygulama içi toast.
        // Pencere gizliyken Electron OS bildirimi (useNativeNotifications) devrede, çift bildirim olmaz.
        if (!document.hidden && viewer.openCount.value === 0) {
          showAiVideoDoneToast(dto, viewer.openView)
        }
      }
    })

    socket.on(
      'notification:snapshot',
      (payload: { notifications: NotificationDto[]; unreadCount: number }) => {
        notificationsStore.applySnapshot(payload)
      },
    )

    // A4 — Acil alarm (yalnız platform isModerator alır; sunucu otorite). Kalıcı alarm + dikkat sesi.
    socket.on('emergency.alert', (data: EmergencyAlert) => {
      emergencyAlertsStore.add(data)
      useCallSounds().playAlert()
    })

    socket.on(
      'presence:snapshot',
      (payload: {
        states: Array<{
          userId: string
          status: PresenceStatus
          gameId?: string
          gameName?: string
          gameIconUrl?: string | null
          gameStartedAt?: string
          gameStoreUrl?: string | null
        }>
      }) => {
        presenceStore.applySnapshot(payload.states)
        activityStore.applySnapshot(payload.states)
      },
    )

    // C31b: "oynuyor" satırı. game=null → oyun yok / ayar kapandı / dnd / çevrimdışı.
    socket.on(
      'activity:update',
      (payload: {
        userId: string
        game: {
          id: string
          name: string
          iconUrl?: string | null
          startedAt?: string
          storeUrl?: string | null
        } | null
      }) => {
        activityStore.applyUpdate(payload.userId, payload.game)
      },
    )

    socket.on('presence:update', (payload: { userId: string; status: PresenceStatus }) => {
      presenceStore.applyUpdate(payload.userId, payload.status)
    })

    socket.on('typing:update', (data: { userId: string; username: string; channelId: string }) => {
      handleTypingUpdate(data.userId, data.username, data.channelId)
    })

    socket.on('typing:clear', (data: { userId: string; username: string; channelId: string }) => {
      handleTypingClear(data.userId, data.channelId)
    })

    // Sprint V2: reaksiyon WS olayları
    socket.on(
      'reaction.added',
      (data: { messageId: string; channelId: string; emoji: string; userId: string }) => {
        invalidateReactionUsers(data.messageId)
        messagesStore.applyReaction(
          data.messageId,
          data.emoji,
          data.userId,
          authStore.user?.id ?? '',
          true,
        )
      },
    )

    socket.on(
      'reaction.removed',
      (data: { messageId: string; channelId: string; emoji: string; userId: string }) => {
        invalidateReactionUsers(data.messageId)
        messagesStore.applyReaction(
          data.messageId,
          data.emoji,
          data.userId,
          authStore.user?.id ?? '',
          false,
        )
      },
    )

    // C46 §4.3: DM'de mesaj sahibine tepki bildirimi (çan kaydı yok). Masaüstü bildirimi
    // useNativeNotifications'ta; iki katman arası bağ pencere olayıdır (ortak store gerekmez).
    socket.on('reaction.notify', (data: ReactionNotifyPayload) => {
      window.dispatchEvent(new CustomEvent(REACTION_NOTIFY_EVENT, { detail: data }))
    })

    // Sprint V2 Pins: sabitleme WS olayları (§5)
    socket.on(
      'message.pinned',
      (data: { messageId: string; channelId: string; pinnedAt: string }) => {
        messagesStore.setPinned(data.channelId, data.messageId, data.pinnedAt)
      },
    )

    socket.on('message.unpinned', (data: { messageId: string; channelId: string }) => {
      messagesStore.setPinned(data.channelId, data.messageId, null)
    })

    // Sprint V2: @bahsetme — kanal/guild `unreadMentionCount` rozetini sürer.
    // Bell ARTIK bunu tüketmez (Sprint C1 → kalıcı `notification` event'i); bu event
    // yalnız rozet sistemi için korunur (başka tüketicisi var).
    socket.on(
      'mention',
      (payload: { messageId: string; channelId: string; guildId: string | null }) => {
        // REV-4: guild kanalında bahsetme → o kanalı izlemiyorsam mention rozetini artır
        // (rail kırmızı sayaç + kanal sidebar bandı). DM (guildId null) → bu sistem dışı.
        if (payload.guildId && activeChannelId !== payload.channelId) {
          // Sprint WEB-PARITE §2.2 — kanal susturulmuş/`NONE` ise ne kanal ne ortam sayacı artar.
          if (!prefsStore.channelBadgeEffect(payload.channelId).countMention) return
          channelsStore.markChannelMentioned(payload.channelId, payload.guildId)
          guildsStore.incrementGuildMention(payload.guildId)
        }
      },
    )

    // Kanal aktivitesi — başka üyenin mesajı. Zengin payload (author + preview) yalnız
    // kanalı okuyabilen üyeye gelir (backend T&S kapısı); masaüstü toast onu kullanır.
    socket.on(
      'channel.activity',
      (data: {
        channelId: string
        guildId: string
        authorId: string
        author?: { id: string; username: string }
        preview?: string
      }) => {
        const isActive = activeChannelId === data.channelId
        // Masaüstü toast — pencere arkada VEYA bu kanal açık değilse
        maybeFireChannelToast(data, isActive)
        // Kullanıcı o kanalı şu an izliyorsa unread saymıyoruz
        if (isActive) return
        // Sprint WEB-PARITE §2.2 — susturulmuş/`NONE`/`MENTIONS` kanalda düz mesaj sayılmaz:
        // ne kanal satırı ne de rail'deki ortam simgesi yanar (süzgeç artış anında, çizimde değil).
        if (!prefsStore.channelBadgeEffect(data.channelId).countUnread) return
        channelsStore.markChannelUnread(data.channelId, data.guildId)
        guildsStore.incrementGuildUnread(data.guildId)
      },
    )

    // REV-14: ortam üye olayları — üye listesi + mention autocomplete anlık (yenileme yok)
    socket.on('guild.member_joined', (data: { guildId: string; member: GuildMemberDto }) => {
      membersStore.addMember(data.guildId, data.member)
    })
    // Ben yeni bir ortama katıldığımda/oluşturduğumda (başka oturum dahil) rail anlık güncellensin.
    // Simetri: ayrılma/kick zaten guild.member_left ile düşürülüyor (removeGuildLocal).
    socket.on('guild.joined', () => {
      guildsStore.fetchGuilds()
    })
    socket.on('guild.member_left', (data: { guildId: string; userId: string }) => {
      membersStore.removeMember(data.guildId, data.userId)
      // Atılan bensem ortamı listeden düşür (rail anlık güncellenir)
      if (data.userId === authStore.user?.id) {
        // C62 §5: o ortamın kanal rotasındaysam ana sayfaya dön (rota yoksa `removeGuildLocal`dan sonra boş ekran kalırdı)
        const route = router.currentRoute.value
        const inThatGuild = route.name === 'channel' && route.params.guildId === data.guildId
        guildsStore.removeGuildLocal(data.guildId)
        if (inThatGuild) void router.push({ name: 'app' })
      }
    })
    socket.on('guild.member_updated', (data: { guildId: string; member: GuildMemberDto }) => {
      membersStore.updateMember(data.guildId, data.member)
      // Kendi rolüm değiştiyse guild role önbelleğini güncelle (yetki UI anlık)
      if (data.member.userId === authStore.user?.id) {
        guildsStore.setMyRole(data.guildId, data.member.role)
      }
    })

    // Sprint V3: rol CRUD WS olayları
    socket.on('guild.role_created', (role: RoleDto) => {
      rolesStore.upsertRole(role.guildId, role)
    })
    socket.on('guild.role_updated', (role: RoleDto) => {
      const prev = rolesStore.rolesFor(role.guildId).find((r) => r.id === role.id)
      rolesStore.upsertRole(role.guildId, role)
      // C21: rol emojisi değişti → üyelerin sunucu-hesaplı roleEmoji'si bayatladı, listeyi tazele
      if (prev && (prev.unicodeEmoji ?? null) !== (role.unicodeEmoji ?? null)) {
        refreshLoadedMembers(role.guildId)
      }
    })
    socket.on('guild.role_deleted', (data: { roleId: string }) => {
      const guildId = rolesStore.findGuildIdByRole(data.roleId)
      if (guildId) {
        rolesStore.removeRoleLocal(guildId, data.roleId)
        refreshLoadedMembers(guildId)
      }
    })

    // Sprint V3: Ortam etkinliği WS olayları (yalnız görünür üyelere yayınlanır — §7)
    socket.on('guild.event_created', (event: EventDto) => {
      eventsStore.upsertEvent(event)
    })
    socket.on('guild.event_updated', (event: EventDto) => {
      eventsStore.upsertEvent(event)
    })
    socket.on('guild.event_deleted', (data: { guildId: string; eventId: string }) => {
      eventsStore.removeEventLocal(data.guildId, data.eventId)
    })

    // Realtime: kanal/kategori CRUD → diğer üyelerde anlık (sayfa yenileme yok)
    socket.on('channel.created', (data: { guildId: string; channel: ChannelDto }) => {
      channelsStore.upsertChannelLocal(data.guildId, data.channel)
    })
    socket.on('channel.updated', (data: { guildId: string; channel: ChannelDto }) => {
      channelsStore.upsertChannelLocal(data.guildId, data.channel)
    })
    socket.on('channel.deleted', (data: { guildId: string; channelId: string }) => {
      channelsStore.removeChannelLocal(data.guildId, data.channelId)
    })
    socket.on('category.created', (data: { guildId: string; category: CategoryDto }) => {
      channelsStore.upsertCategoryLocal(data.guildId, data.category)
    })
    socket.on('category.updated', (data: { guildId: string; category: CategoryDto }) => {
      channelsStore.upsertCategoryLocal(data.guildId, data.category)
    })
    socket.on('category.deleted', (data: { guildId: string; categoryId: string }) => {
      channelsStore.removeCategoryLocal(data.guildId, data.categoryId)
    })

    // Sprint V2 LiveKit: ses kanalı presence (backend webhook → WS; sözleşme §5)
    socket.on(
      'voice.participant_joined',
      (data: { channelId: string; participant: VoiceParticipant }) => {
        voiceStore.addParticipant(data.channelId, data.participant)
      },
    )

    socket.on('voice.participant_left', (data: { channelId: string; userId: string }) => {
      voiceStore.removeParticipant(data.channelId, data.userId)
    })

    // R11 ses moderasyonu — moderatör (server) susturma göstergesi (room'a yayın)
    socket.on('voice.participant_muted', (data: { channelId: string; userId: string }) => {
      voiceStore.addServerMute(data.channelId, data.userId)
    })
    socket.on('voice.participant_unmuted', (data: { channelId: string; userId: string }) => {
      voiceStore.removeServerMute(data.channelId, data.userId)
    })

    // #1 — Yayın durumu rozeti: ekran paylaşımı aç/kapa (hem room hem voice aboneleri)
    socket.on('voice.broadcast_started', (data: { channelId: string; userId: string }) => {
      voiceStore.addBroadcast(data.channelId, data.userId)
    })
    socket.on('voice.broadcast_stopped', (data: { channelId: string; userId: string }) => {
      voiceStore.removeBroadcast(data.channelId, data.userId)
    })

    // R11B — odadan çıkarıldı (yalnız çıkarılan kullanıcıya gelir → leave + bildir)
    socket.on('voice.kicked', async (data: { channelId: string; userId: string }) => {
      if (voiceStore.connectedChannelId === data.channelId) {
        await voiceStore.leave()
        useToastStore().info(i18n.global.t('voice.kickedToast'))
      }
    })

    // R11 — yetkili taşıdı (yalnız taşınan kullanıcıya gelir): mevcut sesten ayrıl,
    // hedef kanala mevcut join akışıyla katıl, o kanala yönlen, bilgilendir.
    socket.on('voice.moved', async (data: { fromChannelId: string; toChannelId: string }) => {
      await voiceStore.leave()
      await voiceStore.join(data.toChannelId)
      // Hedef kanalın guild'ine yönlen (kanal store'dan guildId bul)
      const target = channelsStore.findChannelById(data.toChannelId)
      if (target?.guildId) {
        router.push({
          name: 'channel',
          params: { guildId: target.guildId, channelId: data.toChannelId },
        })
      }
      useToastStore().info(i18n.global.t('voice.movedToast'))
    })

    // Sprint V2 DM sesli arama — sinyalizasyon (gate sunucuda; sözleşme SPRINT_V2_DM_CALL_CONTRACT.md)
    socket.on('voice.incoming_call', (data: IncomingCall) => {
      callStore.setIncoming(data)
    })
    socket.on('voice.call_accepted', () => {
      // D39 §2/§3 — oda-önce: arayan zaten odada (startCall'da join etti). Karşı taraf kabul etti,
      // yalnız "çalıyor" göstergesini düşür. İKİNCİ join YOK — çift-join tuzağı (§3): LiveKit yeniden
      // bağlanma, ses kesilmesi, hayalet katılımcı riski taşırdı.
      callStore.clearOutgoing()
    })
    socket.on('voice.call_rejected', () => {
      // D39 §2 — arayan zaten odada; reddedilince odadan da çıkması gerekir (klasik modelde
      // henüz odaya girmemiş olduğu için bu adım yoktu).
      // 🔴 Sıra ÖNEMLİ: clearOutgoing() leave()'den ÖNCE gelmeli. voiceStore.leave() içindeki
      // cancelRingingIfNeeded, callStore.isRinging'e bakıp hâlâ true ise call_cancel gönderir —
      // burada zaten reddedilmiş bir aramaya cancel göndermek anlamsız (karşı taraf zaten biliyor).
      // clearOutgoing() önce çalışınca isRinging false olur, gereksiz cancel atlanır. Satırları
      // yer değiştirme.
      callStore.clearOutgoing()
      callStore.setNotice('rejected')
      void voiceStore.leave()
    })
    socket.on('voice.call_canceled', () => {
      callStore.clearIncoming()
    })
    socket.on(
      'voice.group_call_started',
      (data: { channelId: string; by: { id: string; username: string } }) => {
        // 🔴 M4b §14.1 — ESKİDEN yalnız `setNotice('group:…')` (kendiliğinden kaybolan pasif şerit)
        // gösteriliyordu. Sahip kararıyla grup DM'de de ARTIK ÇALIYOR: 1-1'in `IncomingCallModal`'ı
        // yeniden kullanılır (yeni modal yazılmadı), aynı zil, aynı Reddet/Kabul düğmeleri.
        // Sonradan katılan kimseyi çaldırmaz: `DmConversation.onGroupVoiceClick` odada biri varsa
        // `voice:group_call_start` sinyalini hiç göndermiyor — ayrım zaten koddaydı.
        // Avatar yok: sunucu bu olayda yalnız `{ id, username }` gönderiyor (modal baş harfe düşer).
        if (voiceStore.connectedChannelId === data.channelId) return // biz zaten odadayız
        callStore.setIncoming({
          channelId: data.channelId,
          caller: { id: data.by.id, username: data.by.username, avatarUrl: null },
          kind: 'group',
        })
      },
    )
    // 🔴 M4z §F — grup çağrısını BAŞLATAN odadan çıktı: modal ve zil ANINDA kapansın (eskiden
    // 30 sn'lik zaman aşımına kadar ortada olmayan bir çağrı çalıyordu). 1-1'in
    // `voice.call_canceled` dalıyla simetrik, aynı ortak çıkış. Zaten ODAYA KATILMIŞ olan
    // etkilenmez: `clearIncoming` yalnız çalma durumunu temizler, LiveKit bağlantısına dokunmaz
    // (odadakinin `incoming`ı zaten `acceptCall`da boşaltılmıştı).
    socket.on('voice.group_call_canceled', () => {
      callStore.clearIncoming()
    })

    // Typing emit fonksiyonlarını useTyping composable'ına bağla
    _bindTypingEmitters(
      (channelId: string) => socket?.emit('typing:start', { channelId }),
      (channelId: string) => socket?.emit('typing:stop', { channelId }),
    )

    refCount++
  }

  function disconnect() {
    refCount--
    if (refCount <= 0 && socket) {
      socket.disconnect()
      socket = null
      refCount = 0
      activeChannelId = null
      connected.value = false
    }
  }

  function joinChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
    activeChannelId = channelId
    return new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, error: 'NOT_CONNECTED' })
      // Ack gelmezse (auth başarısız → emit kuyrukta asılı kalır) promise sonsuza
      // beklemesin; 5sn sonra TIMEOUT döndür ki çağıran (MessageArea) ilerleyebilsin.
      let settled = false
      const done = (ack: { ok: boolean; error?: string }) => {
        if (settled) return
        settled = true
        resolve(ack)
      }
      const timer = setTimeout(() => done({ ok: false, error: 'TIMEOUT' }), 5000)
      socket.emit('channel:join', { channelId }, (ack: { ok: boolean; error?: string }) => {
        clearTimeout(timer)
        done(ack)
      })
    })
  }

  function leaveChannel(channelId: string) {
    if (activeChannelId === channelId) activeChannelId = null
    socket?.emit('channel:leave', { channelId })
    clearTypingForChannel(channelId)
  }

  /**
   * `auto: true` yalnız hareketsizlik otomasyonu için (`useIdlePresence`): sunucu bunu hesabın
   * seçimi olarak DEĞİL, yalnız bu pencerenin durumu olarak işler. Kullanıcının kutucuktan yaptığı
   * seçim (UserCard) bayraksız gider ve hesap kapsamlı kalır — ayrım sunucudaki `PresenceService`
   * kusur notunda anlatılıyor: tepside unutulmuş bir pencere bütün hesabı boşta gösteriyordu.
   */
  function setPresence(status: PresenceStatus, opts?: { auto?: boolean }) {
    socket?.emit('presence:set', { status, auto: opts?.auto === true })
  }

  // ── DM sesli arama emitter'ları (ack'li olanlar 5sn timeout) ──
  function _emitAck(event: string, channelId: string): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, error: 'NOT_CONNECTED' })
      let settled = false
      const done = (ack: { ok: boolean; error?: string }) => {
        if (!settled) {
          settled = true
          resolve(ack)
        }
      }
      const timer = setTimeout(() => done({ ok: false, error: 'TIMEOUT' }), 5000)
      socket.emit(event, { channelId }, (ack: { ok: boolean; error?: string }) => {
        clearTimeout(timer)
        done(ack ?? { ok: false })
      })
    })
  }
  function callInvite(channelId: string) {
    return _emitAck('voice:call_invite', channelId)
  }
  function groupCallStart(channelId: string) {
    return _emitAck('voice:group_call_start', channelId)
  }
  function callAccept(channelId: string) {
    socket?.emit('voice:call_accept', { channelId })
  }
  function callReject(channelId: string) {
    socket?.emit('voice:call_reject', { channelId })
  }
  function callCancel(channelId: string) {
    socket?.emit('voice:call_cancel', { channelId })
  }

  onUnmounted(() => {
    // intentionally empty — disconnect AppShell (layout) tarafından yönetiliyor
  })

  return {
    connected,
    connect,
    disconnect,
    joinChannel,
    leaveChannel,
    setPresence,
    callInvite,
    groupCallStart,
    callAccept,
    callReject,
    callCancel,
  }
}
