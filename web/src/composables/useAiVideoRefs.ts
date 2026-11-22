import { computed, onUnmounted, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { aiVideoApi, type AiVideoRefKind, type AiVideoReferencesOption } from '@/api/aiVideo'
import { attachmentsApi } from '@/api/attachments'
import { relabelAfterRemove, tagLabel } from '@/utils/aiVideoTags'

/** Süre toleransı sunucuyla aynı (C42 §1.3): 0,5 sn. */
const DURATION_TOLERANCE_S = 0.5
const META_TIMEOUT_MS = 8000
const MAX_MB: Record<AiVideoRefKind, number> = { image: 10, video: 50, audio: 10 }
const KINDS: AiVideoRefKind[] = ['image', 'video', 'audio']

/** Seçili modelde referans kipi yoksa (Pika/Kling) yalnız tek görsel (görselden video) eklenebilir. */
const IMAGE_ONLY: AiVideoReferencesOption = {
  max: { image: 1, video: 0, audio: 0 },
  videoTotalMaxS: 0,
  videoMaxS: 0,
  audioMaxS: 0,
  audioTotalMaxS: 0,
  minS: 0,
  durations: null,
  aspectRatios: [],
  inputTypes: { image: ['image/png', 'image/jpeg', 'image/webp'], video: [], audio: [] },
}

export interface AiVideoRef {
  uid: number
  kind: AiVideoRefKind
  file: File
  previewUrl: string
  durationS: number | null // okunamazsa null, sunucu denetler
  status: 'uploading' | 'ready' | 'error'
  inputKey: string | null
  error: string
}

function readDuration(url: string, kind: AiVideoRefKind): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(kind === 'video' ? 'video' : 'audio')
    const done = (v: number | null) => {
      clearTimeout(timer)
      el.removeAttribute('src')
      resolve(v)
    }
    const timer = setTimeout(() => done(null), META_TIMEOUT_MS)
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null)
    el.onerror = () => done(null)
    el.src = url
  })
}

/**
 * Yapay zeka video ekleri (Sprint C42 §3): görsel + video + ses seçimi, istemci ön denetimi (tür, boyut, süre, sayı;
 * sınırlar `options.references`tan), seçilir seçilmez yükleme ve kaldırınca istemdeki etiketlerin yeniden numaralanması.
 * Sunucu yine denetler; burası yalnız erken uyarı.
 */
