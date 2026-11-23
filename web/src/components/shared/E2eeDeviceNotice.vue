<script setup lang="ts">
/**
 * Cihaz/kimlik bilgi satırı (E2 §3.3, E7 §4.2-4.3). Mesaj değildir: seçilemez, menüsü yok; E2eeDivider ile aynı
 * gri dil. Türler: `new` (kimliği olmayan kişinin yeni cihazı), `unverified` (kimlikle imzalanmamış cihaz),
 * `identity` (güvenlik kodu değişti). E7 öncesi kayıtta tür yok: `new` sayılır.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DeviceNotice } from '@kankaverse/e2ee-client'
import E2eeLockIcon from './E2eeLockIcon.vue'

const props = defineProps<{ name: string | null; kind?: DeviceNotice['kind'] }>()
const { t } = useI18n()

const KEYS = {
  new: ['e2ee.deviceAdded', 'e2ee.deviceAddedUnknown'],
  unverified: ['e2ee.deviceUnverified', 'e2ee.deviceUnverifiedUnknown'],
  identity: ['e2ee.identityChanged', 'e2ee.identityChangedUnknown'],
} as const

const text = computed(() => {
  const [named, unknown] = KEYS[props.kind ?? 'new']
  return props.name ? t(named, { name: props.name }) : t(unknown)
})
</script>

<template>
  <div class="flex items-center gap-2 px-4 mt-3 select-none pointer-events-none" role="note">
    <span class="flex-1 min-w-3 h-px" style="background-color: var(--kv-border-subtle)" />
    <E2eeLockIcon />
    <span class="text-[11px] font-semibold text-center" style="color: var(--kv-text-muted)">{{ text }}</span>
    <span class="flex-1 min-w-3 h-px" style="background-color: var(--kv-border-subtle)" />
  </div>
</template>
