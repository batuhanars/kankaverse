import { computed, type Ref } from 'vue'
import { useE2eeStore } from '@/stores/e2ee'
import type { MessageDto } from '@/types'

/**
 * E1 §4 — bir DM'in şifreleme görünümü: kilit, uyarı bandı ve "bu noktadan sonra şifreli" ayracının
 * yeri. Ayraç ilk şifreli mesajın önüne konur; ama liste başında (daha eski sayfa yüklenmemişken)
 * konursa yanlış yeri gösterirdi, bu yüzden o durumda çizilmez.
 */
export function useE2eeChannelView(
  channelId: () => string,
  messages: Ref<MessageDto[]>,
  hasMore: Ref<boolean>,
) {
  const store = useE2eeStore()
  const encrypted = computed(() => store.channels[channelId()]?.encrypted === true)
  // Kanala özel uyarı, yoksa cihaz geneli ('' anahtarı: örn. cihaz anahtarı bozuk).
  const warning = computed(() => store.warnings[channelId()] ?? store.warnings[''] ?? null)

  const dividerIndex = computed(() => {
    const list = messages.value
    const i = list.findIndex((m) => m.encrypted)
    if (i === -1) return encrypted.value && list.length > 0 ? list.length : -1 // henüz şifreli mesaj yok
    return i === 0 && hasMore.value ? -1 : i
  })

  return { encrypted, warning, dividerIndex }
}
