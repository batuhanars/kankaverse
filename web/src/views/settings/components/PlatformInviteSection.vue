<script setup lang="ts">
/**
 * PlatformInviteSection — Admin platform davet yönetimi (Sprint Kapalı-Kayıt §6).
 * Yalnız isModerator kullanıcıya UserSettingsView'dan erişilir; dışarıdan guard'lanır.
 * İçerik: davet oluştur (maxUses/süre/not) → dönen kodu göster + kopyala; liste; iptal.
 */
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { adminApi } from '@/api/admin'
import type { PlatformInviteDto } from '@/api/admin'
import { useToastStore } from '@/stores/toast'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const { t } = useI18n()
const toast = useToastStore()

// ── Davet oluşturma formu ──────────────────────────────────────────────────
const creating = ref(false)
const createError = ref('')
const newCode = ref<string | null>(null)

// Form alanları (hepsi opsiyonel)
const formMaxUses = ref('')
const formExpiresHours = ref('')
const formNote = ref('')

const codeSource = computed(() => newCode.value ?? '')
const { copy: copyCode, copied: codeCopied } = useClipboard({ source: codeSource })

async function createInvite() {
  creating.value = true
  createError.value = ''
  newCode.value = null
  try {
    const payload: { maxUses?: number; expiresInHours?: number; note?: string } = {}
    const maxUsesNum = parseInt(formMaxUses.value)
    if (formMaxUses.value && !isNaN(maxUsesNum) && maxUsesNum >= 1) {
      payload.maxUses = maxUsesNum
    }
    const expiresNum = parseInt(formExpiresHours.value)
    if (formExpiresHours.value && !isNaN(expiresNum) && expiresNum >= 1) {
      payload.expiresInHours = expiresNum
    }
    if (formNote.value.trim()) {
      payload.note = formNote.value.trim().slice(0, 200)
    }
    const res = await adminApi.createPlatformInvite(payload)
    newCode.value = res.data.code
    // Formu temizle ve listeyi yenile
    formMaxUses.value = ''
    formExpiresHours.value = ''
    formNote.value = ''
    await loadInvites()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    createError.value = err.response?.data?.message ?? t('admin.platformInvite.createError')
  } finally {
    creating.value = false
  }
}

// ── Davet listesi ──────────────────────────────────────────────────────────
const invites = ref<PlatformInviteDto[]>([])
const listLoading = ref(false)
const listError = ref('')

async function loadInvites() {
  listLoading.value = true
  listError.value = ''
  try {
    const res = await adminApi.listPlatformInvites()
    invites.value = res.data
  } catch {
    listError.value = t('admin.platformInvite.loadError')
  } finally {
    listLoading.value = false
  }
}

onMounted(() => {
  void loadInvites()
})

// ── Durum türetme ──────────────────────────────────────────────────────────
function inviteStatus(inv: PlatformInviteDto): 'revoked' | 'expired' | 'full' | 'active' {
  if (inv.disabledAt) return 'revoked'
  if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) return 'expired'
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return 'full'
  return 'active'
}

function statusLabel(status: ReturnType<typeof inviteStatus>): string {
  return t(`admin.platformInvite.status.${status}`)
}

