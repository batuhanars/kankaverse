<script setup lang="ts">
/**
 * "Sohbet yedeği" ayarları (E5a §4.4): durum, son yedek zamanı ve eylemler. Yedek bayrağı kapalıysa hiç çizilmez.
 * Reset/kapatma sunucuda reauth ister: mevcut `ReauthModal` aynen kullanılır (Sprint 2B hassas işlem).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useE2eeBackupStore, type BackupOutcome } from '@/stores/e2eeBackup'
import { useE2eeTransferStore } from '@/stores/e2eeTransfer'
import { useToastStore } from '@/stores/toast'
import { useBackupUnlock } from '@/composables/useBackupUnlock'
import { formatDateTime } from '@/utils/formatDateTime'
import { outcomeMessage } from '@/utils/backupOutcome'
import KvButton from '@/components/ui/KvButton.vue'
import KvModal from '@/components/ui/KvModal.vue'
import ReauthModal from '@/components/shared/ReauthModal.vue'
import BackupPasswordModal from '@/components/shared/BackupPasswordModal.vue'
import BackupUnlockModal from '@/components/shared/BackupUnlockModal.vue'

const { t } = useI18n()
const auth = useAuthStore()
const backup = useE2eeBackupStore()
const toast = useToastStore()
const unlock = useBackupUnlock()
const transfer = useE2eeTransferStore()

/** Rev.3 sessiz kapı: yedek bu cihazda açıkken geçmişi şifresiz geri yükle. */
const restoring = ref(false)
async function restoreHistory() {
  restoring.value = true
  const r = await backup.restoreOnly()
  restoring.value = false
  if (!r.ok) {
    toast.error(outcomeMessage(r, t))
    return
  }
  const n = r.restored ?? 0
  toast.success(t(`e2ee.backup.restore.${r.badSnapshots ? 'partial' : n > 0 ? 'done' : 'none'}`, { n }))
}

type Dialog = 'setup' | 'change' | 'reset' | 'reset-reauth' | 'disable' | 'disable-reauth' | null
const dialog = ref<Dialog>(null)
const loading = ref(false)
const error = ref('')
const pendingPassword = ref('')
const nowLoading = ref(false)

const info = computed(() => backup.state)
const statusKey = computed(() => {
  if (!info.value?.configured) return 'none'
  return info.value.unlockedHere ? 'unlocked' : 'locked'
})

function close() {
  dialog.value = null
  error.value = ''
  pendingPassword.value = ''
}

/** Başarı: kapat + toast; hata: modal açık kalır, Türkçe mesaj. */
function finish(r: BackupOutcome, doneKey: string) {
  loading.value = false
  if (!r.ok) {
    error.value = outcomeMessage(r, t)
    return
  }
  close()
  toast.success(t(doneKey))
}

async function onSetup(p: { password: string }) {
  loading.value = true
  error.value = ''
  finish(await backup.setup(p.password), 'e2ee.backup.setup.done')
}

async function onChange(p: { oldPassword?: string; password: string }) {
  loading.value = true
  error.value = ''
  finish(await backup.change(p.oldPassword ?? '', p.password), 'e2ee.backup.change.done')
}

function onResetPassword(p: { password: string }) {
  pendingPassword.value = p.password
  dialog.value = 'reset-reauth'
}

async function onResetReauth(reauth: { currentPassword: string; totpCode?: string }) {
  loading.value = true
  error.value = ''
  finish(await backup.reset(pendingPassword.value, reauth), 'e2ee.backup.reset.done')
}

async function onDisableReauth(reauth: { currentPassword: string; totpCode?: string }) {
  loading.value = true
  error.value = ''
  finish(await backup.disable(reauth), 'e2ee.backup.disable.done')
}

async function backupNow() {
  if (!info.value?.unlockedHere) {
    toast.info(t('e2ee.backup.now.locked'))
    return
  }
  nowLoading.value = true
  const r = await backup.backupNow()
  nowLoading.value = false
  if (r.status === 'uploaded') toast.success(t('e2ee.backup.now.uploaded'))
  else if (r.status === 'skipped') toast.info(t('e2ee.backup.now.upToDate'))
  else toast.error(t('e2ee.backup.now.failed'))
}
</script>

