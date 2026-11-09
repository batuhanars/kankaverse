import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * C24 §0.4: "Sık kullanılanlar". Cihazda tutulur (web `localStorage` karşılığı), backend yok.
 *
 * Sıralama sıklık × yakınlık: her kullanım puan +1, okurken puan yaşa göre yarı ömürle sönümlenir
 * (`rn-emoji-keyboard`ın kendi "recent" mekanizması yalnız sıraya göre tutar, sıklığı bilmez; o yüzden
 * küçük yardımcı). Tepki seçici ve mesaj kutusu seçicisi AYNI anahtarı okur/yazar.
 */
const KEY = 'kv_recent_emojis_v1';
/** Seçicide 3 satır (sahip 2026-11-09). */
export const RECENT_EMOJI_LIMIT = 24;
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_STORED = 60;

interface Entry {
  /** Kullanım puanı (sönümlenmiş değil, son yazım anındaki). */
  s: number;
  /** Son kullanım zamanı (ms). */
  t: number;
}
type Store = Record<string, Entry>;

function decayed(e: Entry, now: number): number {
  return e.s * Math.pow(0.5, Math.max(0, now - e.t) / HALF_LIFE_MS);
}

async function read(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    // Bozuk girdiyi at (web getFrequentEmojis ile aynı): sayı olmayan puan/zaman NaN sıralaması doğurur.
    const clean: Store = {};
    for (const [emoji, e] of Object.entries(parsed as Record<string, unknown>)) {
      const v = e as Partial<Entry> | null;
      if (v && Number.isFinite(v.s) && Number.isFinite(v.t)) clean[emoji] = { s: v.s as number, t: v.t as number };
    }
    return clean;
  } catch {
    return {};
  }
}

/** En çok `RECENT_EMOJI_LIMIT` emoji, en yüksek puan önde. Boşsa `[]`. */
export async function loadRecentEmojis(): Promise<string[]> {
  const store = await read();
  const now = Date.now();
  return Object.entries(store)
    .map(([emoji, e]) => [emoji, decayed(e, now)] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECENT_EMOJI_LIMIT)
    .map(([emoji]) => emoji);
}

/** Bir kullanımı kaydet. Hata sessiz: kritik olmayan kolaylık. */
export async function recordEmojiUse(emoji: string): Promise<void> {
  try {
    const store = await read();
    const now = Date.now();
    const prev = store[emoji];
    store[emoji] = { s: (prev ? decayed(prev, now) : 0) + 1, t: now };
    const kept = Object.entries(store)
      .sort((a, b) => decayed(b[1], now) - decayed(a[1], now))
      .slice(0, MAX_STORED);
    await AsyncStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // yut
  }
}
