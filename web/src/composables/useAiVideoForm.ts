import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { aiVideoApi, type AiVideoModelOption, type AiVideoOptionsDto } from '@/api/aiVideo'

const ESTIMATE_DELAY_MS = 400

/**
 * Yapay zeka video formu (Sprint C14b §3.1): model / çözünürlük / süre seçimi (options'tan) ve
 * 400 ms gecikmeli canlı teklif. İstek yarışında yalnız SON isteğin sonucu yazılır.
 * C33: `locked` (pasif tanıtım) iken HİÇBİR istek atılmaz (options/estimate yok; 403 gürültüsü olmaz).
 */
export function useAiVideoForm(withImage: Ref<boolean>, locked = false) {
  const options = ref<AiVideoOptionsDto | null>(null)
  const model = ref('')
  const resolution = ref('')
  const durationS = ref(0)
  const aspectRatio = ref('') // '' = Otomatik (alan gönderilmez)
  const estimateCredits = ref<number | null>(null)
  const estimating = ref(false)
  const estimateFailed = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let seq = 0

  const current = computed<AiVideoModelOption | null>(
    () => options.value?.models.find((m) => m.key === model.value) ?? null,
  )
  /** Seçili model + görsel durumuna göre ölçü listesi (sunucudan; görselde boş olabilir). */
  const aspectRatios = computed(
    () => current.value?.aspectRatios[withImage.value ? 'image' : 'text'] ?? [],
  )
  const remainingCredits = computed(() =>
    options.value
      ? Math.max(0, options.value.dailyCapCredits - options.value.spentTodayCredits)
      : 0,
  )
  const overCap = computed(
    () => estimateCredits.value !== null && estimateCredits.value > remainingCredits.value,
  )

  function pickModel(key: string) {
    model.value = key
    const m = current.value
    if (!m) return
    if (!m.resolutions.includes(resolution.value)) resolution.value = m.resolutions[0]
    if (!m.durations.includes(durationS.value)) durationS.value = m.durations[0]
    resetAspectIfInvalid()
  }

  function resetAspectIfInvalid() {
    if (aspectRatio.value && !aspectRatios.value.includes(aspectRatio.value)) aspectRatio.value = ''
  }

  async function loadOptions() {
    if (locked) return
    try {
      const { data } = await aiVideoApi.options()
      const first = !options.value
      options.value = data
      if (first && data.models.length) pickModel(data.models[0].key)
    } catch {
      /* seçenekler yüklenmezse form boş kalır; hata kullanıcıya üretim denemesinde döner */
    }
  }

  async function runEstimate() {
    if (locked) return
    const id = ++seq
    estimating.value = true
    estimateFailed.value = false
    try {
      const { data } = await aiVideoApi.estimate(
        {
          model: model.value,
          resolution: resolution.value,
          durationS: durationS.value,
          ...(aspectRatio.value && { aspectRatio: aspectRatio.value }),
        },
        withImage.value,
      )
      if (id === seq) estimateCredits.value = data.estimateCredits
    } catch {
      if (id === seq) estimateFailed.value = true
    } finally {
      if (id === seq) estimating.value = false
    }
  }

  watch(withImage, resetAspectIfInvalid)
  watch([model, resolution, durationS, aspectRatio, withImage], () => {
    if (locked) return
    if (!model.value || !resolution.value || !durationS.value) return
    if (timer) clearTimeout(timer)
    estimating.value = true
    timer = setTimeout(() => void runEstimate(), ESTIMATE_DELAY_MS)
  })

  void loadOptions()
  onUnmounted(() => {
    if (timer) clearTimeout(timer)
    seq++ // uçuştaki istek sonucu yazmasın
  })

  return {
    options,
    model,
    resolution,
    durationS,
    aspectRatio,
    aspectRatios,
    current,
    estimateCredits,
    estimating,
    estimateFailed,
    remainingCredits,
    overCap,
    pickModel,
    loadOptions,
  }
}
