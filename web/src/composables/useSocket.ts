import { ref, onUnmounted } from 'vue'
import { io, type Socket } from 'socket.io-client'
import { useMessagesStore } from '@/stores/messages'
import type { MessageDto } from '@/types'

let socket: Socket | null = null
let refCount = 0

export function useSocket() {
  const connected = ref(false)
  const messagesStore = useMessagesStore()

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
      connected.value = false
    }
  }

  function joinChannel(channelId: string): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!socket) return resolve({ ok: false, error: 'NOT_CONNECTED' })
      socket.emit('channel:join', { channelId }, (ack: { ok: boolean; error?: string }) => {
        resolve(ack)
      })
    })
  }

  function leaveChannel(channelId: string) {
    socket?.emit('channel:leave', { channelId })
  }

  onUnmounted(() => {
    // Composable unmount olunca ref sayısını düşür ama hemen disconnect etme
    // (diğer composable örnekleri hâlâ kullanıyor olabilir)
  })

  return { connected, connect, disconnect, joinChannel, leaveChannel }
}
