import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useE2eeBackupStore } from '@/stores/e2eeBackup'
import { useToastStore } from '@/stores/toast'
import { outcomeMessage } from '@/utils/backupOutcome'

/** Yedeği bu cihazda aç + geri yükle akışı (E5a §4.4-2/3); bant ve ayarlar aynı akışı kullanır. */
export function useBackupUnlock() {
  const { t } = useI18n()
  const backup = useE2eeBackupStore()
  const toast = useToastStore()
  const open = ref(false)
  const loading = ref(false)
  const error = ref('')

  function close() {
    open.value = false
    error.value = ''
  }

  async function submit(password: string) {
    loading.value = true
    error.value = ''
    const r = await backup.unlockAndRestore(password)
    loading.value = false
    if (!r.ok) {
      error.value = outcomeMessage(r, t)
      return
    }
    close()
    const n = r.restored ?? 0
    const key = r.badSnapshots ? 'partial' : n > 0 ? 'done' : 'none'
    toast.success(t(`e2ee.backup.restore.${key}`, { n }))
  }

  return { open, loading, error, close, submit }
}
