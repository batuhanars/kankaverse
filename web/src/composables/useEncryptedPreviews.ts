import { ref, watch } from 'vue'
import { useE2eeStore } from '@/stores/e2ee'
import type { DmChannelDto } from '@/types'

/** Arka planda çözülecek en çok sohbet (listenin en üstündekiler; ağ yükü sınırlı kalsın). */
const PREFETCH_LIMIT = 10

/** Önizleme gereken şifreli son mesaj kimlikleri. */
export function encryptedLastIds(channels: DmChannelDto[]): string[] {
  const ids: string[] = []
  for (const ch of channels) {
    const m = ch.lastMessage
    if (m?.encrypted && m.id) ids.push(m.id)
  }
  return ids
}

/**
 * DM listesi önizlemesi (E3 §4.1): şifreli son mesajın düz metni önce yerel depodan okunur.
 * İlk boyama beklemez: önce "Şifreli mesaj", okununca metin. Motor hazır olunca ve etkin sohbet
 * değişince (sohbette çözülmüş olabilir) ya da yeni düz metin yazılınca (`plainTick`) bulunamayanlar yeniden denenir.
 * 2026-11-12: depoda hâlâ yoksa (uygulama kapalıyken gelen mesaj) o sohbet arka planda bir kez çözülür
 * (`prefetchPreview`, sohbet açılışıyla aynı yol). Her son mesaj kimliği için en çok bir deneme.
 */
export function useEncryptedPreviews(channels: () => DmChannelDto[], trigger: () => unknown) {
  const e2ee = useE2eeStore()
  const previews = ref<Record<string, string>>({})
  const prefetched = new Set<string>()

  async function load(list: DmChannelDto[]) {
    const missing: DmChannelDto[] = []
    await Promise.all(
      list
        .filter(
          (ch) =>
            ch.lastMessage?.encrypted &&
            ch.lastMessage.id &&
            !(ch.lastMessage.id in previews.value),
        )
        .map(async (ch) => {
          const id = ch.lastMessage!.id
          const text = await e2ee.plainText(id)
          if (text) previews.value[id] = text
          else missing.push(ch)
        }),
    )
    if (!e2ee.engine) return
    // Depoda olmayanlar: sohbeti arka planda çöz (sırayla). Başarı `plainTick`'i artırır, watch yeniden okur.
    const toFetch = missing
      .filter((ch) => !prefetched.has(ch.lastMessage!.id))
      .slice(0, PREFETCH_LIMIT)
    for (const ch of toFetch) {
      prefetched.add(ch.lastMessage!.id)
      await e2ee.prefetchPreview(ch.id).catch(() => undefined)
    }
  }

  watch(
    () => [encryptedLastIds(channels()).join(','), e2ee.engine, e2ee.plainTick, trigger()],
    () => void load(channels()),
    { immediate: true },
  )

  return { previews }
}
