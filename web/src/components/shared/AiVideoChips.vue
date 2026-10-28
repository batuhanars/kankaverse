<script setup lang="ts">
/** AiVideoChips (Sprint C14b §3.1-3): tıklanınca metni isteme ekleyen öneri çipleri. */
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ pick: [text: string] }>()
const { t } = useI18n()
const CHIP_KEYS = ['cinematic', 'sunset', 'smile', 'slowMotion', 'neonNight'] as const
</script>

<template>
  <div class="flex flex-wrap gap-1.5 mt-2" role="group" :aria-label="t('aiVideo.chipsLabel')">
    <button
      v-for="k in CHIP_KEYS"
      :key="k"
      type="button"
      class="px-2.5 py-1 rounded-full text-[12px] cursor-pointer border border-[var(--kv-border-subtle)] bg-[var(--kv-bg-content)] hover:bg-[var(--kv-bg-elevated)] transition-colors"
      style="color: var(--kv-text-secondary);"
      @click="emit('pick', t(`aiVideo.chips.${k}`))"
    >
      {{ t(`aiVideo.chips.${k}`) }}
    </button>
  </div>
</template>
