<script setup lang="ts">
/**
 * PlatformFunnelSection — Admin huni paneli (Sprint C17). Yalnız toplam sayılar; kişi bazlı veri yok.
 * Yalnız isModerator kullanıcıya UserSettingsView admin sekmesinden erişilir; dışarıdan guard'lanır.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi } from '@/api/admin'
import type { FunnelDto } from '@/api/admin'

const { t } = useI18n()

const COHORTS = [0, 30, 90] as const
const STEP_KEYS = [
  'registered',
  'joinedGuild',
  'sentMessage',
  'returnedNextDay',
  'returnedAfter7Days',
  'activeOn3Days',
] as const

const cohortDays = ref<number>(0)
const funnel = ref<FunnelDto | null>(null)
const loading = ref(false)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await adminApi.getFunnel(cohortDays.value)
    funnel.value = res.data
  } catch {
    loadError.value = t('admin.funnel.loadError')
  } finally {
    loading.value = false
  }
}

function selectCohort(days: number) {
  cohortDays.value = days
  void load()
}

onMounted(() => {
  void load()
})

const total = computed(() => funnel.value?.steps.registered ?? 0)

// Kayıt 0 ise yüzde yok (bölme yok)
function percent(count: number): number {
  return total.value > 0 ? Math.round((count / total.value) * 100) : 0
}

const updatedAt = computed(() => {
  if (!funnel.value) return ''
  return new Date(funnel.value.generatedAt)
    .toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    .replace(':', '.')
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h3 class="text-[13px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
        {{ t('admin.funnel.title') }}
      </h3>
      <button
        class="text-[12px] font-medium px-3 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
        style="color: var(--kv-accent-500);"
        :disabled="loading"
        @click="load"
      >
        {{ t('admin.users.refresh') }}
      </button>
    </div>

    <!-- Kohort seçici -->
    <div class="flex flex-wrap items-center gap-1 self-start rounded-[var(--kv-radius-md)] p-1" style="background-color: var(--kv-bg-sidebar);">
      <button
        v-for="days in COHORTS"
        :key="days"
        type="button"
        class="px-3 py-1.5 rounded-[var(--kv-radius-sm)] text-[13px] font-medium cursor-pointer transition-colors"
        :style="cohortDays === days
          ? 'color: var(--kv-accent-400); background-color: var(--kv-bg-elevated);'
          : 'color: var(--kv-text-secondary); background-color: transparent;'"
        @click="selectCohort(days)"
      >
        {{ t(`admin.funnel.cohort.${days}`) }}
      </button>
    </div>

    <div v-if="loading && !funnel" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
      {{ t('common.loading') }}
    </div>
    <p v-else-if="loadError" class="text-[13px]" style="color: var(--kv-danger);">{{ loadError }}</p>
    <p v-else-if="funnel && total === 0" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
      {{ t('admin.funnel.empty') }}
    </p>

    <template v-else-if="funnel">
      <div
        class="rounded-[var(--kv-radius-lg)] overflow-hidden divide-y divide-[color:var(--kv-border-subtle)]"
        style="background-color: var(--kv-bg-sidebar);"
      >
        <div v-for="key in STEP_KEYS" :key="key" class="flex flex-col gap-1.5 px-4 py-3">
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-[14px] font-semibold min-w-0 truncate" style="color: var(--kv-text-primary);">
              {{ t(`admin.funnel.steps.${key}`) }}
            </span>
            <span class="text-[13px] shrink-0" style="color: var(--kv-text-secondary);">
              {{ funnel.steps[key] }}
              <span class="ml-1" style="color: var(--kv-text-muted);">%{{ percent(funnel.steps[key]) }}</span>
            </span>
          </div>
          <div class="h-2 rounded-full overflow-hidden" style="background-color: var(--kv-bg-elevated);">
            <div
              class="h-full rounded-full"
              :style="`width: ${percent(funnel.steps[key])}%; background-color: var(--kv-accent-500);`"
            />
          </div>
        </div>
      </div>

      <!-- Aktiflik: kohorttan bağımsız -->
      <div class="rounded-[var(--kv-radius-lg)] px-4 py-3 flex flex-col gap-2" style="background-color: var(--kv-bg-sidebar);">
        <h4 class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('admin.funnel.activityTitle') }}
        </h4>
        <div class="flex flex-wrap gap-x-6 gap-y-1 text-[13px]" style="color: var(--kv-text-secondary);">
          <span>{{ t('admin.funnel.activeLast7Days') }}: <b style="color: var(--kv-text-primary);">{{ funnel.activity.activeLast7Days }}</b></span>
          <span>{{ t('admin.funnel.activeLast30Days') }}: <b style="color: var(--kv-text-primary);">{{ funnel.activity.activeLast30Days }}</b></span>
          <span>{{ t('admin.funnel.registeredLast7Days') }}: <b style="color: var(--kv-text-primary);">{{ funnel.activity.registeredLast7Days }}</b></span>
        </div>
      </div>

      <p class="text-[12px]" style="color: var(--kv-text-muted);">
        {{ t('admin.funnel.updatedAt', { time: updatedAt }) }}
      </p>
    </template>
  </div>
</template>
