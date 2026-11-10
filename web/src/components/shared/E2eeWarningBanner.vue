<script setup lang="ts">
/**
 * Şifreleme uyarı bandı (E1 §3.3): tanınmayan cihaz / cihaz sohbetten çıkarıldı / cihaz anahtarı bozuk.
 * Bu durumlarda mesajlaşma durur; sessizce devam edilmez, kullanıcı nedenini görür.
 */
import { useI18n } from 'vue-i18n'
import type { WarningKind } from '@kankaverse/e2ee-client'

defineProps<{ kind: WarningKind }>()

const { t } = useI18n()
</script>

<template>
  <div
    class="shrink-0 px-4 py-2 text-[13px] text-center"
    style="background-color: var(--kv-warning); color: var(--kv-bg-rail)"
    role="alert"
  >
    {{ t(`e2ee.warning.${kind}`) }}
  </div>
</template>
