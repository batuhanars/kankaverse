import router from '@/router'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useDmStore } from '@/stores/dm'
import { useChannelsStore } from '@/stores/channels'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { NotificationLevel } from '@/types'

/**
 * Masaüstü (Electron) "yeni mesaj" toast'ları — DM, grup DM ve sunucu kanalları.
 *
 * Kalıcı bildirim sisteminden (notifications store / useNativeNotifications) AYRIDIR:
 * bunlar anlık WS olaylarından (dm.message, channel.activity) doğar, DB'ye yazılmaz.
 *
 * Tetikleme (sahip kararı): pencere arka plandayken VEYA o kanal/DM açık değilken.
 * Kendi mesajın asla toast üretmez. Mute/seviye tercihleri (notificationPrefs) uygulanır.
 * Yalnız Electron'da aktif (tarayıcı Web Notification izin akışı ayrı — kapsam dışı).
 */

// Kanal başına son toast zamanı — hızlı ardışık mesajlarda spam toast'ı engelle.
const lastToastAt = new Map<string, number>()
const THROTTLE_MS = 3000

function isElectron() {
  return window.kankaverse?.isElectron === true
}

// Uygulama ön planda mı (görünür + odakta). Arka planda → her zaman bildir.
function appFocused() {
  return !document.hidden && document.hasFocus()
}

function throttled(channelId: string) {
  const now = Date.now()
  if (now - (lastToastAt.get(channelId) ?? 0) < THROTTLE_MS) return true
  lastToastAt.set(channelId, now)
  return false
}

function fire(title: string, body: string, onClick: () => void, tag: string) {
  // tag: aynı kanaldan ardışık toast görsel olarak üst üste yığılmaz, tekini günceller.
  const notif = new Notification(title, { body, tag })
  notif.onclick = () => {
    window.kankaverse?.focusWindow()
    onClick()
  }
}

/**
 * DM / grup DM mesajı (dm.message WS olayı). isActive: kullanıcı şu an bu DM'i açık tutuyor mu.
 */
export function maybeFireDmToast(
  payload: { channelId: string; lastMessage: { content: string }; senderId: string },
  isActive: boolean,
) {
  if (!isElectron()) return
  const auth = useAuthStore()
  if (payload.senderId === auth.user?.id) return // kendi mesajım
  if (appFocused() && isActive) return // tam bu sohbete bakıyorum

  const prefs = useNotificationPrefsStore()
  if (prefs.isMuted('CHANNEL', payload.channelId)) return
  if (prefs.effectiveLevel('CHANNEL', payload.channelId) === NotificationLevel.NONE) return

  if (throttled(payload.channelId)) return

  const { t } = i18n.global
  const dm = useDmStore()
  const channel = dm.channels.find((c) => c.id === payload.channelId)
  const content = payload.lastMessage.content || t('notification.someone')

  let title: string
  let body: string
  if (channel?.type === 'GROUP_DM') {
    const sender = channel.members.find((m) => m.id === payload.senderId)?.username ?? t('notification.someone')
    title = channel.name ?? t('notification.groupFallback')
    body = t('notification.channelMessage', { actor: sender, text: content })
  } else if (channel?.type === 'DM') {
    title = channel.otherUser.username
    body = content
  } else {
    // Kanal henüz listede yok (yeni DM) — jenerik başlık
    title = t('notification.nativeTitle')
    body = content
  }

  fire(title, body, () => router.push({ name: 'dm', params: { channelId: payload.channelId } }), payload.channelId)
}

/**
 * Sunucu kanalı mesajı (channel.activity zengin payload'ı). author/preview yoksa
 * (alıcı kanalı okuyamıyor → backend çıplak gönderdi) toast atılmaz.
 */
export function maybeFireChannelToast(
  payload: {
    channelId: string
    guildId: string
    authorId: string
    author?: { id: string; username: string }
    preview?: string
  },
  isActive: boolean,
) {
  if (!isElectron()) return
  if (!payload.author || payload.preview === undefined) return // okuma yetkisi yok → çıplak payload
  const auth = useAuthStore()
  if (payload.authorId === auth.user?.id) return
  if (appFocused() && isActive) return

  const prefs = useNotificationPrefsStore()
  if (prefs.isMuted('CHANNEL', payload.channelId)) return
  if (prefs.isMuted('GUILD', payload.guildId)) return
  // Sunucu kanalı: yalnız seviye ALL'da düz mesaj toast'ı (MENTIONS/NONE → bahsetme zaten ayrı).
  if (prefs.effectiveLevel('CHANNEL', payload.channelId, payload.guildId) !== NotificationLevel.ALL) return

  if (throttled(payload.channelId)) return

  const { t } = i18n.global
  const channels = useChannelsStore()
  const ch = channels.findChannelById(payload.channelId)
  const title = `#${ch?.name ?? t('notification.channelFallback')}`
  const body = t('notification.channelMessage', { actor: payload.author.username, text: payload.preview })

  fire(
    title,
    body,
    () => router.push({ name: 'channel', params: { guildId: payload.guildId, channelId: payload.channelId } }),
    payload.channelId,
  )
}
