<script setup lang="ts">
/**
 * Şifreli bölümün başındaki ayraç (E1 §4): "Bu noktadan sonra mesajlar uçtan uca şifreli".
 * DateDivider ile aynı dil: ince çizgi + ortada metin; seçilemez, mesaj değildir.
 */
import { useI18n } from 'vue-i18n'
import E2eeLockIcon from './E2eeLockIcon.vue'

const { t } = useI18n()
</script>

<template>
  <div
    class="flex items-center gap-2 px-4 mt-3 select-none pointer-events-none"
    role="separator"
    :aria-label="t('e2ee.divider')"
  >
    <span class="flex-1 min-w-3 h-px" style="background-color: var(--kv-border-subtle)" />
    <E2eeLockIcon />
    <span class="text-[11px] font-semibold text-center" style="color: var(--kv-text-muted)">{{
      t('e2ee.divider')
    }}</span>
    <span class="flex-1 min-w-3 h-px" style="background-color: var(--kv-border-subtle)" />
  </div>
</template>
