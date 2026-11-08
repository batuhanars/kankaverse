<script setup lang="ts">
/**
 * AiVideoActiveDot (C49 R3): etkin yapay zeka video üretimi varken giriş düğmelerinde küçük sabit nokta (mobil `AiVideoSparkles` ile aynı dil; dakikalarca dönen gösterge gözü yorar).
 * Durum global (`useAiVideoViewer().activeId`); ek yoklama yok.
 */
import { useI18n } from 'vue-i18n'
import { useAiVideoViewer } from '@/composables/useAiVideoViewer'

const { t } = useI18n()
const { activeId } = useAiVideoViewer()
</script>

<template>
  <span
    v-if="activeId"
    class="inline-block w-[9px] h-[9px] rounded-full border-[1.5px]"
    style="background: var(--kv-accent-500); border-color: var(--kv-bg-elevated);"
    role="img"
    :aria-label="t('aiVideo.activeIndicator')"
    :title="t('aiVideo.activeIndicator')"
  />
</template>
