import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { aiVideoApi, type AiVideoDto, type AiVideoQuoteDto } from '@/api/aiVideo'
import { attachmentsApi } from '@/api/attachments'

const POLL_MS = 4000
const KNOWN_ERRORS = [
  'AI_VIDEO_DAILY_CAP',
  'AI_VIDEO_QUOTE_EXPIRED',
  'AI_VIDEO_PROVIDER_ERROR',
  'AI_VIDEO_CONTENT_REJECTED',
  'AI_VIDEO_INSUFFICIENT_BALANCE',
  'AI_VIDEO_TIMEOUT',
]

/**
 * Yapay zeka video üretim akışı (Sprint C14 §3.1): teklif → onay → 4 sn yoklama → sonuç.
 * Yoklama bileşen sökülünce durur. Hata metni koda göre i18n'den, bilinmeyende sunucu mesajından.
 */
export function useAiVideo() {
  const { t } = useI18n()
  const prompt = ref('')
  const image = ref<File | null>(null)
  const quote = ref<AiVideoQuoteDto | null>(null)
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

  async function getQuote() {
    error.value = ''
    busy.value = true
    try {
      const inputKey = image.value ? await uploadInput(image.value) : undefined
      quote.value = (await aiVideoApi.quote(prompt.value, inputKey)).data
    } catch (e) {
      fail(e)
    } finally {
      busy.value = false
    }
  }

  async function submit() {
    if (!quote.value) return
    error.value = ''
    busy.value = true
    try {
      track((await aiVideoApi.submit(quote.value.generationId)).data)
    } catch (e) {
      fail(e)
      quote.value = null // süresi dolmuş ya da tavan: yeniden teklif al
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
    quote.value = null
    error.value = ''
  }

  /** Presigned adresten videoyu File'a çevirir (sözleşme §3.1). */
  async function toFile(): Promise<File | null> {
    if (!job.value?.videoUrl) return null
    busy.value = true
    error.value = ''
    try {
      const res = await fetch(job.value.videoUrl)
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

  void refreshRecent()
  onUnmounted(stop)

  return {
    prompt,
    image,
    quote,
    job,
    recent,
    busy,
    error,
    working,
    elapsedSec,
    errorText,
    getQuote,
    submit,
    open,
    reset,
    toFile,
  }
}