<template>
  <section v-if="info?.enabled">
    <h3 class="text-[18px] font-bold mb-2" style="color: var(--kv-text-primary);">{{ t('e2ee.backup.title') }}</h3>
    <p class="text-[13px] mb-3" style="color: var(--kv-text-muted);">{{ t('e2ee.backup.intro') }}</p>

    <div
      class="rounded-[var(--kv-radius-lg)] divide-y divide-[color:var(--kv-border-subtle)]"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4">
        <span class="text-[14px] font-medium" style="color: var(--kv-text-secondary);">{{ t(`e2ee.backup.status.${statusKey}`) }}</span>
        <span v-if="statusKey === 'unlocked'" class="text-[13px] min-w-0" style="color: var(--kv-text-muted);">
          {{ info.lastBackupAt ? t('e2ee.backup.lastBackup', { date: formatDateTime(info.lastBackupAt) }) : t('e2ee.backup.noBackupYet') }}
        </span>
      </div>
      <p v-if="backup.isStale()" class="px-5 py-3 text-[13px]" style="color: var(--kv-warning);">
        {{ t('e2ee.backup.staleWarning') }}
      </p>

      <div class="flex flex-wrap gap-2 px-5 py-4">
        <KvButton v-if="statusKey === 'none'" size="sm" @click="dialog = 'setup'">{{ t('e2ee.backup.actions.setup') }}</KvButton>
        <KvButton v-if="statusKey === 'locked'" size="sm" @click="unlock.show(false)">{{ t('e2ee.backup.actions.unlock') }}</KvButton>
        <KvButton v-if="statusKey === 'unlocked'" size="sm" variant="ghost" :loading="restoring" @click="restoreHistory">{{ t('e2ee.backup.history.fromBackup') }}</KvButton>
        <KvButton v-if="transfer.available" size="sm" variant="ghost" @click="transfer.startNew()">{{ t('e2ee.backup.history.fromDevice') }}</KvButton>
        <KvButton v-if="statusKey === 'unlocked'" size="sm" variant="ghost" :loading="nowLoading" @click="backupNow">{{ t('e2ee.backup.actions.now') }}</KvButton>
        <KvButton v-if="statusKey === 'unlocked'" size="sm" variant="ghost" @click="dialog = 'change'">{{ t('e2ee.backup.actions.change') }}</KvButton>
        <KvButton v-if="statusKey !== 'none'" size="sm" variant="ghost" @click="dialog = 'reset'">{{ t('e2ee.backup.actions.reset') }}</KvButton>
        <KvButton
          v-if="statusKey !== 'none'"
          size="sm"
          variant="ghost"
          class="text-[var(--kv-danger)]"
          @click="dialog = 'disable'"
        >{{ t('e2ee.backup.actions.disable') }}</KvButton>
      </div>
    </div>
  </section>

  <BackupPasswordModal
    v-if="dialog === 'setup'"
    mode="setup"
    :loading="loading"
    :error="error"
    @submit="onSetup"
    @cancel="close"
  />
  <BackupPasswordModal
    v-if="dialog === 'change'"
    mode="change"
    :loading="loading"
    :error="error"
    @submit="onChange"
    @cancel="close"
  />
  <BackupPasswordModal v-if="dialog === 'reset'" mode="reset" @submit="onResetPassword" @cancel="close" />
  <ReauthModal
    v-if="dialog === 'reset-reauth'"
    :title="t('e2ee.backup.reset.title')"
    :has-two-factor="auth.user?.twoFactorEnabled ?? false"
    :password-label="t('e2ee.backup.reauth.passwordLabel')"
    :subtitle="t('e2ee.backup.reauth.hint')"
    :loading="loading"
    :error="error"
    @confirm="onResetReauth"
    @cancel="close"
  />

  <KvModal v-if="dialog === 'disable'" :title="t('e2ee.backup.disable.title')" @close="close">
    <p class="text-[13px] mb-4" style="color: var(--kv-danger);">{{ t('e2ee.backup.disable.warning') }}</p>
    <div class="flex flex-wrap gap-3 justify-end">
      <KvButton variant="ghost" @click="close">{{ t('common.cancel') }}</KvButton>
      <KvButton variant="danger" @click="dialog = 'disable-reauth'">{{ t('e2ee.backup.disable.submit') }}</KvButton>
    </div>
  </KvModal>
  <ReauthModal
    v-if="dialog === 'disable-reauth'"
    :title="t('e2ee.backup.disable.title')"
    :has-two-factor="auth.user?.twoFactorEnabled ?? false"
    :password-label="t('e2ee.backup.reauth.passwordLabel')"
    :subtitle="t('e2ee.backup.reauth.hint')"
    :loading="loading"
    :error="error"
    @confirm="onDisableReauth"
    @cancel="close"
  />

  <BackupUnlockModal
    v-if="unlock.open.value"
    :loading="unlock.loading.value"
    :error="unlock.error.value"
    :restore-default="unlock.restoreDefault.value"
    @submit="unlock.submit"
    @cancel="unlock.close"
  />
</template>
