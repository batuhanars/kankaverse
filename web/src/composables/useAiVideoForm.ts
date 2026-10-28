import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { aiVideoApi, type AiVideoModelOption, type AiVideoOptionsDto } from '@/api/aiVideo'

const ESTIMATE_DELAY_MS = 400

/**
 * Yapay zeka video formu (Sprint C14b §3.1): model / çözünürlük / süre seçimi (options'tan) ve
 * 400 ms gecikmeli canlı teklif. İstek yarışında yalnız SON isteğin sonucu yazılır.
 */
export function useAiVideoForm(withImage: Ref<boolean>) {
  const options = ref<AiVideoOptionsDto | null>(null)
  const model = ref('')
  const resolution = ref('')
  const durationS = ref(0)
  const aspectRatio = ref('') // '' = Otomatik (alan gönderilmez)
  const estimateUsd = ref<number | null>(null)
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
  const remainingUsd = computed(() =>
    options.value ? Math.max(0, options.value.dailyCapUsd - options.value.todaySpentUsd) : 0,
  )
  const overCap = computed(
    () => estimateUsd.value !== null && estimateUsd.value > remainingUsd.value,
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
      if (id === seq) estimateUsd.value = data.quoteUsd
    } catch {
      if (id === seq) estimateFailed.value = true
    } finally {
      if (id === seq) estimating.value = false
    }
  }

  watch(withImage, resetAspectIfInvalid)
  watch([model, resolution, durationS, aspectRatio, withImage], () => {
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
    estimateUsd,
    estimating,
    estimateFailed,
    remainingUsd,
    overCap,
    pickModel,
    loadOptions,
  }
}
