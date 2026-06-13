<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { moderationApi } from '@/api/moderation'
import KvButton from '@/components/ui/KvButton.vue'
import type { ReportDto, CreateActionPayload, ModActionType } from '@/api/moderation'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const reports = ref<ReportDto[]>([])
const loading = ref(true)
const loadError = ref('')
const actionLoading = ref<string | null>(null) // reportId
const actionError = ref('')
const actionSuccess = ref('')

// Aksiyon formu: her rapor için ayrı state
const actionForms = ref<Record<string, { type: ModActionType; reason: string; expiresInHours: string }>>({})

const ACTION_TYPES: ModActionType[] = ['WARN', 'MUTE', 'KICK', 'BAN']

onMounted(async () => {
  // isModerator kontrolü
  if (!authStore.user?.isModerator) {
    router.replace({ name: 'app' })
    return
  }
  await loadQueue()
})

async function loadQueue() {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await moderationApi.getQueue()
    // priority descending sort
    reports.value = [...data].sort((a, b) => b.priority - a.priority)
    // Her rapor için boş form
    for (const r of reports.value) {
      if (!actionForms.value[r.id]) {
        actionForms.value[r.id] = { type: 'WARN', reason: '', expiresInHours: '' }
      }
    }
  } catch {
    loadError.value = t('moderation.loadError')
  } finally {
    loading.value = false
  }
}

async function submitAction(report: ReportDto) {
  const form = actionForms.value[report.id]
  if (!form || !form.reason.trim()) {
    actionError.value = t('moderation.reasonRequired')
    return
  }
  actionLoading.value = report.id
  actionError.value = ''
  actionSuccess.value = ''
  const payload: CreateActionPayload = {
    targetUserId: report.targetId,
    type: form.type,
    reason: form.reason.trim(),
    relatedReportId: report.id,
    expiresInHours: form.expiresInHours ? parseInt(form.expiresInHours, 10) : undefined,
  }
  try {
    await moderationApi.createAction(payload)
    actionSuccess.value = t('moderation.actionSuccess')
    // Kuyruktan kaldır
    reports.value = reports.value.filter(r => r.id !== report.id)
    setTimeout(() => { actionSuccess.value = '' }, 3000)
  } catch {
    actionError.value = t('moderation.actionError')
  } finally {
    actionLoading.value = null
  }
}

