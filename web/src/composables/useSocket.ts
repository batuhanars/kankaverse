import { ref, onUnmounted } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { useMessagesStore } from '@/stores/messages'
import { useFriendsStore } from '@/stores/friends'
import { usePresenceStore, type PresenceStatus } from '@/stores/presence'
import { useNotificationsStore, type MentionPayload } from '@/stores/notifications'
import { useDmStore } from '@/stores/dm'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useAuthStore } from '@/stores/auth'
import { useVoiceStore, type VoiceParticipant } from '@/stores/voice'
import { useCallStore, type IncomingCall } from '@/stores/call'
import { getAccessToken } from '@/api/axios'
import {
  _bindTypingEmitters,
  handleTypingUpdate,
  handleTypingClear,
  clearTypingForChannel,
} from '@/composables/useTyping'
import type { MessageDto, FriendRequestDto, FriendDto } from '@/types'

let socket: Socket | null = null
let refCount = 0
// Reconnect sonrası yeniden join için aktif kanalı modül seviyesinde sakla
let activeChannelId: string | null = null

export function useSocket() {
  const connected = ref(false)
  const messagesStore = useMessagesStore()
  const friendsStore = useFriendsStore()
  const presenceStore = usePresenceStore()
  const notificationsStore = useNotificationsStore()
  const dmStore = useDmStore()
  const channelsStore = useChannelsStore()
  const guildsStore = useGuildsStore()
  const authStore = useAuthStore()
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

    socket = io('/', {
      // auth fonksiyon formu: her (yeniden) bağlantıda sessionStorage'dan EN GÜNCEL access token okunur.
      // Sabit token verilseydi (denetim #4) 15dk sonra reconnect bayat token'la el sıkışıp auth'ta düşerdi.
      auth: (cb: (data: { token: string }) => void) => cb({ token: getAccessToken() ?? '' }),
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      connected.value = true
      // Reconnect durumunda aktif kanala yeniden join et
      if (activeChannelId) {
        _joinRoom(activeChannelId)
      }
    })

    socket.on('disconnect', () => {
      connected.value = false
    })

    socket.on('connect_error', (err) => {
      console.error('[WS] connect_error', err.message)
    })

    socket.on('auth_error', (data: { error: string }) => {
      console.error('[WS] auth hatası, bağlantı kesiliyor:', data.error)
      socket?.disconnect()
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

    socket.on('friend.request', (request: FriendRequestDto) => {
      friendsStore.wsAddIncomingRequest(request)
      notificationsStore.push({
        type: 'friend_request',
        user: request.user,
        at: new Date().toISOString(),
      })
    })

    socket.on('friend.accept', (friend: FriendDto) => {
      friendsStore.wsHandleAccepted(friend)
      notificationsStore.push({
        type: 'friend_accept',
        user: friend.user,
        at: new Date().toISOString(),
      })
    })

    socket.on('friend.remove', (data: { userId: string }) => {
      friendsStore.wsHandleRemoved(data.userId)
      notificationsStore.push({
        type: 'friend_remove',
        user: undefined,
        at: new Date().toISOString(),
      })
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

    // Sprint V2: @bahsetme bildirimi
    socket.on('mention', (payload: MentionPayload) => {
      notificationsStore.push({
        type: 'mention',
        user: payload.author,
        mention: payload,
        at: new Date().toISOString(),
      })
    })

    // Kanal aktivitesi — başka üyenin mesajı: aktif değilse unread sayacını artır
    socket.on('channel.activity', (data: { channelId: string; guildId: string; authorId: string }) => {
      // Kullanıcı o kanalı şu an izliyorsa unread saymıyoruz
      if (activeChannelId === data.channelId) return
      channelsStore.markChannelUnread(data.channelId, data.guildId)
      guildsStore.incrementGuildUnread(data.guildId)
    })

    // Sprint V2 LiveKit: ses kanalı presence (backend webhook → WS; sözleşme §5)
    socket.on('voice.participant_joined', (data: { channelId: string; participant: VoiceParticipant }) => {
      voiceStore.addParticipant(data.channelId, data.participant)
    })

    socket.on('voice.participant_left', (data: { channelId: string; userId: string }) => {
      voiceStore.removeParticipant(data.channelId, data.userId)
    })

    // Sprint V2 DM sesli arama — sinyalizasyon (gate sunucuda; sözleşme SPRINT_V2_DM_CALL_CONTRACT.md)
    socket.on('voice.incoming_call', (data: IncomingCall) => {
      callStore.setIncoming(data)
    })
    socket.on('voice.call_accepted', (data: { channelId: string }) => {
      // Karşı taraf kabul etti → odaya katıl, çalma durumunu temizle
      callStore.clearOutgoing()
      voiceStore.join(data.channelId)
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
