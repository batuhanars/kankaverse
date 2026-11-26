<script setup lang="ts">
/**
 * C79 §4 — bu cihaz hesabın E2EE cihaz sınırına takıldı (son bir haftada kullanılmış 10 cihaz). Eskiden sessizdi:
 * yedek ve güvenlik kimliği bölümleri hiç çizilmiyordu, kullanıcı nedenini bilemiyordu.
 */
import { useI18n } from 'vue-i18n'
import { useE2eeStore } from '@/stores/e2ee'
import KvButton from '@/components/ui/KvButton.vue'

defineEmits<{ 'open-sessions': [] }>()
const { t } = useI18n()
const e2ee = useE2eeStore()
</script>

<template>
  <section
    v-if="e2ee.deviceLimit"
    class="rounded-lg border px-5 py-4 flex flex-col gap-3"
    style="border-color: var(--kv-danger); background-color: var(--kv-bg-elevated);"
    role="alert"
  >
    <p class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">{{ t('e2ee.devices.limitTitle') }}</p>
    <p class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('e2ee.devices.limitBody') }}</p>
    <KvButton variant="ghost" size="sm" class="self-start" @click="$emit('open-sessions')">
      {{ t('e2ee.devices.openSessions') }}
    </KvButton>
  </section>
</template>
