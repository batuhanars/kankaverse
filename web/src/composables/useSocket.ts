import { ref, onUnmounted } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { useMessagesStore } from '@/stores/messages'
import type { MessageDto } from '@/types'

let socket: Socket | null = null
let refCount = 0
// Reconnect sonrası yeniden join için aktif kanalı modül seviyesinde sakla
let activeChannelId: string | null = null

export function useSocket() {
  const connected = ref(false)
  const messagesStore = useMessagesStore()

  function _joinRoom(channelId: string) {
    socket?.emit('channel:join', { channelId }, (_ack: unknown) => {})
  }

  function connect(accessToken: string) {
    if (socket?.connected) {
      connected.value = true
      refCount++
      return
    }

    socket = io('/', {
      auth: { token: accessToken },
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

    socket.on('message.created', (message: MessageDto) => {
      messagesStore.appendMessage(message)
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
      socket.emit('channel:join', { channelId }, (ack: { ok: boolean; error?: string }) => {
        resolve(ack)
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
