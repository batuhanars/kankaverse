<script setup lang="ts">
/**
 * AiVideoCostBar (Sprint C14b §3.1-5): canlı teklif + bugünkü harcama + "Oluştur".
 * Yüklenirken eski tutar soluk; tavanı aşacaksa düğme kapalı + neden yazılı.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import KvButton from '@/components/ui/KvButton.vue'

const props = defineProps<{
  durationS: number
  estimateUsd: number | null
  estimating: boolean
  estimateFailed: boolean
  overCap: boolean
  todaySpentUsd: number
  dailyCapUsd: number
  canSubmit: boolean
  busy: boolean
}>()
const emit = defineEmits<{ submit: [] }>()

const { t, n } = useI18n()
const usd = (v: number) =>
  t('aiVideo.amount', { amount: n(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
const disabled = computed(
  () => !props.canSubmit || props.estimating || props.estimateUsd === null || props.overCap,
)
</script>

<template>
  <div class="flex flex-col gap-1.5 min-w-0">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div class="min-w-0">
        <p class="text-[13px]" style="color: var(--kv-text-secondary);">
          {{ t('aiVideo.estimate', { sec: durationS }) }}
        </p>
        <p
          class="text-[18px] font-semibold tabular-nums transition-opacity"
          :class="estimating ? 'opacity-40' : ''"
          style="color: var(--kv-text-primary);"
        >
          <template v-if="estimateUsd !== null">{{ usd(estimateUsd) }}</template>
          <template v-else-if="estimateFailed"><span class="text-[13px] font-normal" style="color: var(--kv-danger);">{{ t('aiVideo.estimateFailed') }}</span></template>
          <template v-else>...</template>
        </p>
      </div>
      <KvButton :disabled="disabled" :loading="busy" @click="emit('submit')">{{ t('aiVideo.generate') }}</KvButton>
    </div>
    <p class="text-[12px]" style="color: var(--kv-text-muted);">
      {{ t('aiVideo.spentLine', { spent: usd(todaySpentUsd), cap: usd(dailyCapUsd) }) }}
    </p>
    <p v-if="overCap" class="text-[12px]" style="color: var(--kv-danger);">{{ t('aiVideo.overCap') }}</p>
  </div>
</template>
