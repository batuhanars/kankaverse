<script setup lang="ts">
/**
 * Geri yükleme bandı (E5a §4.4-3): yedek kurulu ama bu cihazda kilitliyse DM listesinin üstünde çıkar.
 * Kapatılınca bu oturumda tekrar çıkmaz; ayarlardan erişilebilir. Başka cihazda anahtar geçersizleşince
 * de (key-dropped) aynı bant açılır, ayrı bildirim yok.
 */
import { useI18n } from 'vue-i18n'
import { useE2eeBackupStore } from '@/stores/e2eeBackup'
import { useBackupUnlock } from '@/composables/useBackupUnlock'
import BackupUnlockModal from '@/components/shared/BackupUnlockModal.vue'

const { t } = useI18n()
const backup = useE2eeBackupStore()
const unlock = useBackupUnlock()
</script>

<template>
  <div
    v-if="backup.showBanner()"
    class="shrink-0 mx-3 mb-2 px-3 py-2 rounded-[var(--kv-radius-md)] flex flex-col gap-2 text-[13px]"
    style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
    role="status"
  >
    <span class="min-w-0 break-words">{{ t('e2ee.backup.banner.text') }}</span>
    <div class="flex flex-wrap gap-3 justify-end">
      <button class="cursor-pointer" style="color: var(--kv-text-muted);" @click="backup.bannerDismissed = true">
        {{ t('e2ee.backup.banner.dismiss') }}
      </button>
      <button class="cursor-pointer font-semibold" style="color: var(--kv-accent-500);" @click="unlock.open.value = true">
        {{ t('e2ee.backup.banner.action') }}
      </button>
    </div>
  </div>

  <BackupUnlockModal
    v-if="unlock.open.value"
    :loading="unlock.loading.value"
    :error="unlock.error.value"
    @submit="unlock.submit"
    @cancel="unlock.close"
  />
</template>
