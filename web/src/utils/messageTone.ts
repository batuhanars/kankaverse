import messageToneUrl from '@/assets/sounds/message_tone.mp3'

/**
 * DM ekranı açıkken karşı taraftan gelen mesajın kısa sesi: mobilin `message_tone.mp3`'ü
 * (kaynak `mesaj-sesi.mp3`, SPRINT_M5F §3). Bildirim sesiyle (`notificationTone.ts`) karıştırma:
 * o, bildirim çıktığında çalar; bu, bildirim ÇIKMADIĞI "sohbete bakıyorum" durumunda çalar.
 *
 * Mobildeki ses düzeyiyle aynı (`MESSAGE_TONE_VOLUME`, mobile/src/audio/messageTone.ts).
 */
const MESSAGE_TONE_VOLUME = 0.8

let el: HTMLAudioElement | null = null

export function playMessageTone() {
  el ??= Object.assign(new Audio(messageToneUrl), { volume: MESSAGE_TONE_VOLUME })
  el.currentTime = 0
  el.play().catch(() => {}) // autoplay reddi: sessiz kal
}
