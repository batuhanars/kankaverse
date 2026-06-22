/**
 * useCallSounds — çağrı ses efektleri (Web Audio ile sentezlenir; ses DOSYASI gerekmez).
 *  • startRingtone/stopRingtone — gelen çağrı zili (çift-zil, loop)
 *  • startRingback/stopRingback — giden çağrı geri-zili (tek ton, loop)
 *  • playConnect/playDisconnect — bağlanma/ayrılma blipleri (tek atış)
 *
 * Modül-seviyesi singleton: hem component'tan hem store'dan çağrılabilir (Vue inject gerektirmez).
 * Tarayıcı autoplay kilidi: ses ilk kullanıcı jestinden sonra açılır; engellenirse sessizce yutulur.
 */

let ctx: AudioContext | null = null
let ringTimer: ReturnType<typeof setInterval> | null = null // gelen zil döngüsü
let ringbackTimer: ReturnType<typeof setInterval> | null = null // giden geri-zil döngüsü

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
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

/** İki frekans arası hızlı geçiş → klasik telefon zili "brrr" hissi. */
function warble(start: number, dur: number) {
  const step = 0.05
  let high = true
  for (let o = 0; o < dur - 1e-6; o += step) {
    tone(high ? 620 : 480, start + o, step, 0.18)
    high = !high
  }
}

/** Gelen çağrı: çift-zil (0.4s + ara + 0.4s), 3 sn'de bir tekrar. */
function ringCycle() {
  const c = audioCtx()
  if (!c) return
  const t = c.currentTime
  warble(t, 0.4)
  warble(t + 0.6, 0.4)
}

function startRingtone() {
  if (ringTimer) return
  ringCycle()
  ringTimer = setInterval(ringCycle, 3000)
}

function stopRingtone() {
  if (ringTimer) {
    clearInterval(ringTimer)
    ringTimer = null
  }
}

/** Giden çağrı: tek 425Hz ton 1 sn, 4 sn'de bir tekrar (geri-zil). */
function ringbackCycle() {
  const c = audioCtx()
  if (!c) return
  tone(425, c.currentTime, 1.0, 0.1)
}

function startRingback() {
  if (ringbackTimer) return
  ringbackCycle()
  ringbackTimer = setInterval(ringbackCycle, 4000)
}

function stopRingback() {
  if (ringbackTimer) {
    clearInterval(ringbackTimer)
    ringbackTimer = null
  }
}

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

export function useCallSounds() {
  return { startRingtone, stopRingtone, startRingback, stopRingback, playConnect, playDisconnect }
}
