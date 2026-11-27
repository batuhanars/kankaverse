import { ref } from 'vue'

/**
 * C76 aktif cihaz kuralı, web/masaüstü tarafı.
 *
 * K2: telefonda uygulama ön plandayken sunucu `client:mobile_foreground { active: true }` yollar;
 * o sürece masaüstü/web OS bildirimi ve birlikte çalan ses ÇİZİLMEZ (uygulama içi rozetler değişmez,
 * arama zili/penceresi bu kapıdan GEÇMEZ). Bağlantı kopunca değer false'a döner.
 *
 * K3: çizilen OS bildirimleri kanal kimliğiyle tutulur; `read:self` gelince o kanalınkiler kapatılır.
 */
export const mobileForeground = ref(false)

export function setMobileForeground(active: boolean): void {
  mobileForeground.value = active
}

/** OS bildirimi/sesi şu an susturulmalı mı (telefon ön planda)? Aramalar bu kapıyı kullanmaz. */
export function osNotificationsSuppressed(): boolean {
  return mobileForeground.value
}

const openByChannel = new Map<string, Set<Notification>>()

/** Çizilmiş bir OS bildirimini kanal kimliğiyle izler; kapanınca (kullanıcı ya da sistem) kaydı düşer. */
export function trackOsNotification(
  channelId: string | null | undefined,
  notif: Notification,
): void {
  if (!channelId) return
  let set = openByChannel.get(channelId)
  if (!set) openByChannel.set(channelId, (set = new Set()))
  set.add(notif)
  const forget = () => {
    const s = openByChannel.get(channelId)
    s?.delete(notif)
    if (s && s.size === 0) openByChannel.delete(channelId)
  }
  notif.addEventListener('close', forget)
  notif.addEventListener('click', forget)
}

/**
 * C83 §4: gruplu bildirim tamponu. Sohbet başına son satırlar + toplam sayı. Sohbet okununca
 * (bu cihazda açılınca ya da başka cihazda okundu) temizlenir; böylece eski satırlar yeni bildirime sızmaz.
 */
export interface ToastBuffer {
  lines: string[]
  count: number
  /** Süzgeç içinde gelip henüz çizilmemiş satır var mı. */
  pending: boolean
  timer: ReturnType<typeof setTimeout> | null
}
const toastBuffers = new Map<string, ToastBuffer>()

export function getToastBuffer(channelId: string): ToastBuffer {
  let b = toastBuffers.get(channelId)
  if (!b) toastBuffers.set(channelId, (b = { lines: [], count: 0, pending: false, timer: null }))
  return b
}

export function clearToastBuffer(channelId: string): void {
  const b = toastBuffers.get(channelId)
  if (!b) return
  if (b.timer) clearTimeout(b.timer)
  toastBuffers.delete(channelId)
}

/** C83 Rev.1: kabuk (köprü) bildirimleri kanal kimliğiyle izlenir: kanal -> köprü tag'i. */
const shellTagByChannel = new Map<string, string>()

export function trackShellNotification(channelId: string, tag: string): void {
  shellTagByChannel.set(channelId, tag)
}

/** K3: bu kanala ait açık OS bildirimlerini kapatır (başka cihazda okundu). Yoksa no-op. */
export function closeOsNotificationsForChannel(channelId: string): void {
  clearToastBuffer(channelId)
  const shellTag = shellTagByChannel.get(channelId)
  if (shellTag) {
    shellTagByChannel.delete(channelId)
    window.kankaverse?.closeMessageNotification?.(shellTag)
  }
  const set = openByChannel.get(channelId)
  if (!set) return
  openByChannel.delete(channelId)
  for (const n of set) {
    try {
      n.close()
    } catch {
      /* kapatma başarısızlığı kullanıcıyı ilgilendirmez */
    }
  }
}

export function closeAllOsNotifications(): void {
  for (const id of new Set([...openByChannel.keys(), ...shellTagByChannel.keys()])) {
    closeOsNotificationsForChannel(id)
  }
}
