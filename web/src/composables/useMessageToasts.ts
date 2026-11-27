import router from '@/router'
import { i18n } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useDmStore } from '@/stores/dm'
import { useChannelsStore } from '@/stores/channels'
import { useNotificationPrefsStore } from '@/stores/notificationPrefs'
import { NotificationLevel } from '@/types'
import { playNotificationTone } from '@/utils/notificationTone'
import {
  osNotificationsSuppressed,
  trackOsNotification,
  getToastBuffer,
  clearToastBuffer,
  trackShellNotification,
} from '@/utils/activeDevice'

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

const BUFFER_LINES = 3

/**
 * C83 §4: süzgeç mesaj DÜŞÜRMEZ. Satır tampona girer; süzgeç dışındaysa hemen, içindeyse süzgeç
 * bitince tek bildirim çizilir. Bildirim gövdesi son 3 satır, 2+ mesajda başlık "{ad} ({n} mesaj)".
 */
function enqueue(
  channelId: string,
  shellTag: string,
  title: string,
  line: string,
  onClick: () => void,
) {
  if (osNotificationsSuppressed()) return // C76 K2: telefon ön planda → tampona da girmez
  const buf = getToastBuffer(channelId)
  buf.lines.push(line)
  if (buf.lines.length > BUFFER_LINES) buf.lines.shift()
  buf.count++

  const render = () => {
    buf.pending = false
    buf.timer = null
    lastToastAt.set(channelId, Date.now())
    const { t } = i18n.global
    const shownTitle =
      buf.count > 1 ? t('notification.groupedTitle', { name: title, n: buf.count }) : title
    fire(shownTitle, buf.lines.join('\n'), onClick, channelId, shellTag)
  }

  const wait = THROTTLE_MS - (Date.now() - (lastToastAt.get(channelId) ?? 0))
  if (wait <= 0) {
    render()
    return
  }
  buf.pending = true
  if (buf.timer) clearTimeout(buf.timer) // en güncel başlık/tıklama ile çiz
  buf.timer = setTimeout(render, wait)
}

/** C83 Rev.1: başlık, hata sonrası yeniden çizim için tag başına saklanır. */
const shellTitles = new Map<string, string>()

function drawShellNotification(tag: string, title: string, body: string): boolean {
  const bridge = window.kankaverse
  if (!bridge?.showMessageNotification) return false
  const { t } = i18n.global
  bridge.showMessageNotification({
    tag,
    title,
    body,
    replyPlaceholder: t('notification.replyPlaceholder'),
    readLabel: t('notification.markRead'),
    sendLabel: t('notification.replySend'),
  })
  shellTitles.set(tag, title)
  return true
}

/** Cevap gönderilemedi: aynı başlıkla, yazılan metni gövdede tutarak kabuk bildirimini yeniden çizer. */
export function redrawShellNotificationFailed(tag: string, text: string): void {
  const { t } = i18n.global
  drawShellNotification(
    tag,
    shellTitles.get(tag) ?? t('notification.nativeTitle'),
    t('notification.replyFailed', { text }),
  )
}

function fire(title: string, body: string, onClick: () => void, tag: string, shellTag: string) {
  // tag: aynı kanaldan ardışık toast görsel olarak üst üste yığılmaz, tekini günceller.
  // C74 §4: silent → Windows sesi yerine mobilin bildirim sesi.
  if (osNotificationsSuppressed()) return // C76 K2: telefon ön planda → OS bildirimi + ses yok
  // C83 Rev.1: köprü varsa kabuk bildirimi (olaylar useMessageNotificationEvents'te); yoksa bugünkü yol.
  if (drawShellNotification(shellTag, title, body)) {
    trackShellNotification(tag, shellTag)
    playNotificationTone()
    return
  }
  const notif = new Notification(title, { body, tag, silent: true })
  trackOsNotification(tag, notif) // tag = kanal kimliği (C76 K3)
  playNotificationTone()
  notif.onclick = () => {
    window.kankaverse?.focusWindow()
    clearToastBuffer(tag)
    onClick()
  }
}

/**
 * DM / grup DM mesajı (dm.message WS olayı). isActive: kullanıcı şu an bu DM'i açık tutuyor mu.
 */
export function maybeFireDmToast(
  payload: {
    channelId: string
    lastMessage: { content: string; encrypted?: boolean }
    senderId: string
  },
  isActive: boolean,
  /** E3 Rev.5: şifreli mesajın çözülmüş düz metni (verilmezse genel metin). */
  decryptedText?: string,
) {
  if (!isElectron()) return
  const auth = useAuthStore()
  if (payload.senderId === auth.user?.id) return // kendi mesajım
  if (appFocused() && isActive) {
    clearToastBuffer(payload.channelId) // tam bu sohbete bakıyorum: birikmiş satırlar okundu sayılır
    return
  }

  const prefs = useNotificationPrefsStore()
  if (prefs.isMuted('CHANNEL', payload.channelId)) return
  if (prefs.effectiveLevel('CHANNEL', payload.channelId) === NotificationLevel.NONE) return

  const { t } = i18n.global
  const dm = useDmStore()
  const channel = dm.channels.find((c) => c.id === payload.channelId)
  // Şifreli DM'de sunucu içerik taşımaz: çözülmüş metin varsa o, yoksa genel "🔒 Şifreli mesaj".
  const content = payload.lastMessage.encrypted
    ? (decryptedText ?? (payload.lastMessage.content?.trim() || t('e2ee.preview')))
    : payload.lastMessage.content || t('notification.someone')

  let title: string
  let body: string
  if (channel?.type === 'GROUP_DM') {
    const sender =
      channel.members.find((m) => m.id === payload.senderId)?.username ?? t('notification.someone')
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

  enqueue(
    payload.channelId,
    `dm:${payload.channelId}`,
    title,
    body,
    () => void router.push({ name: 'dm', params: { channelId: payload.channelId } }),
  )
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
  if (appFocused() && isActive) {
    clearToastBuffer(payload.channelId)
    return
  }

  const prefs = useNotificationPrefsStore()
  if (prefs.isMuted('CHANNEL', payload.channelId)) return
  if (prefs.isMuted('GUILD', payload.guildId)) return
  // Sunucu kanalı: yalnız seviye ALL'da düz mesaj toast'ı (MENTIONS/NONE → bahsetme zaten ayrı).
  if (prefs.effectiveLevel('CHANNEL', payload.channelId, payload.guildId) !== NotificationLevel.ALL)
    return

  const { t } = i18n.global
  const channels = useChannelsStore()
  const ch = channels.findChannelById(payload.channelId)
  const title = `#${ch?.name ?? t('notification.channelFallback')}`
  const body = t('notification.channelMessage', {
    actor: payload.author.username,
    text: payload.preview,
  })

  enqueue(
    payload.channelId,
    `ch:${payload.guildId}:${payload.channelId}`,
    title,
    body,
    () =>
      void router.push({
        name: 'channel',
        params: { guildId: payload.guildId, channelId: payload.channelId },
      }),
  )
}
