<!-- M6b §3: mesaj kutusundaki mikrofon düğmesi. Aramadayken GİZLENMEZ, devre dışı görünür;
     tıklayınca nedenini (disabledReason) toast ile söyler. -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast'

const props = defineProps<{ disabledReason: string | null }>()
const emit = defineEmits<{ start: [] }>()

const { t } = useI18n()
const toast = useToastStore()

function onClick() {
  if (props.disabledReason) {
    toast.info(props.disabledReason)
    return
  }
  emit('start')
}
</script>

<template>
  <button
    type="button"
    class="shrink-0 w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] self-center transition-colors"
    :class="disabledReason ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'"
    style="color: var(--kv-text-secondary);"
    :aria-label="t('voiceMessage.record')"
    :aria-disabled="disabledReason ? 'true' : undefined"
    :title="disabledReason ?? t('voiceMessage.record')"
    @click="onClick"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  </button>
</template>
