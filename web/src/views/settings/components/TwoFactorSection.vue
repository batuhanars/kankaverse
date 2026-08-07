<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import type { TwoFactorSetupDto } from '@/types'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import ReauthModal from '@/components/shared/ReauthModal.vue'

const { t } = useI18n()
const auth = useAuthStore()

type Phase =
  | 'idle'
  | 'setup-reauth'
  | 'setup-qr'
  | 'setup-codes'
  | 'disable-reauth'

const phase = ref<Phase>('idle')
const setupData = ref<TwoFactorSetupDto | null>(null)
const recoveryCodes = ref<string[]>([])
const totpCodeInput = ref('')
const reauthLoading = ref(false)
const reauthError = ref('')
const enableLoading = ref(false)
const enableError = ref('')

function extractError(e: unknown): string {
  const err = e as { response?: { data?: { message?: string } } }
  return err.response?.data?.message ?? t('common.error')
}

async function onSetupReauth(payload: { currentPassword: string }) {
  reauthLoading.value = true
  reauthError.value = ''
  try {
    const res = await authApi.twoFaSetup(payload.currentPassword)
    setupData.value = res.data
    phase.value = 'setup-qr'
  } catch (e) {
    reauthError.value = extractError(e)
  } finally {
    reauthLoading.value = false
  }
}

async function enableTwoFa() {
  if (!totpCodeInput.value.trim()) return
  enableLoading.value = true
  enableError.value = ''
  try {
    const res = await authApi.twoFaEnable(totpCodeInput.value.trim())
    recoveryCodes.value = res.data.codes
    phase.value = 'setup-codes'
  } catch (e) {
    enableError.value = extractError(e)
  } finally {
    enableLoading.value = false
  }
}

async function onDisableReauth(payload: { currentPassword: string; totpCode?: string }) {
  reauthLoading.value = true
  reauthError.value = ''
  try {
    await authApi.twoFaDisable(payload.currentPassword, payload.totpCode ?? '')
    await auth.init()
    phase.value = 'idle'
  } catch (e) {
    reauthError.value = extractError(e)
  } finally {
    reauthLoading.value = false
  }
}

async function finishSetup() {
  await auth.init()
  phase.value = 'idle'
  setupData.value = null
  recoveryCodes.value = []
  totpCodeInput.value = ''
}

function downloadCodes() {
  const text = recoveryCodes.value.join('\n')
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'kankaverse-kurtarma-kodlari.txt'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <!-- Başlık + durum -->
    <div class="flex items-center justify-between mb-3">
      <div>
        <h3 class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('security.twoFactor.title') }}
        </h3>
        <p class="text-[13px] mt-0.5" style="color: var(--kv-text-muted);">
          {{ t('security.twoFactor.description') }}
        </p>
      </div>
      <span
        class="px-2 py-0.5 rounded-full text-[12px] font-medium"
        :style="auth.user?.twoFactorEnabled
          ? 'background: rgba(61,180,110,0.15); color: #3DB46E;'
          : 'background: var(--kv-bg-elevated); color: var(--kv-text-muted);'"
      >
        {{ auth.user?.twoFactorEnabled ? t('security.twoFactor.statusEnabled') : t('security.twoFactor.statusDisabled') }}
      </span>
    </div>

    <!-- idle — butonlar -->
    <template v-if="phase === 'idle'">
      <KvButton v-if="!auth.user?.twoFactorEnabled" @click="phase = 'setup-reauth'">
        {{ t('security.twoFactor.setup') }}
      </KvButton>
      <KvButton v-else variant="ghost" @click="phase = 'disable-reauth'">
        {{ t('security.twoFactor.disable') }}
      </KvButton>
    </template>

    <!-- QR göster + kod al -->
    <template v-else-if="phase === 'setup-qr' && setupData">
      <div class="flex flex-col gap-4 mt-2">
        <p class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('security.twoFactor.scanHint') }}</p>
        <img :src="setupData.qrDataUrl" alt="QR" class="w-40 h-40 rounded-[var(--kv-radius-md)]" />
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-wide mb-1" style="color: var(--kv-text-secondary);">
            {{ t('security.twoFactor.secret') }}
          </p>
          <code class="text-[13px] px-2 py-1 rounded-[var(--kv-radius-sm)] select-all" style="background: var(--kv-bg-elevated); color: var(--kv-text-primary);">
            {{ setupData.secret }}
          </code>
        </div>
        <KvInput
          v-model="totpCodeInput"
          :label="t('security.twoFactor.enterCodeLabel')"
          :placeholder="t('security.twoFactor.enterCodePlaceholder')"
          :error="enableError"
          autocomplete="one-time-code"
        />
        <div class="flex gap-3">
          <KvButton variant="ghost" @click="phase = 'idle'">{{ t('common.cancel') }}</KvButton>
          <KvButton :loading="enableLoading" @click="enableTwoFa">
            {{ t('security.twoFactor.enableButton') }}
          </KvButton>
        </div>
      </div>
    </template>

    <!-- Kurtarma kodları (bir kez göster) -->
    <template v-else-if="phase === 'setup-codes'">
      <div class="flex flex-col gap-4 mt-2">
        <div>
          <p class="text-[13px] font-semibold mb-1" style="color: var(--kv-text-primary);">
            {{ t('security.twoFactor.recoveryTitle') }}
          </p>
          <p class="text-[12px] mb-3" style="color: var(--kv-text-muted);">{{ t('security.twoFactor.recoveryHint') }}</p>
          <div class="grid grid-cols-2 gap-1.5">
            <code
              v-for="code in recoveryCodes"
              :key="code"
              class="text-[13px] px-2 py-1 rounded-[var(--kv-radius-sm)] text-center select-all"
              style="background: var(--kv-bg-elevated); color: var(--kv-text-primary);"
            >
              {{ code }}
            </code>
          </div>
        </div>
        <div class="flex gap-3">
          <KvButton variant="ghost" @click="downloadCodes">{{ t('security.twoFactor.downloadCodes') }}</KvButton>
          <KvButton @click="finishSetup">{{ t('security.twoFactor.done') }}</KvButton>
        </div>
      </div>
    </template>
  </div>

  <!-- Reauth modaller -->
  <ReauthModal
    v-if="phase === 'setup-reauth'"
    :title="t('security.twoFactor.setup')"
    :has-two-factor="false"
    :loading="reauthLoading"
    :error="reauthError"
    @confirm="onSetupReauth"
    @cancel="phase = 'idle'; reauthError = ''"
  />
  <ReauthModal
    v-if="phase === 'disable-reauth'"
    :title="t('security.twoFactor.disable')"
    :has-two-factor="true"
    :loading="reauthLoading"
    :error="reauthError"
    @confirm="onDisableReauth"
    @cancel="phase = 'idle'; reauthError = ''"
  />
</template>
