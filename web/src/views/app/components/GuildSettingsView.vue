<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { guildsApi, type GuildBanDto } from '@/api/guilds'
import { attachmentsApi } from '@/api/attachments'
import { invitesApi } from '@/api/invites'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvSwitch from '@/components/ui/KvSwitch.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import RolesSettingsSection from './RolesSettingsSection.vue'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import type { InviteDto, GuildDto } from '@/types'

const props = defineProps<{
  guild: GuildDto
  isOwner: boolean
  isAdmin: boolean
}>()
const emit = defineEmits<{ close: []; updated: [guild: GuildDto] }>()

const { t } = useI18n()
const guildsStore = useGuildsStore()
const router = useRouter()
const { can } = useGuildPermissions(() => props.guild.id)

// ── Aktif nav bölümü ──────────────────────────────────────────────────────
type NavSection = 'genel' | 'roller' | 'davetler' | 'yasaklar'
const activeSection = ref<NavSection>('genel')

// ── ESC tuşu ile kapat ───────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') requestClose()
}
onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  loadInvites()
  loadBans()
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  if (pendingIconPreviewUrl.value) {
    URL.revokeObjectURL(pendingIconPreviewUrl.value)
  }
})

// ── Birleşik taslak state ─────────────────────────────────────────────────
const draftName = ref(props.guild.name)
const draftAdultsOnly = ref(props.guild.adultsOnly)
const draftDescription = ref(props.guild.description ?? '')

const pendingIconFile = ref<File | null>(null)
const pendingIconRemove = ref(false)
const pendingIconPreviewUrl = ref<string | null>(null)

// ── Dirty hesaplama ───────────────────────────────────────────────────────
const isDirty = computed(() => {
  if (draftName.value.trim() !== props.guild.name) return true
  if (draftAdultsOnly.value !== props.guild.adultsOnly) return true
  if (draftDescription.value !== (props.guild.description ?? '')) return true
  if (pendingIconFile.value !== null) return true
  if (pendingIconRemove.value) return true
  return false
})

// ── İkon yükleme ──────────────────────────────────────────────────────────
const iconFileInput = ref<HTMLInputElement | null>(null)
const iconError = ref('')
const saveError = ref('')
const saving = ref(false)
const iconUploadPct = ref(0)

const ICON_MAX_BYTES = 2 * 1024 * 1024
const ICON_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const previewIconUrl = computed<string | null>(() => {
  if (pendingIconFile.value) return pendingIconPreviewUrl.value
  if (pendingIconRemove.value) return null
  return props.guild.iconUrl ?? null
})

function guildInitial(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}

function triggerIconPicker() {
  iconFileInput.value?.click()
}

function onIconFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!ICON_ACCEPTED_TYPES.includes(file.type)) {
    iconError.value = t('guildSettings.iconErrorType')
    input.value = ''
    return
  }
  if (file.size > ICON_MAX_BYTES) {
    iconError.value = t('guildSettings.iconErrorSize')
    input.value = ''
    return
  }

  if (pendingIconPreviewUrl.value) {
    URL.revokeObjectURL(pendingIconPreviewUrl.value)
  }

  iconError.value = ''
  saveError.value = ''
  pendingIconFile.value = file
  pendingIconRemove.value = false
  pendingIconPreviewUrl.value = URL.createObjectURL(file)
  input.value = ''
}

function cancelPendingIcon() {
  if (pendingIconPreviewUrl.value) {
    URL.revokeObjectURL(pendingIconPreviewUrl.value)
    pendingIconPreviewUrl.value = null
  }
  pendingIconFile.value = null
  pendingIconRemove.value = false
  iconError.value = ''
}

function markIconForRemoval() {
  cancelPendingIcon()
  pendingIconRemove.value = true
}

