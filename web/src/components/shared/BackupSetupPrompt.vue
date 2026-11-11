<script setup lang="ts">
/** Şifreli DM ilk açıldığında BİR KEZ çıkan yedek kurulum sorusu (E5a §4.4-1). "Şimdi değil" ile kapanır. */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useE2eeBackupStore } from '@/stores/e2eeBackup'
import { useToastStore } from '@/stores/toast'
import { outcomeMessage } from '@/utils/backupOutcome'
import BackupPasswordModal from '@/components/shared/BackupPasswordModal.vue'

const { t } = useI18n()
const backup = useE2eeBackupStore()
const toast = useToastStore()
const loading = ref(false)
const error = ref('')

async function onSubmit(p: { password: string }) {
  loading.value = true
  error.value = ''
  const r = await backup.setup(p.password)
  loading.value = false
  if (!r.ok) {
    error.value = outcomeMessage(r, t)
    return
  }
  backup.setupPromptOpen = false
  toast.success(t('e2ee.backup.setup.done'))
}
</script>

<template>
  <BackupPasswordModal
    v-if="backup.setupPromptOpen"
    mode="setup"
    :loading="loading"
    :error="error"
    @submit="onSubmit"
    @cancel="backup.setupPromptOpen = false"
  />
</template>
