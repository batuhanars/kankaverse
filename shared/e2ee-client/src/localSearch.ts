// E7 Parça B (§5, Rev.3 §5.4): şifreli grup DM'de yerel arama. Sunucu şifreli mesajı aramaz; bu cihazda çözülmüş
// (`ok`) kayıtlar burada taranır. Kalıcı düz indeks YAZILMAZ: her sorgu depoyu baştan okur (§5.3 "önce düz tarama").
// Kayıtta yazan ve zaman yok; eşleşenler sunucunun `exists?meta` ucuyla zenginleşir, silinmiş/temizlenmiş olan düşer.
import type { E2eeContext } from './context'
import type { E2eeApi, ExistingMeta } from './ports'
import type { StoredMessage } from './localStore'

/** Sunucu aramasıyla aynı: en az 2 karakter, en çok 100 (fazlası kesilir), en çok 50 sonuç. */
export const SEARCH_MIN_CHARS = 2
export const SEARCH_MAX_CHARS = 100
export const SEARCH_LIMIT = 50
/** Zenginleştirme: `exists` çağrısı başına 500 kimlik, en çok 4 çağrı (§5.4). */
const META_BATCH = 500
const META_MAX_BATCHES = 4

export interface LocalSearchHit {
  id: string
  /** Kaydın düz metni (bahsetme belirteçleri ham; çağıran ekranda düz metne çevirir). */
  body: string
  createdAt: string
  author: ExistingMeta['author']
}

/**
 * Türkçe büyük/küçük harf eşlemesi (İ→i, I→ı): sunucunun "büyük/küçük harf duyarsız" eşlemesinin yerel karşılığı.
 * `toLocaleLowerCase('tr')` ile aynı sonuç, ama Hermes'te o çağrı kayıt başına ~2 ms (10 bin kayıtta 21 sn,
 * Note 10S ölçümü 2026-11-23); önce iki Türkçe harf elle çevrilir, kalanı yerel ayarsız `toLowerCase`.
 */
export const normalizeQuery = (s: string): string => s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()

/** Sorgu aranabilir mi (kırpılmış, en az 2 karakter). */
export const searchable = (q: string): boolean => q.trim().length >= SEARCH_MIN_CHARS

/**
 * Kanalın aranabilir kayıtları: yalnız `ok`. Diğer durumlar (`unverified`, `failed`, `undecryptable`,
 * `unsupported`) aranmaz. Kilit içinde çağrılır; depo toplu okuma veriyorsa tek sorgu (§5.3 ölçümü).
 */
export async function channelRecords(ctx: E2eeContext, channelId: string): Promise<StoredMessage[]> {
  const all = await ctx.store.allMessages(ctx.yieldToUi)
  return all.filter((r) => r.channelId === channelId && r.status === 'ok')
}

/** Eşleşen kayıtlar. `plain`: gövdeyi aramadan önce ekrandaki düz metne çevirir (bahsetme belirteci → @ad). */
export function matchRecords(
  records: StoredMessage[],
  query: string,
  plain: (body: string) => string = (b) => b,
): StoredMessage[] {
  const needle = normalizeQuery(query.trim().slice(0, SEARCH_MAX_CHARS))
  return records.filter((r) => normalizeQuery(plain(r.body)).includes(needle))
}

/**
 * Eşleşmelere yazan + zaman ekler; sunucuda olmayanlar (silinmiş, temizlenmiş) düşer. Zamana göre yeniden eskiye,
 * ilk 50. Ağ kilit DIŞINDA. Hata fırlar: çağıran (arama kutusu) yalnız sunucu sonucunu gösterir.
 */
export async function enrichHits(api: E2eeApi, channelId: string, hits: StoredMessage[]): Promise<LocalSearchHit[]> {
  const out: LocalSearchHit[] = []
  const capped = hits.slice(0, META_BATCH * META_MAX_BATCHES)
  for (let i = 0; i < capped.length; i += META_BATCH) {
    const batch = capped.slice(i, i + META_BATCH)
    const { data } = await api.messagesExist(
      channelId,
      batch.map((h) => h.id),
      true,
    )
    const meta = new Map((data.meta ?? []).map((m) => [m.id, m]))
    for (const h of batch) {
      const m = meta.get(h.id)
      if (m) out.push({ id: h.id, body: h.body, createdAt: m.createdAt, author: m.author })
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, SEARCH_LIMIT)
}

/**
 * Sunucu sonucu ∪ yerel sonuç (§5.1): `id` ile tekilleşir (aynı mesaj iki yerde varsa sunucununki kalır),
 * zamana göre yeniden eskiye, ilk 50. `toItem` yerel sonucu çağıranın satır tipine çevirir.
 */
export function mergeResults<T extends { id: string; createdAt: string }>(
  server: T[],
  local: LocalSearchHit[],
  toItem: (hit: LocalSearchHit) => T,
): T[] {
  const seen = new Set(server.map((m) => m.id))
  const merged = [...server, ...local.filter((h) => !seen.has(h.id)).map(toItem)]
  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, SEARCH_LIMIT)
}
