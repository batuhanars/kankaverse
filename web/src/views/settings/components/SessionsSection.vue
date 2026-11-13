<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api/auth'
import { e2eeParkedApi, type ParkedDevice } from '@/api/e2ee'
import type { SessionDto } from '@/types'
import KvButton from '@/components/ui/KvButton.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import { formatDateTime } from '@/utils/formatDateTime'

const { t } = useI18n()
const sessions = ref<SessionDto[]>([])
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await authApi.getSessions()
    sessions.value = res.data
  } catch {
    error.value = t('common.error')
  } finally {
    loading.value = false
  }
}

async function terminate(id: string) {
  try {
    await authApi.deleteSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    error.value = err.response?.data?.message ?? t('common.error')
  }
}

async function terminateOthers() {
  try {
    await authApi.revokeOtherSessions()
    sessions.value = sessions.value.filter((s) => s.current)
  } catch {
    error.value = t('common.error')
  }
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Az önce'
  if (m < 60) return `${m} dk önce`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} sa önce`
  return `${Math.floor(h / 24)} gün önce`
}

// C69: çıkış yapılmış (park) şifreleme cihazları. E2EE kapalıysa (404 E2EE_DISABLED) ya da yükleme
// başarısızsa bölüm hiç görünmez; bu ekranın asıl işi (oturumlar) bundan etkilenmez.
const parked = ref<ParkedDevice[]>([])
const parkedToRemove = ref<ParkedDevice | null>(null)
const removing = ref(false)
const removeError = ref('')

async function loadParked() {
  try {
    parked.value = (await e2eeParkedApi.list()).data
  } catch {
    parked.value = []
  }
}

const platformLabel = (p: string) =>
  p === 'android' ? t('security.sessions.parkedAndroid') : t('security.sessions.parkedDesktop')

async function removeParked() {
  const target = parkedToRemove.value
  if (!target) return
  removing.value = true
  removeError.value = ''
  try {
    await e2eeParkedApi.remove(target.id)
    parked.value = parked.value.filter((d) => d.id !== target.id)
    parkedToRemove.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    removeError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    removing.value = false
  }
}

onMounted(() => {
  void load()
  void loadParked()
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 mb-3">
      <h3 class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
        {{ t('security.sessions.title') }}
      </h3>
      <KvButton
        v-if="sessions.filter(s => !s.current).length > 0"
        variant="ghost"
        @click="terminateOthers"
      >
        {{ t('security.sessions.terminateOthers') }}
      </KvButton>
    </div>

    <p v-if="loading" class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('common.loading') }}</p>
    <p v-else-if="!sessions.length" class="text-[13px]" style="color: var(--kv-text-muted);">
      {{ t('security.sessions.noSessions') }}
    </p>
    <p v-if="error" class="text-[13px] mb-2" style="color: var(--kv-danger);">{{ error }}</p>

    <div class="flex flex-col gap-2">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="flex items-center justify-between px-3 py-2.5 rounded-[var(--kv-radius-md)]"
        style="background: var(--kv-bg-elevated);"
      >
        <div class="flex flex-col gap-0.5">
          <div class="flex items-center gap-2">
            <span class="text-[13px] font-medium" style="color: var(--kv-text-primary);">
              {{ session.device ?? t('security.sessions.unknown') }}
            </span>
            <span
              v-if="session.current"
              class="text-[11px] px-1.5 py-0.5 rounded-full font-medium"
              style="background: rgba(61,180,110,0.15); color: #3DB46E;"
            >
              {{ t('security.sessions.current') }}
            </span>
          </div>
          <span class="text-[12px]" style="color: var(--kv-text-muted);">
            {{ session.ip ?? t('security.sessions.unknown') }} · {{ t('security.sessions.lastActive') }}: {{ formatRelative(session.lastActiveAt) }}
          </span>
        </div>
        <button
          v-if="!session.current"
          class="text-[12px] cursor-pointer hover:underline shrink-0"
          style="color: var(--kv-danger);"
          @click="terminate(session.id)"
        >
          {{ t('security.sessions.terminate') }}
        </button>
      </div>
    </div>

    <div v-if="parked.length" class="flex flex-col gap-2 mt-4">
      <div
        v-for="device in parked"
        :key="device.id"
        class="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[var(--kv-radius-md)]"
        style="background: var(--kv-bg-elevated);"
      >
        <span class="text-[13px]" style="color: var(--kv-text-primary);">
          {{
            t('security.sessions.parkedRow', {
              platform: platformLabel(device.platform),
              date: formatDateTime(Date.parse(device.lastSeenAt)),
            })
          }}
        </span>
        <button
          class="text-[12px] cursor-pointer hover:underline shrink-0"
          style="color: var(--kv-danger);"
          @click="parkedToRemove = device; removeError = ''"
        >
          {{ t('security.sessions.parkedRemove') }}
        </button>
      </div>
    </div>

    <ConfirmDialog
      v-if="parkedToRemove"
      :title="t('security.sessions.parkedRemoveTitle')"
      :message="removeError || t('security.sessions.parkedRemoveConfirm')"
      :confirm-label="t('security.sessions.parkedRemove')"
      :loading="removing"
      @confirm="removeParked"
      @cancel="parkedToRemove = null"
    />
  </div>
</template>
