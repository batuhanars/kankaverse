<script setup lang="ts">
/** Şifreli DM başlığındaki küçük kilit (E1 §4). Yalnız göstergedir. */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center"
    style="color: var(--kv-text-muted)"
    role="img"
    :title="t('e2ee.lockTitle')"
    :aria-label="t('e2ee.lockTitle')"
  >
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  </span>
</template>
