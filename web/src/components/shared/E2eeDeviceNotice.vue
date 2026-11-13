<script setup lang="ts">
/**
 * "{ad} yeni bir cihaz ekledi" bilgi satırı (E2 §3.3). Mesaj değildir: seçilemez, menüsü yok; E2eeDivider ile
 * aynı gri dil. Güvenlik amaçlı: tanımadığın bir cihaz eklendiyse o kişiye başka yoldan sorabilirsin.
 */
import { useI18n } from 'vue-i18n'
import E2eeLockIcon from './E2eeLockIcon.vue'

defineProps<{ name: string | null }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex items-center gap-2 px-4 mt-3 select-none pointer-events-none" role="note">
    <span class="flex-1 min-w-3 h-px" style="background-color: var(--kv-border-subtle)" />
    <E2eeLockIcon />
    <span class="text-[11px] font-semibold text-center" style="color: var(--kv-text-muted)">{{
      name ? t('e2ee.deviceAdded', { name }) : t('e2ee.deviceAddedUnknown')
    }}</span>
    <span class="flex-1 min-w-3 h-px" style="background-color: var(--kv-border-subtle)" />
  </div>
</template>
