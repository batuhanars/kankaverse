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
import type { GuildMemberDto, ChannelDto, CategoryDto, RoleDto } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'
import { useEventsStore } from '@/stores/events'
import { useVoiceStore, type VoiceParticipant } from '@/stores/voice'
import { useCallStore, type IncomingCall } from '@/stores/call'
import { useToastStore } from '@/stores/toast'
import { i18n } from '@/i18n'
import { getAccessToken, refreshAccessToken } from '@/api/axios'
import {
  _bindTypingEmitters,
  handleTypingUpdate,
  handleTypingClear,
  clearTypingForChannel,
} from '@/composables/useTyping'
import type { MessageDto, FriendRequestDto, FriendDto, EventDto, NotificationDto } from '@/types'

let socket: Socket | null = null
let refCount = 0
// Reconnect sonrası yeniden join için aktif kanalı modül seviyesinde sakla
let activeChannelId: string | null = null
// Ses presence abonelikleri (sidebar "kim var" canlı) — reconnect'te yeniden abone
const voiceSubscriptions = new Set<string>()

// Ses presence aboneliği — VoiceParticipantList mount'ta abone, unmount'ta bırakır.
// Modül-seviyesi (useSocket'in ağır store kurulumu olmadan doğrudan import edilir).
// Set reconnect'te yeniden aboneyi sağlar (bkz. connect handler). İdempotent.
export function voiceSubscribe(channelId: string) {
  if (voiceSubscriptions.has(channelId)) return
  voiceSubscriptions.add(channelId)
  socket?.emit('voice:subscribe', { channelId })
}
export function voiceUnsubscribe(channelId: string) {
  if (!voiceSubscriptions.has(channelId)) return
  voiceSubscriptions.delete(channelId)
  socket?.emit('voice:unsubscribe', { channelId })
}
// auth_error sonrası art arda tazele-dene sayacı (sonsuz döngü koruması; başarılı connect'te sıfırlanır)
let authRetryCount = 0

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
  const authStore = useAuthStore()
  const rolesStore = useRolesStore()
  const eventsStore = useEventsStore()
  const voiceStore = useVoiceStore()
  const callStore = useCallStore()

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
      auth: (cb: (data: { token: string }) => void) => cb({ token: getAccessToken() ?? '' }),
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      connected.value = true
      authRetryCount = 0 // başarılı el sıkışma → tazele-dene sayacını sıfırla
      // Reconnect durumunda aktif kanala yeniden join et
      if (activeChannelId) {
        _joinRoom(activeChannelId)
      }
      // Reconnect: ses presence aboneliklerini yeniden kur (sidebar canlı kalsın)
      for (const channelId of voiceSubscriptions) {
        socket?.emit('voice:subscribe', { channelId })
      }
      // Reconnect sonrası sunucu bellek-içi presence'ı sıfırladı (online döner).
      // Kullanıcının manuel seçimini (DND/away) koru → sunucuya geri uygula.
      const manual = presenceStore.manualStatus
      if (manual !== 'online') {
        socket?.emit('presence:set', { status: manual })
      }
    })

    socket.on('disconnect', () => {
      connected.value = false
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
      } catch {
        socket?.disconnect()
        window.dispatchEvent(new CustomEvent('kv:auth:expired'))
      }
    })

    socket.on('message.created', (message: MessageDto) => {
      messagesStore.appendMessage(message)
      // Mesaj gelince o kanalda yazıyor göstergesini temizle
      clearTypingForChannel(message.channelId)
    })

    // Sprint 6.2: mesaj düzenleme / silme WS olayları
    socket.on('message.updated', (message: MessageDto) => {
      messagesStore.updateMessage(message)
    })

    socket.on('message.deleted', (data: { messageId: string; channelId: string }) => {
      messagesStore.removeMessage(data.channelId, data.messageId)
    })

    socket.on('dm.message', (data: { channelId: string; lastMessage: { content: string; createdAt: string }; senderId: string }) => {
      dmStore.applyActivity(data)
    })

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
    })

    socket.on('notification:snapshot', (payload: { notifications: NotificationDto[]; unreadCount: number }) => {
      notificationsStore.applySnapshot(payload)
    })

    socket.on('presence:snapshot', (payload: { states: Array<{ userId: string; status: PresenceStatus }> }) => {
      presenceStore.applySnapshot(payload.states)
    })

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
    socket.on('reaction.added', (data: { messageId: string; channelId: string; emoji: string; userId: string }) => {
      messagesStore.applyReaction(data.messageId, data.emoji, data.userId, authStore.user?.id ?? '', true)
    })

    socket.on('reaction.removed', (data: { messageId: string; channelId: string; emoji: string; userId: string }) => {
      messagesStore.applyReaction(data.messageId, data.emoji, data.userId, authStore.user?.id ?? '', false)
    })

    // Sprint V2 Pins: sabitleme WS olayları (§5)
    socket.on('message.pinned', (data: { messageId: string; channelId: string; pinnedAt: string }) => {
      messagesStore.setPinned(data.channelId, data.messageId, data.pinnedAt)
    })

    socket.on('message.unpinned', (data: { messageId: string; channelId: string }) => {
      messagesStore.setPinned(data.channelId, data.messageId, null)
    })

    // Sprint V2: @bahsetme — kanal/guild `unreadMentionCount` rozetini sürer.
    // Bell ARTIK bunu tüketmez (Sprint C1 → kalıcı `notification` event'i); bu event
    // yalnız rozet sistemi için korunur (başka tüketicisi var).
    socket.on('mention', (payload: { messageId: string; channelId: string; guildId: string | null }) => {
      // REV-4: guild kanalında bahsetme → o kanalı izlemiyorsam mention rozetini artır
      // (rail kırmızı sayaç + kanal sidebar bandı). DM (guildId null) → bu sistem dışı.
      if (payload.guildId && activeChannelId !== payload.channelId) {
        channelsStore.markChannelMentioned(payload.channelId, payload.guildId)
        guildsStore.incrementGuildMention(payload.guildId)
      }
    })

    // Kanal aktivitesi — başka üyenin mesajı: aktif değilse unread sayacını artır
    socket.on('channel.activity', (data: { channelId: string; guildId: string; authorId: string }) => {
      // Kullanıcı o kanalı şu an izliyorsa unread saymıyoruz
      if (activeChannelId === data.channelId) return
      channelsStore.markChannelUnread(data.channelId, data.guildId)
      guildsStore.incrementGuildUnread(data.guildId)
    })

    // REV-14: ortam üye olayları — üye listesi + mention autocomplete anlık (yenileme yok)
    socket.on('guild.member_joined', (data: { guildId: string; member: GuildMemberDto }) => {
      membersStore.addMember(data.guildId, data.member)
    })
    socket.on('guild.member_left', (data: { guildId: string; userId: string }) => {
      membersStore.removeMember(data.guildId, data.userId)
      // Atılan bensem ortamı listeden düşür (rail anlık güncellenir)
      if (data.userId === authStore.user?.id) {
        guildsStore.removeGuildLocal(data.guildId)
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
      rolesStore.upsertRole(role.guildId, role)
    })
    socket.on('guild.role_deleted', (data: { roleId: string }) => {
      const guildId = rolesStore.findGuildIdByRole(data.roleId)
      if (guildId) rolesStore.removeRoleLocal(guildId, data.roleId)
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
    socket.on('voice.participant_joined', (data: { channelId: string; participant: VoiceParticipant }) => {
      voiceStore.addParticipant(data.channelId, data.participant)
    })

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

    // R11 — yetkili taşıdı (yalnız taşınan kullanıcıya gelir): mevcut sesten ayrıl,
    // hedef kanala mevcut join akışıyla katıl, o kanala yönlen, bilgilendir.
    socket.on('voice.moved', async (data: { fromChannelId: string; toChannelId: string }) => {
      await voiceStore.leave()
      await voiceStore.join(data.toChannelId)
      // Hedef kanalın guild'ine yönlen (kanal store'dan guildId bul)
      const target = channelsStore.findChannelById(data.toChannelId)
      if (target?.guildId) {
        router.push({ name: 'channel', params: { guildId: target.guildId, channelId: data.toChannelId } })
      }
      useToastStore().info(i18n.global.t('voice.movedToast'))
    })

    // Sprint V2 DM sesli arama — sinyalizasyon (gate sunucuda; sözleşme SPRINT_V2_DM_CALL_CONTRACT.md)
    socket.on('voice.incoming_call', (data: IncomingCall) => {
      callStore.setIncoming(data)
    })
    socket.on('voice.call_accepted', (data: { channelId: string }) => {
      // Karşı taraf kabul etti → odaya katıl, çalma durumunu temizle
      callStore.clearOutgoing()
      voiceStore.join(data.channelId, { autoEndWhenAlone: true }) // REV-12: DM çağrısı
    })
    socket.on('voice.call_rejected', () => {
      callStore.clearOutgoing()
      callStore.setNotice('rejected')
    })
    socket.on('voice.call_canceled', () => {
      callStore.clearIncoming()
    })
    socket.on('voice.group_call_started', (data: { channelId: string; by: { id: string; username: string } }) => {
      // v1: bilgilendirme (grup DM'de "Sese Katıl" zaten her zaman görünür)
      callStore.setNotice(`group:${data.by.username}`)
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

  function setPresence(status: PresenceStatus) {
    socket?.emit('presence:set', { status })
  }

  // ── DM sesli arama emitter'ları (ack'li olanlar 5sn timeout) ──
  function _emitAck(event: string, channelId: string): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, error: 'NOT_CONNECTED' })
      let settled = false
      const done = (ack: { ok: boolean; error?: string }) => { if (!settled) { settled = true; resolve(ack) } }
      const timer = setTimeout(() => done({ ok: false, error: 'TIMEOUT' }), 5000)
      socket.emit(event, { channelId }, (ack: { ok: boolean; error?: string }) => { clearTimeout(timer); done(ack ?? { ok: false }) })
    })
  }
  function callInvite(channelId: string) { return _emitAck('voice:call_invite', channelId) }
  function groupCallStart(channelId: string) { return _emitAck('voice:group_call_start', channelId) }
  function callAccept(channelId: string) { socket?.emit('voice:call_accept', { channelId }) }
  function callReject(channelId: string) { socket?.emit('voice:call_reject', { channelId }) }
  function callCancel(channelId: string) { socket?.emit('voice:call_cancel', { channelId }) }

  onUnmounted(() => {
    // intentionally empty — disconnect AppShell (layout) tarafından yönetiliyor
  })

  return {
    connected, connect, disconnect, joinChannel, leaveChannel, setPresence,
    callInvite, groupCallStart, callAccept, callReject, callCancel,
  }
}
