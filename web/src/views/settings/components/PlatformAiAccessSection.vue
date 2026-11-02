<script setup lang="ts">
/**
 * PlatformAiAccessSection — Admin yapay zeka video erişim hakları (C40).
 * Yalnız isModerator kullanıcıya UserSettingsView admin sekmesinden erişilir; dışarıdan guard'lanır.
 * Liste + "Erişim ver" / "Yenile" (AiGrantFormModal) + onaylı "İptal et". Not yalnız burada görünür.
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminApi } from '@/api/admin'
import type { AiVideoGrantRowDto, AiGrantStatus, AiVideoBalanceDto } from '@/api/admin'
import { useToastStore } from '@/stores/toast'
import KvButton from '@/components/ui/KvButton.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import AiGrantFormModal from './AiGrantFormModal.vue'
import AiGrantAdjustModal from './AiGrantAdjustModal.vue'

const { t } = useI18n()
const toast = useToastStore()

const rows = ref<AiVideoGrantRowDto[]>([])
const loading = ref(false)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    rows.value = (await adminApi.listAiVideoGrants()).data
  } catch {
    loadError.value = t('admin.aiAccess.loadError')
  } finally {
    loading.value = false
  }
}

// ── Pika bakiyesi (C45) ──
const balance = ref<AiVideoBalanceDto | null>(null)
const balanceLoading = ref(false)
const balanceError = ref(false)

async function loadBalance() {
  balanceLoading.value = true
  balanceError.value = false
  try {
    balance.value = (await adminApi.getAiVideoBalance()).data
  } catch {
    balanceError.value = true
  } finally {
    balanceLoading.value = false
  }
}
// Bakiye kartındaki "harcanmamış" toplamı tablodan türediği için ikisi hep birlikte çekilir.
async function refreshAll() {
  await Promise.all([load(), loadBalance()])
}
const refreshing = computed(() => loading.value || balanceLoading.value)
onMounted(() => void refreshAll())

const nf = new Intl.NumberFormat('tr-TR')
const usdFormat = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const balanceShort = computed(() => !!balance.value && balance.value.outstandingCredits > balance.value.balanceCredits)
const fetchedTime = computed(() =>
  balance.value
    ? new Date(balance.value.fetchedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
    : '',
)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function statusColor(s: AiGrantStatus): string {
  return s === 'ACTIVE' ? 'var(--kv-online, #3DB46E)' : 'var(--kv-text-muted)'
}

// ── Ver / yenile ──
const formOpen = ref(false)
const renewing = ref<AiVideoGrantRowDto | null>(null)
function openForm(row: AiVideoGrantRowDto | null) {
  renewing.value = row
  formOpen.value = true
}
async function onSaved() {
  formOpen.value = false
  await refreshAll()
}

// ── Kredi ayarla (C47): yalnız etkin / biten hak; dönem açmaz ──
const adjusting = ref<AiVideoGrantRowDto | null>(null)
async function onAdjusted() {
  adjusting.value = null
  await refreshAll()
}
const canAdjust = (r: AiVideoGrantRowDto) => r.status === 'ACTIVE' || r.status === 'EXHAUSTED'
const canRenew = (r: AiVideoGrantRowDto) => r.status === 'EXPIRED' || r.status === 'REVOKED'
const takenUserIds = computed(() => rows.value.map((r) => r.user.id))

// ── İptal ──
const revokeTarget = ref<AiVideoGrantRowDto | null>(null)
const revoking = ref(false)
async function confirmRevoke() {
  if (!revokeTarget.value) return
  revoking.value = true
  try {
    await adminApi.revokeAiVideoGrant(revokeTarget.value.user.id)
    toast.success(t('admin.aiAccess.revokeSuccess'))
    revokeTarget.value = null
    await refreshAll()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('admin.aiAccess.revokeError'))
  } finally {
    revoking.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4 max-w-2xl">
    <div class="flex items-center justify-between">
      <h3 class="text-[13px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
        {{ t('admin.aiAccess.title') }}
      </h3>
      <div class="flex items-center gap-2">
        <KvButton size="sm" variant="ghost" :disabled="refreshing" @click="refreshAll">
          {{ t('admin.aiAccess.refresh') }}
        </KvButton>
        <KvButton size="sm" @click="openForm(null)">{{ t('admin.aiAccess.give') }}</KvButton>
      </div>
    </div>

    <div
      class="flex items-start gap-3 rounded-[var(--kv-radius-lg)] px-4 py-3"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <div class="flex-1 min-w-0">
        <p v-if="balanceError" class="text-[14px] font-semibold" style="color: var(--kv-danger);">
          {{ t('admin.aiAccess.balance.error') }}
        </p>
        <template v-else-if="balance">
          <p class="text-[16px] font-semibold tabular-nums" style="color: var(--kv-text-primary);">
            {{ t('admin.aiAccess.balance.label', { usd: usdFormat.format(balance.balanceUsd), credits: nf.format(balance.balanceCredits) }) }}
          </p>
          <p
            class="text-[13px] mt-0.5 tabular-nums"
            :style="{ color: balanceShort ? 'var(--kv-warning)' : 'var(--kv-text-muted)' }"
          >
            {{ t('admin.aiAccess.balance.outstanding', { credits: nf.format(balance.outstandingCredits) }) }}
            <template v-if="balanceShort"> {{ t('admin.aiAccess.balance.short') }}</template>
          </p>
          <p class="text-[11px] mt-1" style="color: var(--kv-text-muted);">
            {{ t('admin.aiAccess.balance.updatedAt', { time: fetchedTime }) }}
          </p>
        </template>
        <p v-else class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('common.loading') }}</p>
      </div>
    </div>

    <p v-if="loading && rows.length === 0" class="text-[13px] py-4" style="color: var(--kv-text-muted);">{{ t('common.loading') }}</p>
    <p v-else-if="loadError" class="text-[13px]" style="color: var(--kv-danger);">{{ loadError }}</p>
    <p v-else-if="rows.length === 0" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
      {{ t('admin.aiAccess.empty') }}
    </p>

    <div
      v-else
      class="rounded-[var(--kv-radius-lg)] overflow-hidden divide-y divide-[color:var(--kv-border-subtle)]"
      style="background-color: var(--kv-bg-sidebar);"
    >
      <div v-for="r in rows" :key="r.user.id" class="flex items-center gap-3 px-4 py-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">{{ r.user.username }}</span>
            <span
              class="text-[11px] font-semibold px-1.5 py-0.5 rounded"
              :style="{ color: statusColor(r.status), backgroundColor: 'var(--kv-bg-elevated)' }"
            >
              {{ t(`admin.aiAccess.status.${r.status}`) }}
            </span>
          </div>
          <div class="flex items-center gap-3 mt-0.5 flex-wrap">
            <span class="text-[12px] tabular-nums" style="color: var(--kv-text-muted);">
              {{ t('admin.aiAccess.creditsValue', { spent: r.spentCredits, budget: r.budgetCredits }) }}
            </span>
            <span class="text-[12px]" style="color: var(--kv-text-muted);">
              {{ r.expiresAt ? formatDate(r.expiresAt) : t('admin.aiAccess.noExpiry') }}
            </span>
            <span v-if="r.note" class="text-[12px] truncate max-w-[200px]" :title="r.note" style="color: var(--kv-text-muted);">
              {{ r.note }}
            </span>
          </div>
        </div>
        <button
          v-if="canAdjust(r)"
          type="button"
          class="shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-accent-400);"
          @click="adjusting = r"
        >
          {{ t('admin.aiAccess.adjust') }}
        </button>
        <button
          v-if="canRenew(r)"
          type="button"
          class="shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-accent-400);"
          @click="openForm(r)"
        >
          {{ t('admin.aiAccess.renew') }}
        </button>
        <button
          v-if="r.status !== 'REVOKED'"
          type="button"
          class="shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
          style="color: var(--kv-danger);"
          @click="revokeTarget = r"
        >
          {{ t('admin.aiAccess.revoke') }}
        </button>
      </div>
    </div>
  </div>

  <AiGrantFormModal
    v-if="formOpen"
    :renewing="renewing"
    :taken-user-ids="takenUserIds"
    @close="formOpen = false"
    @saved="onSaved"
  />
  <AiGrantAdjustModal v-if="adjusting" :grant="adjusting" @close="adjusting = null" @saved="onAdjusted" />

  <ConfirmDialog
    v-if="revokeTarget"
    :title="t('admin.aiAccess.revokeConfirmTitle')"
    :message="t('admin.aiAccess.revokeConfirmMessage', { username: revokeTarget.user.username })"
    :confirm-label="t('admin.aiAccess.revoke')"
    :loading="revoking"
    @confirm="confirmRevoke"
    @cancel="revokeTarget = null"
  />
</template>
