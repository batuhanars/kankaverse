import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo'
import { attachmentsApi } from '@/api/attachments'
import { useAiVideoForm } from '@/composables/useAiVideoForm'
import { saveFromUrl } from '@/utils/saveFromUrl'

const POLL_MS = 4000
const KNOWN_ERRORS = [
  'AI_VIDEO_DAILY_CAP',
  'AI_VIDEO_INVALID_OPTION',
  'AI_VIDEO_NOT_READY',
  'UPLOADS_DISABLED',
  'AI_VIDEO_PROVIDER_ERROR',
  'AI_VIDEO_CONTENT_REJECTED',
  'AI_VIDEO_INSUFFICIENT_BALANCE',
  'AI_VIDEO_TIMEOUT',
]

/**
 * Yapay zeka video üretim akışı (Sprint C14 §3.1, C14b §3.1): oluştur (tek çağrı) → 4 sn yoklama → sonuç.
 * Yoklama bileşen sökülünce durur. Hata metni koda göre i18n'den, bilinmeyende sunucu mesajından.
 */
export function useAiVideo() {
  const { t } = useI18n()
  const prompt = ref('')
  const image = ref<File | null>(null)
  const withImage = computed(() => !!image.value)
  const form = useAiVideoForm(withImage)
  const job = ref<AiVideoDto | null>(null)
  const recent = ref<AiVideoDto[]>([])
  const busy = ref(false)
  const error = ref('')
  const now = ref(Date.now())
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const working = computed(() => job.value?.status === 'QUEUED' || job.value?.status === 'RUNNING')
  const elapsedSec = computed(() =>
    job.value
      ? Math.max(0, Math.floor((now.value - new Date(job.value.createdAt).getTime()) / 1000))
      : 0,
  )

  function errorText(code: string | null | undefined, fallback?: string): string {
    if (code && KNOWN_ERRORS.includes(code)) return t(`aiVideo.errors.${code}`)
    return fallback || t('aiVideo.errors.generic')
  }

  function fail(e: unknown) {
    const data = (e as { response?: { data?: { error?: string; message?: string } } }).response
      ?.data
    error.value = errorText(data?.error, data?.message)
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer)
    if (tickTimer) clearInterval(tickTimer)
    pollTimer = tickTimer = null
  }

  async function refreshRecent() {
    try {
      recent.value = (await aiVideoApi.list()).data
    } catch {
      /* son üretimler yardımcı bölüm; hata sessiz */
    }
  }

  async function poll() {
    if (!job.value) return
    try {
      job.value = (await aiVideoApi.get(job.value.id)).data
    } catch {
      return // geçici ağ hatası, sonraki turda yeniden dene
    }
    if (!working.value) {
      stop()
      void refreshRecent()
    }
  }

  function track(row: AiVideoDto) {
    stop()
    job.value = row
    if (!working.value) return
    now.value = Date.now()
    tickTimer = setInterval(() => (now.value = Date.now()), 1000)
    pollTimer = setInterval(() => void poll(), POLL_MS)
  }

  async function uploadInput(file: File): Promise<string> {
    const { data } = await aiVideoApi.presignInput(file.type, file.size)
    await attachmentsApi.uploadToS3(data.uploadUrl, file)
    return data.inputKey
  }

  async function submit() {
    error.value = ''
    busy.value = true
    try {
      const inputKey = image.value ? await uploadInput(image.value) : undefined
      const sel = {
        model: form.model.value,
        resolution: form.resolution.value,
        durationS: form.durationS.value,
      }
      track((await aiVideoApi.create(sel, prompt.value, inputKey)).data)
      void form.loadOptions() // bugünkü harcama güncellensin
    } catch (e) {
      fail(e)
    } finally {
      busy.value = false
    }
  }

  /** Bitmiş sonucu (bu oturumdan ya da "Son üretimler"den) diyalogda açar. */
  function open(row: AiVideoDto) {
    error.value = ''
    track(row)
  }

  /** Yeni üretime dön (form + teklif sıfırlanır). */
  function reset() {
    stop()
    job.value = null
    error.value = ''
  }

  /** Presigned adresten videoyu File'a çevirir (sözleşme §3.1). */
  async function toFile(row: AiVideoDto): Promise<File | null> {
    if (!row.videoUrl) return null
    busy.value = true
    error.value = ''
    try {
      const res = await fetch(row.videoUrl)
      if (!res.ok) throw new Error('download')
      const blob = await res.blob()
      return new File([blob], 'ai-video.mp4', { type: 'video/mp4' })
    } catch {
      error.value = t('aiVideo.errors.download')
      return null
    } finally {
      busy.value = false
    }
  }

  /** Kaydet: sunucunun indirme adresi (fetch yok). */
  function save(row: AiVideoDto) {
    if (row.downloadUrl) saveFromUrl(row.downloadUrl)
  }

  /** Kaydet ve gönder: indir + bekleyen ek üret. Dönen kimliği çağıran mevcut mesaj yoluna verir. */
  async function saveAndAttach(row: AiVideoDto): Promise<string | null> {
    busy.value = true
    error.value = ''
    try {
      const { data } = await aiVideoApi.createAttachment(row.id)
      save(row)
      return data.attachmentId
    } catch (e) {
      fail(e)
      return null
    } finally {
      busy.value = false
    }
  }

  void refreshRecent()
  onUnmounted(stop)

  return {
    prompt,
    image,
    form,
    withImage,
    job,
    recent,
    busy,
    error,
    working,
    elapsedSec,
    errorText,
    submit,
    open,
    reset,
    toFile,
    save,
    saveAndAttach,
  }
}
