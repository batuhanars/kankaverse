// Yerel mesajların sunucuda hâlâ var olup olmadığı (E5a Rev.2 §4.7). Silinmiş mesaj geçmişte dönmediği için
// çevrimdışıyken silinenler yalnız bu soruyla yakalanır: görüntüye ve geri yüklemeye girmemeli (kurul k.4).
import { e2eeErrorCode } from './errors'
import type { E2eeApi } from './ports'

/** Tek çağrıdaki en çok kimlik (sunucu sınırı). */
export const EXISTS_BATCH = 500

const status = (e: unknown) => (e as { response?: { status?: number } }).response?.status

/**
 * Sunucuda OLMAYAN (silinmiş ya da kanala ait olmayan) mesaj kimliklerini döner. Kanal başına 500'lük gruplar.
 * `skipNoAccess`: çağıran artık erişemediği kanal (403/404) o kanalın kimliklerini "var" sayıp atlar; varlık
 * doğrulanamaz ama yedek bu yüzden sonsuza dek takılmasın. Diğer hatalar (ağ, 5xx, hız sınırı) FIRLATILIR:
 * eksik kontrolle yedek yüklenmez, eksik kontrolle geri yükleme yazılmaz.
 */
export async function missingIds(
  api: E2eeApi,
  items: { id: string; channelId: string }[],
  skipNoAccess: boolean,
): Promise<Set<string>> {
  const byChannel = new Map<string, string[]>()
  for (const { id, channelId } of items) byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), id])

  const missing = new Set<string>()
  for (const [channelId, ids] of byChannel) {
    try {
      for (let i = 0; i < ids.length; i += EXISTS_BATCH) {
        const batch = ids.slice(i, i + EXISTS_BATCH)
        const { data } = await api.messagesExist(channelId, batch)
        const existing = new Set(data.existing)
        for (const id of batch) if (!existing.has(id)) missing.add(id)
      }
    } catch (e) {
      const s = status(e)
      if (skipNoAccess && (s === 403 || s === 404) && e2eeErrorCode(e) !== 'E2EE_DISABLED') {
        for (const id of ids) missing.delete(id) // o kanaldan kısmen eklenenler de geri alınır: karar bütün kanal için
        continue
      }
      throw e
    }
  }
  return missing
}
