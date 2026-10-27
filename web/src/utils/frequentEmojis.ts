/**
 * Sık kullanılan emojiler (C24 §0.4): cihazda (localStorage) tutulur, backend yok.
 * Puan = sıklık × yakınlık: her kullanımda eski puan yaşa göre sönümlenir, +1 eklenir.
 * Mesaj kutusu seçicisi ve tepki seçicisi (EmojiPicker) aynı yardımcıyı okur/yazar.
 */

const STORAGE_KEY = 'kv.frequentEmojis'
const MAX_SHOWN = 16 // seçicide en fazla ~iki satır
const MAX_STORED = 48 // depoyu şişirmeme; en düşük puanlılar atılır
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000 // 14 günde puan yarıya iner

interface Entry {
  s: number // son güncellemedeki puan
  t: number // son kullanım zamanı (ms)
}

type Store = Record<string, Entry>

function decayed(entry: Entry, now: number): number {
  return entry.s * Math.pow(0.5, Math.max(0, now - entry.t) / HALF_LIFE_MS)
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

/** Bir emoji kullanıldığında çağrılır (mesaja eklendi veya tepki verildi). */
export function recordEmojiUse(emoji: string): void {
  if (!emoji) return
  try {
    const now = Date.now()
    const store = load()
    const prev = store[emoji]
    store[emoji] = { s: (prev ? decayed(prev, now) : 0) + 1, t: now }
    const keys = Object.keys(store)
    if (keys.length > MAX_STORED) {
      keys
        .sort((a, b) => decayed(store[a], now) - decayed(store[b], now))
        .slice(0, keys.length - MAX_STORED)
        .forEach((k) => delete store[k])
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // depo kapalı/dolu: sık kullanılanlar sessizce devre dışı kalır
  }
}

/** Puana göre sıralı emoji listesi (boşsa []). */
export function getFrequentEmojis(limit = MAX_SHOWN): string[] {
  const now = Date.now()
  const store = load()
  return Object.keys(store)
    .filter((k) => store[k] && typeof store[k].s === 'number' && typeof store[k].t === 'number')
    .sort((a, b) => decayed(store[b], now) - decayed(store[a], now))
    .slice(0, limit)
}
