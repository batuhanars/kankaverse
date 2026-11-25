import notificationUrl from '@/assets/sounds/notification.mp3'

/**
 * Bildirim sesi (C74 §4): mobilin bildirim kanalı sesi `message_channel.wav` (kaynak `bildirim.mp3`),
 * tek atış.
 *
 * 🔴 `message_tone.mp3` ile KARIŞTIRMA: o, mobilde DM ekranı açıkken gelen mesajın kısa sesidir
 * (kaynak `mesaj-sesi.mp3`, bkz. SPRINT_M5F §1). İlk sürümde yanlışlıkla o kullanılmıştı (sahip
 * bulgusu 2026-11-25).
 *
 * Masaüstü toast'ları `silent: true` ile açılır ve sesi bu fonksiyon verir: Windows'un varsayılan
 * sesi yerine mobilde duyulan bildirim sesi çalar. Toast'ın çıktığı her yerde çağrılır, çıkmadığı
 * yerde çağrılmaz (ne zaman bildirilir kuralı toast koşullarında kalır).
 */
let el: HTMLAudioElement | null = null

export function playNotificationTone() {
  el ??= new Audio(notificationUrl)
  el.currentTime = 0 // üst üste gelen iki bildirimde ikincisi baştan çalsın
  el.play().catch(() => {}) // autoplay reddi: sessiz kal
}