function priorityBadgeStyle(priority: number): string {
  if (priority >= 90) return 'color: #fff; background-color: var(--kv-danger);'
  if (priority >= 50) return 'color: #fff; background-color: var(--kv-warning);'
  return 'color: var(--kv-text-muted); background-color: var(--kv-bg-elevated);'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <div class="min-h-screen p-6" style="background-color: var(--kv-bg-content); color: var(--kv-text-primary);">
    <div class="max-w-4xl mx-auto">
      <!-- Başlık -->
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-[22px] font-semibold">{{ t('moderation.title') }}</h1>
        <button
          class="text-[13px] cursor-pointer hover:underline"
          style="color: var(--kv-text-muted);"
          @click="router.push({ name: 'app' })"
        >
          {{ t('moderation.backToApp') }}
        </button>
      </div>

      <!-- Yüklenme -->
      <div v-if="loading" class="text-[14px]" style="color: var(--kv-text-muted);">
        {{ t('common.loading') }}
      </div>

      <!-- Yükleme hatası -->
      <div v-else-if="loadError" class="text-[14px]" style="color: var(--kv-danger);">
        {{ loadError }}
      </div>

      <!-- Boş kuyruk -->
      <div
        v-else-if="!reports.length"
        class="text-[14px] py-8 text-center"
        style="color: var(--kv-text-muted);"
      >
        {{ t('moderation.emptyQueue') }}
      </div>

      <!-- Rapor listesi -->
      <template v-else>
        <!-- Eylem geri bildirimi -->
        <div v-if="actionSuccess" class="mb-4 px-4 py-2 rounded-[var(--kv-radius-md)] text-[13px]" style="background-color: var(--kv-success); color: #fff;">
          {{ actionSuccess }}
        </div>
        <div v-if="actionError" class="mb-4 px-4 py-2 rounded-[var(--kv-radius-md)] text-[13px]" style="background-color: var(--kv-danger); color: #fff;">
          {{ actionError }}
        </div>

        <div class="flex flex-col gap-4">
          <div
            v-for="report in reports"
            :key="report.id"
            class="rounded-[var(--kv-radius-lg)] p-4 border"
            style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
          >
            <!-- Rapor başlık satırı -->
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="flex flex-wrap items-center gap-2">
                <!-- Öncelik rozeti -->
                <span
                  class="px-2 py-0.5 rounded text-[11px] font-semibold"
                  :style="priorityBadgeStyle(report.priority)"
                >
                  P{{ report.priority }}
                </span>
                <!-- Sebep -->
                <span
                  class="px-2 py-0.5 rounded text-[12px] font-medium"
                  style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
                >
                  {{ t(`reason.${report.reason}`) }}
                </span>
                <!-- Hedef türü -->
                <span class="text-[12px]" style="color: var(--kv-text-muted);">
                  {{ t(`moderation.targetType.${report.targetType}`) }}
                </span>
              </div>
              <span class="text-[11px] shrink-0" style="color: var(--kv-text-muted);">
                {{ formatDate(report.createdAt) }}
              </span>
            </div>

            <!-- Hedef ID (kullanıcı hedefli değilse sadece ID göster) -->
            <div class="mb-2 text-[13px]" style="color: var(--kv-text-body);">
              <span style="color: var(--kv-text-muted);">{{ t('moderation.targetId') }}: </span>
              <code class="text-[12px]" style="font-family: var(--kv-font-mono);">{{ report.targetId }}</code>
            </div>

            <!-- Açıklama -->
            <div v-if="report.description" class="mb-3 text-[13px] italic" style="color: var(--kv-text-secondary);">
              "{{ report.description }}"
            </div>

            <!-- CSAM uyarısı — içerik render edilmez -->
            <div
              v-if="report.reason === 'CSAM'"
              class="mb-3 px-3 py-2 rounded-[var(--kv-radius-sm)] text-[12px] font-semibold"
              style="background-color: var(--kv-danger); color: #fff;"
            >
              {{ t('moderation.csamWarning') }}
            </div>

            <!-- Aksiyon formu (CSAM için de göster — manuel escalate) -->
            <div class="border-t pt-3 mt-1 flex flex-col gap-2" style="border-color: var(--kv-border-subtle);">
              <div class="flex flex-wrap gap-2 items-end">
                <!-- Tip seçimi -->
                <div class="flex gap-1">
                  <button
                    v-for="aType in ACTION_TYPES"
                    :key="aType"
                    type="button"
                    class="px-2 py-1 text-[12px] rounded cursor-pointer transition-colors"
                    :style="actionForms[report.id]?.type === aType
                      ? 'background-color: var(--kv-accent-500); color: #fff;'
                      : 'background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);'"
                    @click="actionForms[report.id].type = aType"
                  >
                    {{ t(`moderation.action.${aType}`) }}
                  </button>
                </div>

                <!-- Süre (MUTE/BAN için) -->
                <input
                  v-if="actionForms[report.id]?.type === 'MUTE' || actionForms[report.id]?.type === 'BAN'"
                  v-model="actionForms[report.id].expiresInHours"
                  type="number"
                  min="1"
                  :placeholder="t('moderation.expiresPlaceholder')"
                  class="px-2 py-1 rounded-[var(--kv-radius-sm)] text-[12px] border outline-none w-24"
                  style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
                />
              </div>

              <!-- Sebep input -->
              <div class="flex gap-2 items-center">
                <input
                  v-model="actionForms[report.id].reason"
                  type="text"
                  :placeholder="t('moderation.reasonPlaceholder')"
                  class="flex-1 px-3 py-1.5 rounded-[var(--kv-radius-sm)] text-[13px] border outline-none"
                  style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); color: var(--kv-text-primary);"
                />
                <KvButton
                  variant="danger"
                  size="sm"
                  :loading="actionLoading === report.id"
                  :disabled="!actionForms[report.id]?.reason?.trim()"
                  @click="submitAction(report)"
                >
                  {{ t('moderation.applyAction') }}
                </KvButton>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
