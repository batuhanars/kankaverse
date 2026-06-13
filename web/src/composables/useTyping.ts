import { ref, computed } from 'vue'

// Modül-seviyesi state: channelId → { userId, username, timer }
interface TypingUser {
  userId: string
  username: string
  timer: ReturnType<typeof setTimeout>
}

const typingByChannel = ref<Record<string, TypingUser[]>>({})

// Tek socket referansı — useSocket'ten bağlanır
let _emitTypingStart: ((channelId: string) => void) | null = null
let _emitTypingStop: ((channelId: string) => void) | null = null

/** useSocket tarafından bir kez çağrılır; emit fonksiyonlarını bağlar. */
export function _bindTypingEmitters(
  start: (channelId: string) => void,
  stop: (channelId: string) => void,
) {
  _emitTypingStart = start
  _emitTypingStop = stop
}

/** `typing:update` / `typing:clear` geldiğinde useSocket çağırır. */
export function handleTypingUpdate(userId: string, username: string, channelId: string) {
  if (!typingByChannel.value[channelId]) {
    typingByChannel.value[channelId] = []
  }
  const list = typingByChannel.value[channelId]
  const existing = list.find((u) => u.userId === userId)

  if (existing) {
    clearTimeout(existing.timer)
    existing.timer = setTimeout(() => clearTypingUser(userId, channelId), 5000)
  } else {
    const timer = setTimeout(() => clearTypingUser(userId, channelId), 5000)
    list.push({ userId, username, timer })
  }
}

export function handleTypingClear(userId: string, channelId: string) {
  clearTypingUser(userId, channelId)
}

/** Bir kanal için tüm yazıyor durumlarını sil (kanal değişince). */
export function clearTypingForChannel(channelId: string) {
  const list = typingByChannel.value[channelId]
  if (list) {
    list.forEach((u) => clearTimeout(u.timer))
    delete typingByChannel.value[channelId]
  }
}

function clearTypingUser(userId: string, channelId: string) {
  const list = typingByChannel.value[channelId]
  if (!list) return
  const idx = list.findIndex((u) => u.userId === userId)
  if (idx !== -1) {
    clearTimeout(list[idx].timer)
    list.splice(idx, 1)
  }
  if (list.length === 0) {
    delete typingByChannel.value[channelId]
  }
}

/**
 * Belirli bir kanal için yazıyor composable'ı.
 * Her input bileşeninde çağrılır.
 */
export function useTyping(getChannelId: () => string | null | undefined) {
  // Yazıyor durumu aktif mi (stop zaten gönderildi mi)
  let typing = false
  // ~3sn'de bir typing:start yenileme için zamanlayıcı
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      const channelId = getChannelId()
      if (typing && channelId && _emitTypingStart) {
        _emitTypingStart(channelId)
      }
      scheduleRefresh()
    }, 3000)
  }

  function cancelRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function onInput() {
    const channelId = getChannelId()
    if (!channelId || !_emitTypingStart) return
    if (!typing) {
      // İlk tuşta hemen emit
      typing = true
      _emitTypingStart(channelId)
      scheduleRefresh()
    }
    // Eğer zaten yazıyorsa — refresh timer zaten çalışıyor, bir şey yapmaya gerek yok
  }

  function stopTyping() {
    const channelId = getChannelId()
    if (!typing) return
    typing = false
    cancelRefresh()
    if (channelId && _emitTypingStop) {
      _emitTypingStop(channelId)
    }
  }

  // Belirtilen kanal için yazıyor kullanıcılarını döner
  function typingUsersForChannel(channelId: string | null | undefined) {
    if (!channelId) return []
    return typingByChannel.value[channelId] ?? []
  }

  return { onInput, stopTyping, typingUsersForChannel, typingByChannel }
}

/**
 * Yazıyor metni oluşturur (i18n key'lerini dışarıdan alır).
 * opts.named = false → isim/sayı kullanılmaz, her zaman t('typing.simple') döner (DM modu).
 * opts.named = true (varsayılan) → guild davranışı: isimli etiketler.
 * Dönen değer: null | string
 */
export function useTypingLabel(
  getChannelId: () => string | null | undefined,
  t: (key: string, params?: Record<string, string>) => string,
  opts?: { named?: boolean },
) {
  const named = opts?.named !== false // varsayılan true
  const label = computed(() => {
    const channelId = getChannelId()
    if (!channelId) return null
    const users = typingByChannel.value[channelId] ?? []
    if (users.length === 0) return null
    if (!named) return t('typing.simple')
    if (users.length === 1) return t('typing.one', { user: users[0].username })
    if (users.length === 2) return t('typing.two', { user1: users[0].username, user2: users[1].username })
    return t('typing.many')
  })
  return { label }
}