// ── Birleşik kaydet ──────────────────────────────────────────────────────
async function saveAll() {
  if (!isDirty.value) return
  saving.value = true
  saveError.value = ''
  iconUploadPct.value = 0

  try {
    const patch: { name?: string; adultsOnly?: boolean; description?: string } = {}
    const trimmedName = draftName.value.trim()
    if (trimmedName && trimmedName !== props.guild.name) patch.name = trimmedName
    if (draftAdultsOnly.value !== props.guild.adultsOnly) patch.adultsOnly = draftAdultsOnly.value
    if (draftDescription.value !== (props.guild.description ?? '')) patch.description = draftDescription.value

    let updated: GuildDto | null = null
    if (Object.keys(patch).length > 0) {
      updated = await guildsStore.updateGuild(props.guild.id, patch)
    }

    if (pendingIconFile.value) {
      const file = pendingIconFile.value
      const presignRes = await guildsApi.iconPresign(props.guild.id, file.type)
      const { uploadUrl, storageKey } = presignRes.data
      await attachmentsApi.uploadToS3(uploadUrl, file, (pct) => {
        iconUploadPct.value = pct
      })
      updated = await guildsStore.updateGuildIcon(props.guild.id, storageKey)
    } else if (pendingIconRemove.value) {
      updated = await guildsStore.updateGuildIcon(props.guild.id, null)
    }

    if (pendingIconPreviewUrl.value) {
      URL.revokeObjectURL(pendingIconPreviewUrl.value)
      pendingIconPreviewUrl.value = null
    }
    pendingIconFile.value = null
    pendingIconRemove.value = false

    if (updated) emit('updated', updated)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    saveError.value = err.response?.data?.message ?? t('guildSettings.saveError')
  } finally {
    saving.value = false
    iconUploadPct.value = 0
  }
}

function handleClose() {
  if (pendingIconPreviewUrl.value) {
    URL.revokeObjectURL(pendingIconPreviewUrl.value)
    pendingIconPreviewUrl.value = null
  }
  emit('close')
}

// ── Davet oluştur ─────────────────────────────────────────────────────────
const newMaxUses = ref('')
const newExpiresInHours = ref('')
const creatingInvite = ref(false)
const createError = ref('')
const createdInvite = ref<InviteDto | null>(null)

const inviteLink = computed(() => {
  if (!createdInvite.value) return ''
  return `${window.location.origin}/invite/${createdInvite.value.code}`
})

const { copy, copied } = useClipboard({ source: inviteLink })

async function createInvite() {
  creatingInvite.value = true
  createError.value = ''
  createdInvite.value = null
  try {
    const payload: { maxUses?: number; expiresInHours?: number } = {}
    const mu = parseInt(newMaxUses.value)
    if (!isNaN(mu) && mu > 0) payload.maxUses = mu
    const eh = parseInt(newExpiresInHours.value)
    if (!isNaN(eh) && eh > 0) payload.expiresInHours = eh
    const res = await invitesApi.create(props.guild.id, payload)
    createdInvite.value = res.data
    newMaxUses.value = ''
    newExpiresInHours.value = ''
    await loadInvites()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    createError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    creatingInvite.value = false
  }
}

// ── Aktif davetler ────────────────────────────────────────────────────────
const invites = ref<InviteDto[]>([])
const invitesLoading = ref(false)

async function loadInvites() {
  invitesLoading.value = true
  try {
    const res = await invitesApi.list(props.guild.id)
    invites.value = res.data
  } catch {
    // sessizce geç
  } finally {
    invitesLoading.value = false
  }
}

// ── Yasaklılar ────────────────────────────────────────────────────────────
const bans = ref<GuildBanDto[]>([])
const bansLoading = ref(false)
const unbanningId = ref<string | null>(null)

async function loadBans() {
  bansLoading.value = true
  try {
    const res = await guildsApi.getBans(props.guild.id)
    bans.value = res.data
  } catch {
    // sessizce geç
  } finally {
    bansLoading.value = false
  }
}

