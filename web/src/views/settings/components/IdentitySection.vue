<script setup lang="ts">
/**
 * E7 §4.6, §4.8 — Hesap güvenliği → Güvenlik kimliği. Cihazların doğrulanmış/doğrulanmamış durumu, imzasız bu cihaz
 * için "Bu cihazı doğrula" (aktarımın yalnız kimlik modu, bant ya da ısrar yok: §10-1) ve kimliği taşımayan cihazda
 * sıfırlama (reauth). Kimlik bayrağı kapalıyken bölüm çizilmez.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OwnDeviceView } from '@kankaverse/e2ee-client'
import { useAuthStore } from '@/stores/auth'
import { useE2eeStore } from '@/stores/e2ee'
import { useE2eeTransferStore } from '@/stores/e2eeTransfer'
import { useToastStore } from '@/stores/toast'
import KvButton from '@/components/ui/KvButton.vue'
import KvModal from '@/components/ui/KvModal.vue'
import ReauthModal from '@/components/shared/ReauthModal.vue'

const { t } = useI18n()
const auth = useAuthStore()
const e2ee = useE2eeStore()
const transfer = useE2eeTransferStore()
const toast = useToastStore()

const identity = computed(() => (e2ee.engine?.identity?.enabled ? e2ee.engine.identity : null))
const devices = ref<OwnDeviceView[]>([])
const hasIdentity = ref(false)
const thisVerified = ref(false)
const holdsKey = ref(false)
const dialog = ref<'reset' | 'reauth' | null>(null)
const loading = ref(false)
const error = ref('')

async function load(): Promise<void> {
  const id = identity.value
  if (!id) return
  try {
    await e2ee.engine?.identitySynced
    const view = await id.ownDevices()
    devices.value = view.devices
    hasIdentity.value = view.hasIdentity
    thisVerified.value = view.thisDeviceVerified
    holdsKey.value = await id.hasLocalIdentity()
  } catch (e) {
    console.error('[e2ee] cihaz listesi okunamadı', e instanceof Error ? e.name : typeof e)
  }
}

onMounted(load)
watch(identity, load)
// "Bu cihazı doğrula" bitince liste tazelenir.
watch(
  () => transfer.n.phase,
  (phase) => phase === 'done' && void load(),
)

const canVerify = computed(() => hasIdentity.value && !thisVerified.value && transfer.available)
// §4.6: yalnız bu cihaz kimliği taşımıyorsa anlamlı (taşıyorsa diğer cihazları kendisi doğrulatabilir).
const canReset = computed(() => hasIdentity.value && !holdsKey.value)

const platformLabel = (p: string) =>
  p === 'android' ? t('e2ee.identity.platformAndroid') : t('e2ee.identity.platformWeb')

async function onReauth(reauth: { currentPassword: string; totpCode?: string }): Promise<void> {
  const id = identity.value
  if (!id) return
  loading.value = true
  error.value = ''
  try {
    await id.reset(reauth)
    dialog.value = null
    toast.success(t('e2ee.identity.resetDone'))
    await load()
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } } }
    error.value = err.response?.data?.message ?? t('common.error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section v-if="identity">
    <h3 class="text-[18px] font-bold mb-2" style="color: var(--kv-text-primary);">{{ t('e2ee.identity.sectionTitle') }}</h3>
    <p class="text-[13px] mb-3" style="color: var(--kv-text-muted);">{{ t('e2ee.identity.sectionIntro') }}</p>

    <div
      class="rounded-[var(--kv-radius-lg)] divide-y divide-[color:var(--kv-border-subtle)]"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <p v-if="!hasIdentity" class="px-5 py-4 text-[13px]" style="color: var(--kv-text-muted);">
        {{ t('e2ee.identity.noIdentity') }}
      </p>
      <div
        v-for="d in devices"
        v-else
        :key="d.deviceId"
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3"
      >
        <span class="text-[14px] min-w-0" style="color: var(--kv-text-secondary);">
          {{ platformLabel(d.platform) }}
          <span v-if="d.current" class="text-[12px]" style="color: var(--kv-text-muted);">· {{ t('e2ee.identity.thisDevice') }}</span>
        </span>
        <span
          class="text-[13px] font-medium"
          :style="`color: ${d.verified ? 'var(--kv-online, #3DB46E)' : 'var(--kv-warning)'};`"
        >
          {{ d.verified ? t('e2ee.identity.deviceVerified') : t('e2ee.identity.deviceUnverified') }}
        </span>
      </div>

      <div v-if="canVerify || canReset" class="flex flex-col gap-3 px-5 py-4">
        <template v-if="canVerify">
          <p class="m-0 text-[13px]" style="color: var(--kv-text-muted);">{{ t('e2ee.identity.verifyHelp') }}</p>
          <div>
            <KvButton size="sm" @click="transfer.startNew({ identityOnly: true })">
              {{ t('e2ee.identity.verifyThisDevice') }}
            </KvButton>
          </div>
        </template>
        <div v-if="canReset">
          <KvButton size="sm" variant="ghost" @click="dialog = 'reset'; error = ''">
            {{ t('e2ee.identity.reset') }}
          </KvButton>
        </div>
      </div>
    </div>
  </section>

  <KvModal v-if="dialog === 'reset'" :title="t('e2ee.identity.reset')" @close="dialog = null">
    <div class="flex flex-col gap-4 text-[13px]" style="color: var(--kv-text-primary);">
      <p class="m-0">{{ t('e2ee.identity.resetWarning') }}</p>
      <div class="flex flex-wrap gap-3 justify-end">
        <KvButton variant="ghost" @click="dialog = null">{{ t('common.cancel') }}</KvButton>
        <KvButton variant="danger" @click="dialog = 'reauth'">{{ t('e2ee.identity.resetConfirm') }}</KvButton>
      </div>
    </div>
  </KvModal>
  <ReauthModal
    v-if="dialog === 'reauth'"
    :title="t('e2ee.identity.reset')"
    :has-two-factor="auth.user?.twoFactorEnabled ?? false"
    :password-label="t('e2ee.backup.reauth.passwordLabel')"
    :subtitle="t('e2ee.identity.reauthHint')"
    :loading="loading"
    :error="error"
    @confirm="onReauth"
    @cancel="dialog = null"
  />
</template>
