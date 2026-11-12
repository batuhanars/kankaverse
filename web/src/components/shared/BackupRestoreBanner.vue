<script setup lang="ts">
/**
 * "Eski mesajlarını getir" bandı (E5b §4.4, E5a Rev.3). Yeni cihazda eksik geçmiş varsa DM listesinin üstünde
 * BİR KEZ çıkar (bayrak motorun cihaz deposunda; çıkışta silinir). Seçenekler: eski cihazdan aktar (aktarım açıksa),
 * yedekten geri yükle (yedek kuruluysa), hayır. Cevap ne olursa olsun bu cihazda tekrar sorulmaz; sessiz kapı
 * Ayarlar > Sohbet yedeği.
 */
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useE2eeBackupStore } from '@/stores/e2eeBackup'
import { useE2eeTransferStore } from '@/stores/e2eeTransfer'
import { useDmStore } from '@/stores/dm'
import { useBackupUnlock } from '@/composables/useBackupUnlock'
import { useToastStore } from '@/stores/toast'
import BackupUnlockModal from '@/components/shared/BackupUnlockModal.vue'

const { t } = useI18n()
const backup = useE2eeBackupStore()
const transfer = useE2eeTransferStore()
const dm = useDmStore()
const toast = useToastStore()
const unlock = useBackupUnlock()

// Motor, yedek durumu ve DM listesi farklı anlarda hazır olur: her değişimde (bir kez sonuçlanana dek) değerlendir.
watch(
  () => [backup.state, dm.channels.length, transfer.available] as const,
  () => void backup.evaluateHistoryBanner(),
  { immediate: true },
)

const canRestore = computed(() => !!backup.state?.configured)

function fromDevice() {
  backup.historyBanner = false
  void transfer.startNew()
}

async function fromBackup() {
  backup.historyBanner = false
  if (backup.state?.unlockedHere) {
    const r = await backup.restoreOnly()
    const n = r.ok ? (r.restored ?? 0) : 0
    if (r.ok) toast.success(t(`e2ee.backup.restore.${r.badSnapshots ? 'partial' : n > 0 ? 'done' : 'none'}`, { n }))
    return
  }
  unlock.show(true)
}
</script>

<template>
  <div
    v-if="backup.historyBanner"
    class="shrink-0 mx-3 mb-2 px-3 py-2 rounded-[var(--kv-radius-md)] flex flex-col gap-2 text-[13px]"
    style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
    role="status"
  >
    <span class="min-w-0 break-words">{{ t('e2ee.backup.history.banner') }}</span>
    <div class="flex flex-wrap gap-x-3 gap-y-1 justify-end">
      <button class="cursor-pointer" style="color: var(--kv-text-muted);" @click="backup.historyBanner = false">
        {{ t('e2ee.backup.history.no') }}
      </button>
      <button
        v-if="canRestore"
        class="cursor-pointer font-semibold"
        style="color: var(--kv-accent-500);"
        @click="fromBackup"
      >
        {{ t('e2ee.backup.history.fromBackup') }}
      </button>
      <button
        v-if="transfer.available"
        class="cursor-pointer font-semibold"
        style="color: var(--kv-accent-500);"
        @click="fromDevice"
      >
        {{ t('e2ee.backup.history.fromDevice') }}
      </button>
    </div>
  </div>

  <BackupUnlockModal
    v-if="unlock.open.value"
    :loading="unlock.loading.value"
    :error="unlock.error.value"
    :restore-default="unlock.restoreDefault.value"
    @submit="unlock.submit"
    @cancel="unlock.close"
  />
</template>
