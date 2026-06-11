<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { authApi } from '@/api/auth'
import type { SessionDto } from '@/types'
import KvButton from '@/components/ui/KvButton.vue'

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

onMounted(load)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3">
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
  </div>
</template>
