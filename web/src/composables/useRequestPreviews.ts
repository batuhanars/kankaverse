import { ref, watch } from 'vue'
import { isBeforeDevice } from '@kankaverse/e2ee-client'
import { useE2eeStore } from '@/stores/e2ee'
import type { MessageRequestDto } from '@/types'

/** Arka planda çözülecek en çok istek (liste kısa kalır; ağ yükü sınırlı). */
const PREFETCH_LIMIT = 10

/**
 * C75 §3.3 — Mesaj İstekleri ekranında şifreli ilk mesajı çözer. DM listesi önizlemesiyle (`useEncryptedPreviews`)
 * aynı yol: `prefetchPreview` (Welcome → son sayfa → MLS çözme). İstek DTO'su mesaj kimliği taşımadığı için
 * kanal kimliğiyle çalışır; sonuç kanal başına bir kez denenir. Çözme yereldir: okundu bilgisi gitmez, kabul sayılmaz.
 *
 * `textOf(req)`: şifresiz istekte sunucunun önizlemesi; şifreliyse çözülen düz metin, gövde boşsa (yalnız ek)
 * sunucunun tür etiketi ("📷 Görsel"), çözülemediyse `fallback` ("🔒 Şifreli mesaj"). Boş balon çıkmaz.
 */
export function useRequestPreviews(requests: () => MessageRequestDto[], fallback: () => string) {
  const e2ee = useE2eeStore()
  /** kanal kimliği → çözülen düz metin ('' = çözüldü ama gövde boş; yok = çözülemedi/henüz yok) */
  const plain = ref<Record<string, string>>({})
  const tried = new Set<string>()

  async function load(list: MessageRequestDto[]) {
    if (!e2ee.engine) return // motor hazır olunca watch yeniden dener (engine bağımlılığı)
    const todo = list.filter((r) => r.encrypted && !tried.has(r.channelId)).slice(0, PREFETCH_LIMIT)
    for (const r of todo) {
      const out = (await e2ee.prefetchPreview(r.channelId).catch(() => [])) ?? []
      const first = out.find((m) => m.e2eeStatus === 'ok' && !isBeforeDevice(m))
      if (first) {
        plain.value[r.channelId] = first.content ?? ''
        tried.add(r.channelId) // çözülemeyen (Welcome henüz gelmedi) bir sonraki tetiklemede yeniden denenir
      }
    }
  }

  watch(
    () => [
      requests()
        .map((r) => r.channelId)
        .join(','),
      e2ee.engine,
    ],
    () => void load(requests()),
    { immediate: true },
  )

  function textOf(r: MessageRequestDto): string {
    if (!r.encrypted) return r.preview
    const text = plain.value[r.channelId]
    if (text === undefined) return fallback()
    return text.trim() ? text : r.preview || fallback()
  }

  return { textOf }
}
