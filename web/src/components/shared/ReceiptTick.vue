<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * C34 — okundu tiki: mesaj metninin sonuna AKAN küçük satır içi simge (ayrı satır açmaz).
 * Yalnız iki durum: 'sent' tek tik (gönderildi), 'seen' çift tik (okundu). Renk nötr (ikincil yazı);
 * ikon tek başına bilgi taşımasın diye `title` + `aria-label` i18n'den gelir.
 */
defineProps<{ receipt: 'sent' | 'seen' }>()
const { t } = useI18n()
</script>

<template>
  <span
    class="kv-receipt-tick ml-1 select-none"
    style="color: var(--kv-text-muted);"
    :title="t(`message.receipt.${receipt}`)"
    :aria-label="t(`message.receipt.${receipt}`)"
    role="img"
  >
    <svg width="14" height="10" viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle;">
      <path d="M1 6.5 4.5 10 11 2" />
      <path v-if="receipt === 'seen'" d="M8 6.5 11.5 10 18 2" />
    </svg>
  </span>
</template>
