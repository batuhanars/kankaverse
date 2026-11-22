<script setup lang="ts">
/**
 * AiVideoOptions (Sprint C14b §3.1-2/3): model açılır listesi, çözünürlük + süre parçalı seçicileri, istem çipleri.
 * Seçim durumu `useAiVideoForm`da; burası yalnız görünüm. Dar ekranda satırlar sarar (flex-wrap).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiVideoModelOption } from '@/api/aiVideo'
import KvSelect from '@/components/ui/KvSelect.vue'

const props = defineProps<{
  models: AiVideoModelOption[]
  current: AiVideoModelOption | null
  model: string
  resolution: string
  durationS: number
  aspectRatio: string // '' = Otomatik
  aspectRatios: string[]
  withImage: boolean
}>()
const emit = defineEmits<{
  'update:model': [key: string]
  'update:resolution': [value: string]
  'update:durationS': [value: number]
  'update:aspectRatio': [value: string]
}>()

const i18n = useI18n()
const t = i18n.t
/** Bilinmeyen sağlayıcı değeri arayüzü kırmaz: etiket yoksa oranın kendisi yazılır. */
const ratioLabel = (r: string) => {
  const key = `aiVideo.ratio.r${r.replace(":", "x")}`
  return i18n.te(key) ? t(key) : r
}
/** Bundan uzun süre listesi açılır listeyle seçilir (düğmeler satırları şişirir). */
const DURATION_BUTTONS_MAX = 6
const durationOptions = computed(() =>
  (props.current?.durations ?? []).map((d) => ({ value: String(d), label: t('aiVideo.durationOption', { sec: d }) })),
)
const lockedAuto = computed(() => props.withImage && props.aspectRatios.length === 0)
const segBase =
  'px-3 py-1.5 text-[13px] cursor-pointer transition-colors border border-[var(--kv-border-subtle)] rounded-[var(--kv-radius-sm)]'
const segOn = 'bg-[var(--kv-accent-500)] text-white border-[var(--kv-accent-500)]'
const segOff = 'bg-[var(--kv-bg-content)] text-[var(--kv-text-secondary)] hover:bg-[var(--kv-bg-elevated)]'
</script>

<template>
  <div class="flex flex-wrap items-end gap-x-4 gap-y-3 min-w-0">
    <!-- C42 §2: tek model açıkken model adı ve sesli/sessiz bilgisi gösterilmez; seçici yalnız birden çok modelde -->
    <div v-if="models.length > 1" class="min-w-0 w-full">
      <label class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);" for="ai-video-model">
        {{ t('aiVideo.modelLabel') }}
      </label>
      <select
        id="ai-video-model"
        :value="model"
        class="w-full rounded-[var(--kv-radius-md)] px-3 py-2 text-[14px] outline-none border border-[var(--kv-border-subtle)] bg-[var(--kv-bg-content)] cursor-pointer"
        style="color: var(--kv-text-primary);"
        @change="emit('update:model', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="m in models" :key="m.key" :value="m.key">{{ m.audio === 'none' ? t('aiVideo.audioNone', { label: m.label }) : m.label }}</option>
      </select>
    </div>

    <!-- C14f: görsel + istem model bilgisinin altında, seçeneklerin üstünde (sahip sırası) -->
    <slot />

    <div v-if="current" class="min-w-0 w-full">
      <span class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);">{{ t('aiVideo.resolutionLabel') }}</span>
      <div class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="t('aiVideo.resolutionLabel')">
        <button
          v-for="r in current.resolutions"
          :key="r"
          type="button"
          role="radio"
          :aria-checked="r === resolution"
          :class="[segBase, r === resolution ? segOn : segOff]"
          @click="emit('update:resolution', r)"
        >
          {{ r }}
        </button>
      </div>
    </div>

    <div v-if="current" class="min-w-0 w-full">
      <!-- 2026-11-07: uzun süre listesi (Wan 5-30) düğme olarak sığmıyor → açılır liste; kısa listede düğmeler kalır -->
      <template v-if="current.durations.length > DURATION_BUTTONS_MAX">
        <span class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);">{{ t('aiVideo.durationLabel') }}</span>
        <!-- reka-ui listesi: tarayıcının açılır menüsü kaydırma çubuğunu koyu temada görünür çizmiyordu -->
        <KvSelect
          :model-value="String(durationS)"
          :options="durationOptions"
          @update:model-value="(v) => v && emit('update:durationS', Number(v))"
        />
      </template>
      <span v-else class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);">{{ t('aiVideo.durationLabel') }}</span>
      <div v-if="current.durations.length <= DURATION_BUTTONS_MAX" class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="t('aiVideo.durationLabel')">
        <button
          v-for="d in current.durations"
          :key="d"
          type="button"
          role="radio"
          :aria-checked="d === durationS"
          :class="[segBase, d === durationS ? segOn : segOff]"
          @click="emit('update:durationS', d)"
        >
          {{ t('aiVideo.durationOption', { sec: d }) }}
        </button>
      </div>
    </div>

    <div v-if="current" class="min-w-0 w-full">
      <span class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);">{{ t('aiVideo.aspectLabel') }}</span>
      <div class="flex flex-wrap gap-1.5" role="radiogroup" :aria-label="t('aiVideo.aspectLabel')">
        <button
          type="button"
          role="radio"
          :aria-checked="aspectRatio === ''"
          :disabled="lockedAuto"
          :class="[segBase, aspectRatio === '' ? segOn : segOff, lockedAuto && 'cursor-not-allowed opacity-70']"
          @click="emit('update:aspectRatio', '')"
        >
          {{ t('aiVideo.aspectAuto') }}
        </button>
        <button
          v-for="r in aspectRatios"
          :key="r"
          type="button"
          role="radio"
          :aria-checked="r === aspectRatio"
          :class="[segBase, r === aspectRatio ? segOn : segOff]"
          @click="emit('update:aspectRatio', r)"
        >
          {{ ratioLabel(r) }}
        </button>
      </div>
      <p v-if="lockedAuto" class="text-[12px] mt-1" style="color: var(--kv-text-muted);">{{ t('aiVideo.aspectFromImage') }}</p>
    </div>
  </div>
</template>
