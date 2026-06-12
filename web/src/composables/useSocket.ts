import { ref, onUnmounted } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { useMessagesStore } from '@/stores/messages'
import { useFriendsStore } from '@/stores/friends'
import { getAccessToken } from '@/api/axios'
import type { MessageDto, FriendRequestDto, FriendDto } from '@/types'

let socket: Socket | null = null
let refCount = 0
// Reconnect sonrası yeniden join için aktif kanalı modül seviyesinde sakla
let activeChannelId: string | null = null

export function useSocket() {
  const connected = ref(false)
  const messagesStore = useMessagesStore()
  const friendsStore = useFriendsStore()

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
    })

    socket.on('friend.request', (request: FriendRequestDto) => {
      friendsStore.wsAddIncomingRequest(request)
    })

    socket.on('friend.accept', (friend: FriendDto) => {
      friendsStore.wsHandleAccepted(friend)
    })

    socket.on('friend.remove', (data: { userId: string }) => {
      friendsStore.wsHandleRemoved(data.userId)
    })

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
  }

  onUnmounted(() => {
    // intentionally empty — disconnect AppView'dan yönetiliyor
  })

  return { connected, connect, disconnect, joinChannel, leaveChannel }
}
