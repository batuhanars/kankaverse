import incomingCallUrl from '@/assets/sounds/incoming_call.mp3'
import outgoingCallUrl from '@/assets/sounds/outgoing_call.mp3'

/**
 * useCallSounds — çağrı ses efektleri.
 *  • startRingtone/stopRingtone — gelen çağrı zili (mobilin zil dosyası, döngü)
 *  • startRingback/stopRingback — giden çağrı geri-zili (mobilin dosyası, döngü)
 *  • playConnect/playDisconnect/peer/alert — kısa blipler (Web Audio ile sentezlenir, dosyası yok)
 *
 * C74 §4: zil ve geri-zil mobille aynı ses olsun diye dosyaya geçti. İmzalar değişmedi; çağıranlar
 * (IncomingCallModal, useCall) dokunulmadan yeni sesi alır.
 *
 * Modül-seviyesi singleton: hem component'tan hem store'dan çağrılabilir (Vue inject gerektirmez).
 * Tarayıcı autoplay kilidi: ses ilk kullanıcı jestinden sonra açılır; engellenirse sessizce yutulur.
 */

let ctx: AudioContext | null = null

/**
 * Döngüde çalan tek bir ses dosyası. `<audio>` öğesi ilk `start`ta yaratılır (dosya ancak ilk
 * aramada indirilir). `stop` başa sarar: bir sonraki arama zilin başından başlasın.
 */
function loopingSound(src: string) {
  let el: HTMLAudioElement | null = null
  return {
    start() {
      el ??= Object.assign(new Audio(src), { loop: true })
      if (!el.paused) return
      el.play().catch(() => {}) // autoplay reddi: sessiz kal, akışı bozma
    },
    stop() {
      if (!el) return
      el.pause()
      el.currentTime = 0
    },
  }
}

const ringtone = loopingSound(incomingCallUrl)
const ringback = loopingSound(outgoingCallUrl)

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  // Autoplay politikası bağlamı askıya almış olabilir → jest varsa devam ettir
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Tek ton — tıklama (click) sesini önlemek için kısa attack/release zarfıyla. */
function tone(freq: number, startAt: number, dur: number, peak = 0.15) {
  const c = ctx
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  const attack = 0.012
  const release = 0.05
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(peak, startAt + attack)
  gain.gain.setValueAtTime(peak, startAt + Math.max(attack, dur - release))
  gain.gain.linearRampToValueAtTime(0, startAt + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(startAt)
  osc.stop(startAt + dur + 0.02)
}

const startRingtone = () => ringtone.start()
const stopRingtone = () => ringtone.stop()
const startRingback = () => ringback.start()
const stopRingback = () => ringback.stop()

/** Bağlandı: yükselen iki nota. */
function playConnect() {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  tone(660, t, 0.09, 0.16)
  tone(990, t + 0.09, 0.12, 0.16)
}

/** Ayrıldı: alçalan iki nota. */
function playDisconnect() {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  tone(540, t, 0.09, 0.14)
  tone(380, t + 0.09, 0.14, 0.14)
}

/** Başkası kanala girdi: kısık, yumuşak yükselen blip (self-connect'ten daha hafif → ayırt edilir). */
function playPeerJoin() {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  tone(523, t, 0.07, 0.08)
  tone(784, t + 0.07, 0.09, 0.08)
}

/** Başkası kanaldan çıktı: kısık, yumuşak alçalan blip. */
function playPeerLeave() {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  tone(523, t, 0.07, 0.07)
  tone(349, t + 0.07, 0.1, 0.07)
}

/** A4 acil alarm: dikkat çeken üç hızlı yüksek bip (moderatöre acil çağrı geldi). */
function playAlert() {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  tone(880, t, 0.1, 0.2)
  tone(880, t + 0.16, 0.1, 0.2)
  tone(1175, t + 0.32, 0.18, 0.2)
}

export function useCallSounds() {
  return {
    startRingtone,
    stopRingtone,
    startRingback,
    stopRingback,
    playConnect,
    playDisconnect,
    playPeerJoin,
    playPeerLeave,
    playAlert,
  }
}
