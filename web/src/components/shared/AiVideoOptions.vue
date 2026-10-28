<script setup lang="ts">
/**
 * AiVideoOptions (Sprint C14b §3.1-2/3): model açılır listesi, çözünürlük + süre parçalı seçicileri, istem çipleri.
 * Seçim durumu `useAiVideoForm`da; burası yalnız görünüm. Dar ekranda satırlar sarar (flex-wrap).
 */
import { useI18n } from 'vue-i18n'
import type { AiVideoModelOption } from '@/api/aiVideo'

defineProps<{
  models: AiVideoModelOption[]
  current: AiVideoModelOption | null
  model: string
  resolution: string
  durationS: number
}>()
const emit = defineEmits<{
  'update:model': [key: string]
  'update:resolution': [value: string]
  'update:durationS': [value: number]
}>()

const { t } = useI18n()
const segBase =
  'px-3 py-1.5 text-[13px] cursor-pointer transition-colors border border-[var(--kv-border-subtle)] first:rounded-l-[var(--kv-radius-sm)] last:rounded-r-[var(--kv-radius-sm)] -ml-px first:ml-0'
const segOn = 'bg-[var(--kv-accent-500)] text-white border-[var(--kv-accent-500)] relative z-10'
const segOff = 'bg-[var(--kv-bg-content)] text-[var(--kv-text-secondary)] hover:bg-[var(--kv-bg-elevated)]'
</script>

<template>
  <div class="flex flex-wrap items-end gap-x-4 gap-y-3 min-w-0">
    <div class="min-w-0 w-full">
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
        <option v-for="m in models" :key="m.key" :value="m.key">{{ m.label }}</option>
      </select>
    </div>

    <div v-if="current" class="min-w-0">
      <span class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);">{{ t('aiVideo.resolutionLabel') }}</span>
      <div class="inline-flex" role="radiogroup" :aria-label="t('aiVideo.resolutionLabel')">
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

    <div v-if="current" class="min-w-0">
      <span class="block text-[13px] font-medium mb-1" style="color: var(--kv-text-secondary);">{{ t('aiVideo.durationLabel') }}</span>
      <div class="inline-flex" role="radiogroup" :aria-label="t('aiVideo.durationLabel')">
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
  </div>
</template>
