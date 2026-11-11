import { ref, watch } from 'vue'
import { useE2eeStore } from '@/stores/e2ee'
import type { DmChannelDto } from '@/types'

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
 * DM listesi önizlemesi (E3 §4.1): şifreli son mesajın düz metni yerel depodan okunur (çözme YOK).
 * İlk boyama beklemez: önce "Şifreli mesaj", okununca metin. Motor hazır olunca ve etkin sohbet
 * değişince (sohbette çözülmüş olabilir) bulunamayanlar yeniden denenir.
 */
export function useEncryptedPreviews(channels: () => DmChannelDto[], trigger: () => unknown) {
  const e2ee = useE2eeStore()
  const previews = ref<Record<string, string>>({})

  async function load(ids: string[]) {
    await Promise.all(
      ids
        .filter((id) => !(id in previews.value))
        .map(async (id) => {
          const text = await e2ee.plainText(id)
          if (text) previews.value[id] = text
        }),
    )
  }

  watch(
    () => [encryptedLastIds(channels()).join(','), e2ee.engine, trigger()],
    () => void load(encryptedLastIds(channels())),
    { immediate: true },
  )

  return { previews }
}