export function useAiVideoRefs(
  spec: () => AiVideoReferencesOption | null | undefined,
  prompt: Ref<string>,
  /** 2026-11-22: modelin görselden üretim ucu var mı; yoksa (Veo) tek görsel de referanstır. */
  supportsImage: () => boolean = () => true,
) {
  const { t } = useI18n()
  const list = ref<AiVideoRef[]>([])
  // Ön denetim hatası "Dosya ekle" düğmesinin altında gösterilir (formun dibinde kalınca dar ekranda görünmüyordu)
  const addError = ref('')
  let uidSeq = 0

  const limits = computed(() => spec() ?? IMAGE_ONLY)
  const accept = computed(() => KINDS.flatMap((k) => limits.value.inputTypes[k]).join(','))
  const items = computed(() => {
    const seen: Record<AiVideoRefKind, number> = { image: 0, video: 0, audio: 0 }
    return list.value.map((r) => ({
      ...r,
      n: ++seen[r.kind],
      label: tagLabel(r.kind, seen[r.kind]),
    }))
  })
  const counts = computed(() => ({
    image: list.value.filter((r) => r.kind === 'image').length,
    video: list.value.filter((r) => r.kind === 'video').length,
    audio: list.value.filter((r) => r.kind === 'audio').length,
  }))
  const kinds = computed(() => list.value.map((r) => r.kind))
  const hasVideo = computed(() => counts.value.video > 0)
  /** Yalnız 1 görsel (video/ses yok) → görselden video kipi, istek `inputKey` ile gider (§0 kip kuralı). */
  const singleImage = computed(
    () => list.value.length === 1 && list.value[0].kind === 'image' && supportsImage(),
  )
  const referenceMode = computed(() => list.value.length > 0 && !singleImage.value)
  const uploading = computed(() => list.value.some((r) => r.status === 'uploading'))
  const allReady = computed(() => list.value.every((r) => r.status === 'ready'))

  function kindOf(file: File): AiVideoRefKind | null {
    return KINDS.find((k) => limits.value.inputTypes[k].includes(file.type)) ?? null
  }

  async function upload(uid: number) {
    const item = () => list.value.find((r) => r.uid === uid)
    const file = item()?.file
    if (!file) return
    try {
      const { data } = await aiVideoApi.presignInput(file.type, file.size)
      await attachmentsApi.uploadToS3(data.uploadUrl, file)
      const it = item()
      if (it) {
        it.inputKey = data.inputKey
        it.status = 'ready'
      }
    } catch (e) {
      const it = item()
      if (it) {
        it.status = 'error'
        it.error =
          (e as { response?: { data?: { message?: string } } }).response?.data?.message ||
          t('aiVideo.refs.uploadFailed')
      }
    }
  }

  /** Ön denetim; uygun değilse kullanıcıya gösterilecek metni döner. */
  function check(kind: AiVideoRefKind | null, file: File, durationS: number | null): string {
    const lim = limits.value
    if (!kind) return t('aiVideo.refs.errors.type')
    if (file.size > MAX_MB[kind] * 1024 * 1024)
      return t(`aiVideo.refs.errors.size.${kind}`, { mb: MAX_MB[kind] })
    if (counts.value[kind] >= lim.max[kind])
      return t(`aiVideo.refs.errors.full.${kind}`, { max: lim.max[kind] })
    if (durationS === null) return ''
    if (kind !== 'image' && durationS < lim.minS - DURATION_TOLERANCE_S) {
      return t('aiVideo.refs.errors.tooShort', { sec: lim.minS })
    }
    if (kind === 'video') {
      if (durationS > lim.videoMaxS + DURATION_TOLERANCE_S)
        return t('aiVideo.refs.errors.videoLong', { sec: lim.videoMaxS })
      const total = list.value.reduce(
        (s, r) => s + (r.kind === 'video' ? (r.durationS ?? 0) : 0),
        0,
      )
      if (total + durationS > lim.videoTotalMaxS + DURATION_TOLERANCE_S) {
        return t('aiVideo.refs.errors.videoTotal', { sec: lim.videoTotalMaxS })
      }
    }
    if (kind === 'audio' && durationS > lim.audioMaxS + DURATION_TOLERANCE_S) {
      return t('aiVideo.refs.errors.audioLong', { sec: lim.audioMaxS })
    }
    if (kind === 'audio') {
      const total = list.value.reduce(
        (s, r) => s + (r.kind === 'audio' ? (r.durationS ?? 0) : 0),
        0,
      )
      if (total + durationS > lim.audioTotalMaxS + DURATION_TOLERANCE_S) {
        return t('aiVideo.refs.errors.audioTotal', { sec: lim.audioTotalMaxS })
      }
    }
    return ''
  }

  async function addFiles(files: File[]) {
    addError.value = ''
    for (const file of files) {
      const kind = kindOf(file)
      const previewUrl = URL.createObjectURL(file)
      const durationS =
        kind === 'video' || kind === 'audio' ? await readDuration(previewUrl, kind) : null
      const problem = check(kind, file, durationS)
      if (problem || !kind) {
        URL.revokeObjectURL(previewUrl)
        addError.value = problem
        continue
      }
      const uid = ++uidSeq
      list.value.push({
        uid,
        kind,
        file,
        previewUrl,
        durationS,
        status: 'uploading',
        inputKey: null,
        error: '',
      })
      void upload(uid)
    }
  }

  function remove(uid: number) {
    const idx = list.value.findIndex((r) => r.uid === uid)
    if (idx < 0) return
    addError.value = ''
    const [gone] = list.value.splice(idx, 1)
    const n = list.value.slice(0, idx).filter((r) => r.kind === gone.kind).length + 1
    URL.revokeObjectURL(gone.previewUrl)
    prompt.value = relabelAfterRemove(prompt.value, gone.kind, n)
  }

  function clear() {
    list.value.forEach((r) => URL.revokeObjectURL(r.previewUrl))
    list.value = []
  }

  onUnmounted(clear)

  return {
    items,
    addError,
    counts,
    kinds,
    limits,
    accept,
    hasVideo,
    singleImage,
    referenceMode,
    uploading,
    allReady,
    addFiles,
    remove,
    /** Gönderim için: yüklenmiş ekler, ekleme sırasıyla. */
    uploaded: () => list.value.map((r) => ({ kind: r.kind, key: r.inputKey as string })),
  }
}