function statusColor(status: ReturnType<typeof inviteStatus>): string {
  if (status === 'active') return 'var(--kv-online, #3DB46E)'
  return 'var(--kv-text-muted)'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── İptal (DELETE) ─────────────────────────────────────────────────────────
const revokeTarget = ref<PlatformInviteDto | null>(null)
const revoking = ref(false)

async function confirmRevoke() {
  if (!revokeTarget.value) return
  revoking.value = true
  try {
    await adminApi.deletePlatformInvite(revokeTarget.value.id)
    toast.success(t('admin.platformInvite.revokeSuccess'))
    revokeTarget.value = null
    await loadInvites()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('admin.platformInvite.revokeError'))
    revoking.value = false
  } finally {
    revoking.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-8 max-w-2xl">

    <!-- ── Davet Oluştur ── -->
    <section>
      <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
        {{ t('admin.platformInvite.createTitle') }}
      </h3>

      <div class="flex flex-col gap-3 rounded-[var(--kv-radius-lg)] p-4" style="background-color: var(--kv-bg-sidebar);">
        <div class="flex gap-3">
          <div class="flex-1">
            <KvInput
              v-model="formMaxUses"
              :label="t('admin.platformInvite.maxUsesLabel')"
              :placeholder="t('admin.platformInvite.maxUsesPlaceholder')"
              type="number"
            />
          </div>
          <div class="flex-1">
            <KvInput
              v-model="formExpiresHours"
              :label="t('admin.platformInvite.expiresHoursLabel')"
              :placeholder="t('admin.platformInvite.expiresHoursPlaceholder')"
              type="number"
            />
          </div>
        </div>
        <KvInput
          v-model="formNote"
          :label="t('admin.platformInvite.noteLabel')"
          :placeholder="t('admin.platformInvite.notePlaceholder')"
        />

        <p v-if="createError" class="text-[12px]" style="color: var(--kv-danger);">{{ createError }}</p>

        <KvButton :loading="creating" @click="createInvite">
          {{ t('admin.platformInvite.createButton') }}
        </KvButton>

        <!-- Oluşturulan kod gösterimi -->
        <div
          v-if="newCode"
          class="flex items-center justify-between gap-3 rounded-[var(--kv-radius-md)] px-4 py-3"
          style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-accent-500);"
        >
          <div class="flex flex-col gap-0.5 min-w-0">
            <span class="text-[10px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
              {{ t('admin.platformInvite.newCodeLabel') }}
            </span>
            <span class="text-[18px] font-mono font-bold tracking-widest" style="color: var(--kv-accent-500);">
              {{ newCode }}
            </span>
          </div>
          <KvButton variant="ghost" @click="copyCode()">
            {{ codeCopied ? t('admin.platformInvite.copied') : t('admin.platformInvite.copy') }}
          </KvButton>
        </div>
      </div>
    </section>

    <!-- ── Davet Listesi ── -->
    <section>
      <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
        {{ t('admin.platformInvite.listTitle') }}
      </h3>

      <div v-if="listLoading" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
        {{ t('common.loading') }}
      </div>
      <p v-else-if="listError" class="text-[13px]" style="color: var(--kv-danger);">{{ listError }}</p>
      <p v-else-if="invites.length === 0" class="text-[13px] py-4" style="color: var(--kv-text-muted);">
        {{ t('admin.platformInvite.empty') }}
      </p>

      <div v-else class="rounded-[var(--kv-radius-lg)] overflow-hidden divide-y divide-[color:var(--kv-border-subtle)]" style="background-color: var(--kv-bg-sidebar);">
        <div
          v-for="inv in invites"
          :key="inv.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <!-- Kod + not -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[14px] font-mono font-semibold" style="color: var(--kv-text-primary);">
                {{ inv.code }}
              </span>
              <span
                class="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                :style="`color: ${statusColor(inviteStatus(inv))}; background-color: var(--kv-bg-elevated);`"
              >
                {{ statusLabel(inviteStatus(inv)) }}
              </span>
            </div>
            <div class="flex items-center gap-3 mt-0.5 flex-wrap">
              <span class="text-[12px]" style="color: var(--kv-text-muted);">
                {{ t('admin.platformInvite.usesCount', { uses: inv.uses, max: inv.maxUses ?? '∞' }) }}
              </span>
              <span class="text-[12px]" style="color: var(--kv-text-muted);">
                {{ formatDate(inv.createdAt) }}
              </span>
              <span v-if="inv.note" class="text-[12px] truncate max-w-[160px]" :title="inv.note" style="color: var(--kv-text-muted);">
                {{ inv.note }}
              </span>
            </div>
          </div>

          <!-- İptal butonu: yalnız aktif davetlerde -->
          <button
            v-if="inviteStatus(inv) === 'active'"
            class="shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:bg-[var(--kv-bg-elevated)]"
            style="color: var(--kv-danger);"
            @click="revokeTarget = inv"
          >
            {{ t('admin.platformInvite.revoke') }}
          </button>
        </div>
      </div>
    </section>
  </div>

  <!-- İptal onay diyaloğu -->
  <ConfirmDialog
    v-if="revokeTarget"
    :title="t('admin.platformInvite.revokeConfirmTitle')"
    :message="t('admin.platformInvite.revokeConfirmMessage', { code: revokeTarget.code })"
    :confirm-label="t('admin.platformInvite.revoke')"
    :loading="revoking"
    @confirm="confirmRevoke"
    @cancel="revokeTarget = null"
  />
</template>
