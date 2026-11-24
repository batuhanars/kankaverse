<script setup lang="ts">
/**
 * Şifreli sohbetin başındaki bilgi kutusu (sahip 2026-11-24). Sohbetin en başında, "bu noktadan sonra
 * şifreli" ayracının yerine çizilir (öncesi olmadığı için). Dokununca güvenlik kodu açılır (E7).
 * Renk uyarı tonundan (`--kv-warning` / `--kv-warning-subtle`), EmailVerificationBanner ile aynı eşleme.
 */
import { useI18n } from 'vue-i18n'
import E2eeLockIcon from './E2eeLockIcon.vue'

const emit = defineEmits<{ open: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex justify-center px-4 mt-4 mb-2">
    <button
      type="button"
      class="max-w-[420px] flex items-start gap-2 text-left rounded-[var(--kv-radius-md)] px-3 py-2 cursor-pointer"
      style="background-color: var(--kv-warning-subtle, #3D2E0E); color: var(--kv-warning, #E8A33D);"
      :aria-label="t('e2ee.intro.title')"
      @click="emit('open')"
    >
      <span class="mt-0.5 shrink-0"><E2eeLockIcon /></span>
      <span class="flex flex-col gap-0.5">
        <span class="text-[13px] font-semibold">{{ t('e2ee.intro.title') }}</span>
        <span class="text-[11px]">{{ t('e2ee.intro.body') }} {{ t('e2ee.intro.actionClick') }}</span>
      </span>
    </button>
  </div>
</template>
