import messageToneUrl from '@/assets/sounds/message_tone.mp3'

/**
 * Mesaj bildirim sesi (C74 §4) — mobilin `message_tone` dosyası, tek atış.
 *
 * Masaüstü toast'ları `silent: true` ile açılır ve sesi bu fonksiyon verir: böylece Windows'un
 * varsayılan bildirim sesi yerine mobilde duyulan ses çalar. Toast'ın çıktığı her yerde çağrılır,
 * çıkmadığı yerde çağrılmaz (ne zaman bildirilir kuralı toast koşullarında kalır).
 */
let el: HTMLAudioElement | null = null

export function playMessageTone() {
  el ??= new Audio(messageToneUrl)
  el.currentTime = 0 // üst üste gelen iki mesajda ikincisi baştan çalsın
  el.play().catch(() => {}) // autoplay reddi: sessiz kal
}
