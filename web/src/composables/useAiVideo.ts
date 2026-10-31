import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useAiVideoForm } from '@/composables/useAiVideoForm'
import { useAiVideoRefs } from '@/composables/useAiVideoRefs'
import { saveFromUrl } from '@/utils/saveFromUrl'

const POLL_MS = 4000
const KNOWN_ERRORS = [
  'AI_VIDEO_DAILY_CAP',
  'AI_VIDEO_BUDGET_EXCEEDED',
  'AI_VIDEO_IN_PROGRESS',
  'AI_VIDEO_INVALID_OPTION',
  'AI_VIDEO_NOT_READY',
  'UPLOADS_DISABLED',
  'AI_VIDEO_PROVIDER_ERROR',
  'AI_VIDEO_CONTENT_REJECTED',
  'AI_VIDEO_INSUFFICIENT_BALANCE',
  'AI_VIDEO_TIMEOUT',
  'AI_VIDEO_DOWNLOAD_FAILED',
  'AI_VIDEO_BUSY',
  'AI_VIDEO_INPUT_TOO_LONG',
  'AI_VIDEO_PROMPT_REQUIRED',
]
const DOWNLOAD_PENDING = 'AI_VIDEO_DOWNLOAD_PENDING' // iç işaret: RUNNING satırda video kaydediliyor

/**
 * Yapay zeka video üretim akışı (Sprint C14 §3.1, C14b §3.1): oluştur (tek çağrı) → 4 sn yoklama → sonuç.
 * Yoklama bileşen sökülünce durur. Hata metni koda göre i18n'den, bilinmeyende sunucu mesajından.
 */
export function useAiVideo() {
  const { t } = useI18n()
  const prompt = ref('')
  const error = ref('')
  // C33: pasif tanıtım. Kilitliyken yalnız options çağrılır; estimate, geçmiş, yükleme atılmaz.
  const authStore = useAuthStore()
  const locked = authStore.user?.aiVideoAllowed !== true
  // C42: ekler (görsel + video + ses). Sınırlar seçili modelin `references` bilgisinden; form daha sonra kurulur (tembel okuma).
  const refs = useAiVideoRefs(
    () => form.current.value?.references,
    prompt,
    (m) => (error.value = m),
  )
  const withImage = refs.singleImage
  const referenceKinds = computed(() => (refs.referenceMode.value ? refs.kinds.value : null))
  const form = useAiVideoForm(withImage, referenceKinds, locked)
  const job = ref<AiVideoDto | null>(null)
  const recent = ref<AiVideoDto[]>([])
  const busy = ref(false)
  const now = ref(Date.now())
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null

  const working = computed(() => job.value?.status === 'QUEUED' || job.value?.status === 'RUNNING')
  // C43: kişi başı tek eşzamanlı üretim; sunucu yine 409 verir, bu yalnız erken uyarı.
  const inProgress = computed(
    () =>
      working.value || recent.value.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING'),
  )
  const saving = computed(() => job.value?.errorCode === DOWNLOAD_PENDING)
  const elapsedSec = computed(() =>
    job.value
      ? Math.max(0, Math.floor((now.value - new Date(job.value.createdAt).getTime()) / 1000))
      : 0,
  )

  function errorText(code: string | null | undefined, fallback?: string): string {
    if (code && KNOWN_ERRORS.includes(code)) return t(`aiVideo.errors.${code}`)
    return fallback || t('aiVideo.errors.generic')
  }

  /** C40: kredi/süre bitmiş olabilir; kullanıcıyı yenile ki bir sonraki açılışta kilitli mod doğru gelsin. */
  async function refreshAccess() {
    try {
      authStore.updateUser((await authApi.me()).data)
    } catch {
      /* geçici hata: bir sonraki yenilemede düzelir */
    }
  }

  function fail(e: unknown) {
    const data = (e as { response?: { data?: { error?: string; message?: string } } }).response
      ?.data
    error.value = errorText(data?.error, data?.message)
    if (data?.error === 'AI_VIDEO_BUDGET_EXCEEDED') void refreshAccess()
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer)
    if (tickTimer) clearInterval(tickTimer)
    pollTimer = tickTimer = null
  }

  async function refreshRecent() {
    if (locked) return
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

  async function submit() {
    if (locked) return
    error.value = ''
    busy.value = true
    try {
      const uploaded = refs.uploaded()
      // Tek görsel → eski yol (inputKey); diğer her bileşim → references (§0 kip kuralı)
      const input = refs.singleImage.value
        ? { inputKey: uploaded[0].key }
        : uploaded.length
          ? { references: uploaded }
          : {}
      const sel = {
        model: form.model.value,
        resolution: form.resolution.value,
        durationS: form.durationS.value,
        ...(form.aspectRatio.value && { aspectRatio: form.aspectRatio.value }),
      }
      track((await aiVideoApi.create(sel, prompt.value, input)).data)
      void form.loadOptions() // bugünkü harcama ve kalan kredi güncellensin
      void refreshAccess() // bütçe bu üretimle bittiyse kilitli moda düşsün
    } catch (e) {
      fail(e)
    } finally {
      busy.value = false
    }
  }

  /** Tek satırı siler (onaysız). Sohbete gönderilmiş ekler etkilenmez. */
  async function remove(id: string) {
    error.value = ''
    try {
      await aiVideoApi.remove(id)
      recent.value = recent.value.filter((r) => r.id !== id)
      if (job.value?.id === id) reset()
    } catch (e) {
      fail(e)
    }
  }

  /** Son üretimlerin hepsini siler (çağıran onay alır). */
  async function clearAll() {
    error.value = ''
    try {
      await aiVideoApi.removeAll()
      recent.value = []
      reset()
    } catch (e) {
      fail(e)
    }
  }

  /** Satır durum metni: kaydedilen RUNNING satır "Kaydediliyor". */
  function statusLabel(r: AiVideoDto): string {
    if (r.status === 'FAILED') return errorText(r.errorCode)
    if (r.errorCode === DOWNLOAD_PENDING) return t('aiVideo.saving')
    return t(`aiVideo.status.${r.status}`)
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

  if (!locked) void refreshRecent()
  onUnmounted(stop)

  return {
    locked,
    prompt,
    refs,
    form,
    withImage,
    job,
    recent,
    busy,
    error,
    working,
    inProgress,
    saving,
    elapsedSec,
    errorText,
    submit,
    open,
    reset,
    remove,
    clearAll,
    statusLabel,
    toFile,
    save,
    saveAndAttach,
  }
}