async function unban(userId: string) {
  unbanningId.value = userId
  try {
    await guildsApi.unbanMember(props.guild.id, userId)
    bans.value = bans.value.filter((b) => b.userId !== userId)
  } catch {
    // sessizce geç
  } finally {
    unbanningId.value = null
  }
}

// ── Davet iptal ───────────────────────────────────────────────────────────
const revokeTarget = ref<InviteDto | null>(null)
const revoking = ref(false)

async function confirmRevoke() {
  if (!revokeTarget.value) return
  revoking.value = true
  try {
    await invitesApi.revoke(revokeTarget.value.code)
    invites.value = invites.value.filter((i) => i.code !== revokeTarget.value!.code)
    if (createdInvite.value?.code === revokeTarget.value.code) createdInvite.value = null
    revokeTarget.value = null
  } catch {
    // sessizce geç
  } finally {
    revoking.value = false
  }
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return t('invite.noExpiry')
  const d = new Date(expiresAt)
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Ortamı sil ────────────────────────────────────────────────────────────
const showDeleteGuild = ref(false)
const deletingGuild = ref(false)
const deleteGuildError = ref('')

async function confirmDeleteGuild() {
  deletingGuild.value = true
  deleteGuildError.value = ''
  try {
    await guildsStore.deleteGuild(props.guild.id)
    emit('close')
    router.push({ name: 'app' })
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    deleteGuildError.value = err.response?.data?.message ?? t('common.error')
    showDeleteGuild.value = false
  } finally {
    deletingGuild.value = false
  }
}

// ── Nav item tanımları ────────────────────────────────────────────────────
interface NavItem {
  key: NavSection
  labelKey: string
  visible: boolean
  danger?: boolean
}

const navItems = computed<NavItem[]>(() => [
  { key: 'genel',    labelKey: 'guildSettings.nav.genel',    visible: props.isOwner || can('MANAGE_GUILD') },
  { key: 'roller',   labelKey: 'guildSettings.nav.roller',   visible: props.isOwner || can('MANAGE_ROLES') },
  { key: 'davetler', labelKey: 'guildSettings.nav.davetler', visible: props.isOwner || can('CREATE_INVITE') || can('MANAGE_GUILD') },
  { key: 'yasaklar', labelKey: 'guildSettings.nav.yasaklar', visible: props.isOwner || can('BAN_MEMBERS') },
])

const dangerItem = computed(() => props.isOwner)

// Görünmeyen bir bölümde kalma (örn. genel yalnız OWNER) → ilk görünür bölüme düş.
// Roller async yüklenince navItems yeniden hesaplanır; reaktif olarak düzeltilir.
watch(
  navItems,
  (items) => {
    if (!items.some((i) => i.visible && i.key === activeSection.value)) {
      const first = items.find((i) => i.visible)
      if (first) activeSection.value = first.key
    }
  },
  { immediate: true },
)

// ── Roller detay modu (nav gizleme + full-width) ──────────────────────────
const rolesDetailMode = ref(false)

// ── Roller kaydedilmemiş değişiklik guard'ı ───────────────────────────────
const rolesDirty = ref(false)
const rolesSectionRef = ref<{ reset: () => void } | null>(null)
const pendingNav = ref<NavSection | 'close' | null>(null)
const showNavConfirm = ref(false)

/** Nav bölümü değiştir; roller dirty ise önce onay iste. */
function requestNav(key: NavSection) {
  if (key === activeSection.value) return
  if (activeSection.value === 'roller' && rolesDirty.value) {
    pendingNav.value = key
    showNavConfirm.value = true
    return
  }
  activeSection.value = key
}
/** Kapat; roller dirty ise önce onay iste. */
function requestClose() {
  if (activeSection.value === 'roller' && rolesDirty.value) {
    pendingNav.value = 'close'
    showNavConfirm.value = true
    return
  }
  handleClose()
}
function confirmNavDiscard() {
  showNavConfirm.value = false
  rolesSectionRef.value?.reset()
  rolesDirty.value = false
  const target = pendingNav.value
  pendingNav.value = null
  if (target === 'close') handleClose()
  else if (target) activeSection.value = target
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex"
      style="background-color: var(--kv-bg-overlay);"
      role="dialog"
      aria-modal="true"
      :aria-label="t('guildSettings.title')"
    >
      <!-- Sol bölge: sidebar rengi tam yükseklik, nav sağa yaslı -->
      <div
        class="shrink-0 flex justify-end"
        style="width: 42%; min-width: 280px; max-width: 560px; background-color: var(--kv-bg-sidebar);"
      >
      <!-- Sol nav kolonu -->
      <div
        class="shrink-0 flex flex-col py-8 px-3 border-r"
        style="width: 220px; background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
      >
        <!-- Ortam adı başlığı -->
        <div class="px-2 mb-4">
          <p class="text-[11px] font-bold uppercase tracking-widest truncate" style="color: var(--kv-text-muted);">
            {{ guild.name }}
          </p>
        </div>

        <!-- Nav öğeleri -->
        <nav class="flex flex-col gap-0.5 flex-1">
          <template v-for="item in navItems" :key="item.key">
            <button
              v-if="item.visible"
              type="button"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] font-medium text-left cursor-pointer transition-colors"
              :class="activeSection === item.key
                ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-text-primary)]'
                : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-bg-elevated)] hover:text-[var(--kv-text-primary)]'"
              @click="requestNav(item.key)"
            >
              {{ t(item.labelKey) }}
            </button>
          </template>

          <!-- Ayraç + Tehlikeli Bölge (OWNER) -->
          <template v-if="dangerItem">
            <div class="my-2 mx-1 border-t" style="border-color: var(--kv-border-subtle);" />
            <button
              type="button"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] font-medium text-left cursor-pointer transition-colors"
              style="color: var(--kv-danger);"
              @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'rgba(242,59,75,0.1)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
              @click="showDeleteGuild = true"
            >
              {{ t('guildSettings.nav.ortamiSil') }}
            </button>
          </template>
        </nav>
      </div>
      </div>

      <!-- Sağ içerik alanı -->
      <div class="flex-1 flex flex-col overflow-hidden" style="background-color: var(--kv-bg-content);">
        <!-- İçerik header -->
        <div
          class="shrink-0 flex items-center justify-between border-b"
          style="height: var(--kv-header-height); border-color: var(--kv-border-subtle);"
        >
          <!-- İç kolon max-width sarıcısı -->
          <div class="flex items-center justify-between flex-1" style="max-width: 1000px;">
            <h2 class="text-[18px] font-semibold px-8" style="color: var(--kv-text-primary);">
              <span v-if="activeSection === 'genel'">{{ t('guildSettings.nav.genel') }}</span>
              <span v-else-if="activeSection === 'roller'">{{ t('guildSettings.nav.roller') }}</span>
              <span v-else-if="activeSection === 'davetler'">{{ t('guildSettings.nav.davetler') }}</span>
              <span v-else-if="activeSection === 'yasaklar'">{{ t('guildSettings.nav.yasaklar') }}</span>
            </h2>

            <!-- Kapat butonu + ESC göstergesi -->
            <div class="flex items-center gap-3 px-8">
              <span class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">ESC</span>
              <button
                type="button"
                class="flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
                style="width: 32px; height: 32px; color: var(--kv-text-muted);"
                :aria-label="t('common.close')"
                @click="requestClose"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Roller bölümü: tek instance, detay modunda full-width, liste modunda iç-kolon içinde -->
        <div
          v-if="activeSection === 'roller'"
          class="flex-1 flex flex-col min-h-0"
          :class="rolesDetailMode ? 'overflow-hidden' : 'overflow-y-auto'"
        >
          <!-- Sarıcı: liste modunda padding+max-width; detay modunda kaldırılır -->
          <div
            :class="rolesDetailMode ? 'flex-1 flex flex-col min-h-0' : 'px-8 py-6'"
            :style="rolesDetailMode ? '' : 'max-width: 1000px; width: 100%;'"
          >
            <RolesSettingsSection
              ref="rolesSectionRef"
              :guild="guild"
              :is-owner="isOwner"
              :is-admin="isAdmin"
              @update:detail-mode="rolesDetailMode = $event"
              @update:dirty="rolesDirty = $event"
            />
          </div>
        </div>

        <div v-else class="flex-1 overflow-y-auto">
          <div style="max-width: 1000px; width: 100%;">
            <div class="px-8 py-6">

          <!-- ── Genel bölümü ── -->
          <div v-if="activeSection === 'genel'" class="flex flex-col gap-6 max-w-xl">

            <!-- Ortam ikonu -->
            <section>
              <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.iconSection') }}
              </h3>
              <div class="flex items-center gap-4">
                <div class="shrink-0 flex items-center justify-center" style="width: 64px; height: 64px;">
                  <div
                    class="w-full h-full flex items-center justify-center overflow-hidden text-[18px] font-semibold"
                    style="
                      clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
                      background-color: var(--kv-bg-elevated);
                      color: var(--kv-text-secondary);
                    "
                  >
                    <img
                      v-if="previewIconUrl"
                      :src="previewIconUrl"
                      :alt="draftName || guild.name"
                      class="w-full h-full object-cover"
                    />
                    <span v-else>{{ guildInitial(draftName || guild.name) }}</span>
                  </div>
                </div>

                <div class="flex flex-col gap-2">
                  <div v-if="!pendingIconFile && !pendingIconRemove" class="flex gap-2">
                    <KvButton size="sm" :disabled="saving" @click="triggerIconPicker">
                      {{ t('guildSettings.iconUpload') }}
                    </KvButton>
                    <KvButton
                      v-if="guild.iconUrl"
                      size="sm"
                      variant="danger"
                      :disabled="saving"
                      @click="markIconForRemoval"
                    >
                      {{ t('guildSettings.iconRemove') }}
                    </KvButton>
                  </div>

                  <div v-else class="flex flex-col gap-1.5">
                    <p class="text-[12px]" style="color: var(--kv-text-muted);">
                      <span v-if="pendingIconFile">{{ t('guildSettings.iconPending') }}</span>
                      <span v-else>{{ t('guildSettings.iconRemovePending') }}</span>
                    </p>
                    <div class="flex gap-2">
                      <KvButton size="sm" :disabled="saving" @click="triggerIconPicker">
                        {{ t('guildSettings.iconUpload') }}
                      </KvButton>
                      <KvButton size="sm" variant="danger" :disabled="saving" @click="cancelPendingIcon">
                        {{ t('guildSettings.iconCancelPending') }}
                      </KvButton>
                    </div>
                  </div>

                  <p v-if="iconError" class="text-[12px]" style="color: var(--kv-danger);">{{ iconError }}</p>
                </div>
              </div>

              <input
                ref="iconFileInput"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                class="hidden"
                @change="onIconFileChange"
              />
            </section>

            <!-- Ad düzenle -->
            <section>
              <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.nameSection') }}
              </h3>
              <KvInput
                v-model="draftName"
                :label="t('guildSettings.nameLabel')"
                :placeholder="t('guild.namePlaceholder')"
                :disabled="saving"
              />
            </section>

            <!-- adultsOnly toggle -->
            <section>
              <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.adultsOnlySection') }}
              </h3>
              <div
                class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
                style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
                    {{ t('guildSettings.adultsOnlyLabel') }}
                  </p>
                  <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                    {{ t('guildSettings.adultsOnlyDesc') }}
                  </p>
                  <p v-if="!isOwner" class="text-[12px] mt-1" style="color: var(--kv-text-muted);">
                    {{ t('guildSettings.adultsOnlyOwnerOnly') }}
                  </p>
                </div>
                <KvSwitch v-model="draftAdultsOnly" :disabled="saving || !isOwner" />
              </div>
            </section>

            <!-- Ortam açıklaması -->
            <section>
              <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-1" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.descriptionSection') }}
              </h3>
              <p class="text-[12px] mb-3" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.descriptionSubtitle') }}
              </p>
              <textarea
                v-model="draftDescription"
                :placeholder="t('guildSettings.descriptionPlaceholder')"
                :disabled="saving"
                rows="5"
                maxlength="2000"
                class="w-full resize-none rounded-[var(--kv-radius-md)] border px-3 py-2 text-[14px] outline-none transition-colors"
                style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
              />
            </section>

            <!-- Kaydet / hata -->
            <div class="flex items-center justify-between gap-3 mt-2 pt-4 border-t" style="border-color: var(--kv-border-subtle);">
              <p v-if="saveError" class="text-[12px] flex-1" style="color: var(--kv-danger);">{{ saveError }}</p>
              <p v-else-if="saving && iconUploadPct > 0" class="text-[12px] flex-1" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.iconUploading', { pct: iconUploadPct }) }}
              </p>
              <span v-else class="flex-1" />
              <KvButton
                :disabled="!isDirty || saving"
                :loading="saving"
                @click="saveAll"
              >
                {{ saving ? t('guildSettings.saving') : t('guildSettings.saveAll') }}
              </KvButton>
            </div>
          </div>

          <!-- ── Davetler bölümü ── -->
          <div v-else-if="activeSection === 'davetler'" class="flex flex-col gap-6 max-w-xl">
            <section>
              <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.inviteSection') }}
              </h3>

              <!-- Davet oluştur formu (CREATE_INVITE) -->
              <form v-if="isOwner || can('CREATE_INVITE')" class="flex flex-wrap gap-2 items-end mb-4" @submit.prevent="createInvite">
                <div style="width: 100px;">
                  <KvInput
                    v-model="newMaxUses"
                    :label="t('invite.maxUsesLabel')"
                    :placeholder="t('invite.maxUsesPlaceholder')"
                    type="number"
                  />
                </div>
                <div style="width: 120px;">
                  <KvInput
                    v-model="newExpiresInHours"
                    :label="t('invite.expiresInHoursLabel')"
                    :placeholder="t('invite.expiresInHoursPlaceholder')"
                    type="number"
                  />
                </div>
                <KvButton type="submit" :loading="creatingInvite">
                  {{ t('invite.createButton') }}
                </KvButton>
              </form>
              <p v-if="createError" class="text-[12px] mb-3" style="color: var(--kv-danger);">{{ createError }}</p>

              <!-- Yeni oluşturulan davet linki -->
              <div
                v-if="createdInvite"
                class="flex items-center gap-2 px-3 py-2.5 mb-4 rounded-[var(--kv-radius-md)] border"
                style="border-color: var(--kv-accent-500); background-color: var(--kv-bg-elevated);"
              >
                <span class="flex-1 text-[13px] font-mono truncate" style="color: var(--kv-text-primary);">
                  {{ inviteLink }}
                </span>
                <KvButton size="sm" @click="copy()">
                  {{ copied ? t('invite.copied') : t('invite.copy') }}
                </KvButton>
              </div>

              <!-- Aktif davetler (listele/iptal → MANAGE_GUILD) -->
              <template v-if="isOwner || can('MANAGE_GUILD')">
              <div v-if="invitesLoading" class="text-[13px]" style="color: var(--kv-text-muted);">
                {{ t('common.loading') }}
              </div>
              <div v-else-if="invites.length === 0" class="text-[13px]" style="color: var(--kv-text-muted);">
                {{ t('invite.noActiveInvites') }}
              </div>
              <ul v-else class="flex flex-col gap-2">
                <li
                  v-for="inv in invites"
                  :key="inv.code"
                  class="flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-md)] border"
                  style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
                >
                  <code class="flex-1 text-[13px] font-mono" style="color: var(--kv-text-primary);">{{ inv.code }}</code>
                  <span class="text-[12px] shrink-0" style="color: var(--kv-text-muted);">
                    {{ t('invite.usesCount', { uses: inv.uses, max: inv.maxUses ?? '∞' }) }}
                  </span>
                  <span class="text-[12px] shrink-0" style="color: var(--kv-text-muted);">
                    {{ formatExpiry(inv.expiresAt) }}
                  </span>
                  <KvButton size="sm" variant="danger" @click="revokeTarget = inv">
                    {{ t('invite.revoke') }}
                  </KvButton>
                </li>
              </ul>
              </template>
            </section>
          </div>

          <!-- ── Yasaklar bölümü ── -->
          <div v-else-if="activeSection === 'yasaklar'" class="flex flex-col gap-6 max-w-xl">
            <section>
              <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.bansSection') }}
              </h3>
              <p v-if="bansLoading" class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('common.loading') }}</p>
              <p v-else-if="bans.length === 0" class="text-[13px]" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.bansEmpty') }}
              </p>
              <ul v-else class="flex flex-col gap-1.5">
                <li
                  v-for="b in bans"
                  :key="b.userId"
                  class="flex items-center gap-2.5 px-3 py-2 rounded-[var(--kv-radius-md)] border"
                  style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
                >
                  <div
                    class="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold text-white"
                    style="background-color: var(--kv-accent-500);"
                  >
                    <img v-if="b.avatarUrl" :src="b.avatarUrl" :alt="b.username" class="w-full h-full object-cover" />
                    <span v-else>{{ b.username[0]?.toUpperCase() }}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-[14px] truncate" style="color: var(--kv-text-primary);">{{ b.username }}</p>
                    <p v-if="b.reason" class="text-[12px] truncate" style="color: var(--kv-text-muted);">{{ b.reason }}</p>
                  </div>
                  <KvButton variant="ghost" :loading="unbanningId === b.userId" @click="unban(b.userId)">
                    {{ t('guildSettings.unban') }}
                  </KvButton>
                </li>
              </ul>
            </section>
          </div>

            </div><!-- /px-8 py-6 -->
          </div><!-- /max-width kolon -->
        </div><!-- /flex-1 overflow-y-auto (else) -->
      </div><!-- /sağ içerik alanı -->
    </div><!-- /fixed dialog -->

    <!-- Davet iptal onay diyaloğu -->
    <ConfirmDialog
      v-if="revokeTarget"
      :title="t('invite.revokeConfirmTitle')"
      :message="t('invite.revokeConfirmMessage', { code: revokeTarget.code })"
      :confirm-label="t('invite.revoke')"
      :loading="revoking"
      @confirm="confirmRevoke"
      @cancel="revokeTarget = null"
    />

    <!-- Ortamı sil onay diyaloğu -->
    <ConfirmDialog
      v-if="showDeleteGuild"
      :title="t('guildSettings.deleteConfirmTitle')"
      :message="t('guildSettings.deleteConfirmMessage', { name: guild.name })"
      :confirm-label="t('guildSettings.deleteConfirmButton')"
      :loading="deletingGuild"
      @confirm="confirmDeleteGuild"
      @cancel="showDeleteGuild = false"
    />

    <!-- Roller: kaydedilmemiş değişiklikle nav/kapat onayı -->
    <ConfirmDialog
      v-if="showNavConfirm"
      :title="t('guildSettings.roles.unsavedTitle')"
      :message="t('guildSettings.roles.unsavedMessage')"
      :confirm-label="t('guildSettings.roles.discardButton')"
      @confirm="confirmNavDiscard"
      @cancel="showNavConfirm = false; pendingNav = null"
    />
  </Teleport>
</template>
