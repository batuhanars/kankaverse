import { ref, watch } from 'vue'
import { attachmentsApi } from '@/api/attachments'
import { ScanStatus, type ReplyAttachmentDto } from '@/types'

/**
 * Bir ekin küçük önizleme adresi (iletme modalı, yanıt alıntısı, yanıt bandı).
 * Video → mesajdaki base64 kare; görsel → kısa ömürlü adres, YALNIZ tarama CLEAN ise
 * (AttachmentView ile aynı T&S kapısı). Diğer türlerde null: çağıran simge + ad gösterir.
 * Önizleme kozmetik: adres alınamazsa sessizce null kalır.
 */
export function useAttachmentThumb(source: () => ReplyAttachmentDto | null | undefined) {
  const thumb = ref<string | null>(null)

  watch(
    () => source()?.id ?? null,
    (_id, _prev, onCleanup) => {
      thumb.value = null
      const att = source()
      if (!att) return
      if (att.contentType.startsWith('video/')) {
        thumb.value = att.thumbnail ? `data:image/jpeg;base64,${att.thumbnail}` : null
        return
      }
      if (!att.contentType.startsWith('image/') || att.scanStatus !== ScanStatus.CLEAN) return
      let cancelled = false
      onCleanup(() => (cancelled = true))
      attachmentsApi
        .getUrl(att.id)
        .then((res) => {
          if (!cancelled) thumb.value = res.data.url
        })
        .catch(() => {})
    },
    { immediate: true },
  )

  return thumb
}
