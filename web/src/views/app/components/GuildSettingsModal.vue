<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { guildsApi, type GuildBanDto } from '@/api/guilds'
import { attachmentsApi } from '@/api/attachments'
import { invitesApi } from '@/api/invites'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { InviteDto, GuildDto } from '@/types'

const props = defineProps<{ guild: GuildDto }>()
const emit = defineEmits<{ close: []; updated: [guild: GuildDto] }>()

const { t } = useI18n()
const guildsStore = useGuildsStore()
const router = useRouter()

// ── Birleşik taslak state ──────────────────────────────────────────────────

const draftName = ref(props.guild.name)
const draftAdultsOnly = ref(props.guild.adultsOnly)
const draftRules = ref(props.guild.rules ?? '')

// Bekleyen ikon state: null = değişiklik yok, File = yeni dosya, 'remove' = kaldır
const pendingIconFile = ref<File | null>(null)
const pendingIconRemove = ref(false)
// Yerel önizleme için object URL (yalnızca pendingIconFile varken)
const pendingIconPreviewUrl = ref<string | null>(null)

// ── Dirty hesaplama ────────────────────────────────────────────────────────

const isDirty = computed(() => {
  if (draftName.value.trim() !== props.guild.name) return true
  if (draftAdultsOnly.value !== props.guild.adultsOnly) return true
  if (draftRules.value !== (props.guild.rules ?? '')) return true
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

const ICON_MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ICON_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// İkon önizlemesi: bekleyen dosya varsa yerel URL, kaldır işaretliyse null, yoksa mevcut URL
const previewIconUrl = computed<string | null>(() => {
  if (pendingIconFile.value) return pendingIconPreviewUrl.value
  if (pendingIconRemove.value) return null
  return props.guild.iconUrl ?? null
})

// İkon için baş harfler
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

  // İstemci kontrolü
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

  // Önceki object URL'i temizle
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

// Object URL'i component unmount'ta temizle
onUnmounted(() => {
  if (pendingIconPreviewUrl.value) {
    URL.revokeObjectURL(pendingIconPreviewUrl.value)
  }
})

// ── Birleşik kaydet ────────────────────────────────────────────────────────

async function saveAll() {
  if (!isDirty.value) return
  saving.value = true
  saveError.value = ''
  iconUploadPct.value = 0

  try {
    // 1. Ad / adultsOnly / rules değiştiyse tek PATCH
    const patch: { name?: string; adultsOnly?: boolean; rules?: string } = {}
    const trimmedName = draftName.value.trim()
    if (trimmedName && trimmedName !== props.guild.name) patch.name = trimmedName
    if (draftAdultsOnly.value !== props.guild.adultsOnly) patch.adultsOnly = draftAdultsOnly.value
    if (draftRules.value !== (props.guild.rules ?? '')) patch.rules = draftRules.value

    let updated: GuildDto | null = null
    if (Object.keys(patch).length > 0) {
      updated = await guildsStore.updateGuild(props.guild.id, patch)
    }

    // 2. Bekleyen ikon varsa yükle
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

    // 3. Başarı: object URL temizle ve kapat
    if (pendingIconPreviewUrl.value) {
      URL.revokeObjectURL(pendingIconPreviewUrl.value)
      pendingIconPreviewUrl.value = null
    }
    pendingIconFile.value = null
    pendingIconRemove.value = false

    if (updated) emit('updated', updated)
    emit('close')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    saveError.value = err.response?.data?.message ?? t('guildSettings.saveError')
    // Modal AÇIK kalır — hata gösterilir
  } finally {
    saving.value = false
    iconUploadPct.value = 0
  }
}

function handleClose() {
  // Kaydedilmemiş değişiklikleri at, object URL temizle
  if (pendingIconPreviewUrl.value) {
    URL.revokeObjectURL(pendingIconPreviewUrl.value)
    pendingIconPreviewUrl.value = null
  }
  emit('close')
}

// ── Davet oluştur ──────────────────────────────────────────────────────────

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

// ── Aktif davetler ─────────────────────────────────────────────────────────

const invites = ref<InviteDto[]>([])
const invitesLoading = ref(false)

async function loadInvites() {
  invitesLoading.value = true
  try {
    const res = await invitesApi.list(props.guild.id)
    invites.value = res.data
  } catch {
    // sessizce geç — liste boş kalır
  } finally {
    invitesLoading.value = false
  }
}

// ── Yasaklılar ─────────────────────────────────────────────────────────────

const bans = ref<GuildBanDto[]>([])
const bansLoading = ref(false)
const unbanningId = ref<string | null>(null)

async function loadBans() {
  bansLoading.value = true
  try {
    const res = await guildsApi.getBans(props.guild.id)
    bans.value = res.data
  } catch {
    // sessizce geç (yetki yoksa veya hata)
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

onMounted(() => {
  loadInvites()
  loadBans()
})

// ── Davet iptal ────────────────────────────────────────────────────────────

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
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Ortamı sil ─────────────────────────────────────────────────────────────

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
</script>

<template>
  <KvModal :title="t('guildSettings.title')" @close="handleClose">
    <div class="flex flex-col gap-6">

      <!-- ── 0. Ortam ikonu ── -->
      <section>
        <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.iconSection') }}
        </h3>
        <div class="flex items-center gap-4">
          <!-- Altıgen önizleme -->
          <div
            class="shrink-0 flex items-center justify-center"
            style="width: 64px; height: 64px;"
          >
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

          <!-- Butonlar + hata -->
          <div class="flex flex-col gap-2">
            <!-- Bekleyen ikon yok -->
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

            <!-- Bekleyen ikon var -->
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

        <!-- Gizli dosya girişi -->
        <input
          ref="iconFileInput"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          class="hidden"
          @change="onIconFileChange"
        />
      </section>

      <!-- ── 1. Ad düzenle ── -->
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

      <!-- ── 2. adultsOnly toggle ── -->
      <section>
        <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.adultsOnlySection') }}
        </h3>
        <div class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border" style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);">
          <div class="flex-1 min-w-0">
            <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
              {{ t('guildSettings.adultsOnlyLabel') }}
            </p>
            <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
              {{ t('guildSettings.adultsOnlyDesc') }}
            </p>
          </div>
          <!-- Toggle button — sadece taslak state değiştirir, kaydetmez -->
          <button
            type="button"
            :disabled="saving"
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50"
            :style="draftAdultsOnly ? 'background-color: var(--kv-accent-500);' : 'background-color: var(--kv-bg-rail);'"
            @click="draftAdultsOnly = !draftAdultsOnly"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
              :class="draftAdultsOnly ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>
      </section>

      <!-- ── 3. Ortam kuralları ── -->
      <section>
        <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.rulesSection') }}
        </h3>
        <textarea
          v-model="draftRules"
          :placeholder="t('guildSettings.rulesPlaceholder')"
          :disabled="saving"
          rows="5"
          maxlength="2000"
          class="w-full resize-none rounded-[var(--kv-radius-md)] border px-3 py-2 text-[14px] outline-none transition-colors"
          style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
        />
      </section>

      <!-- ── Birleşik kaydet / hata ── -->
      <div class="flex items-center justify-between gap-3 pt-1 border-t" style="border-color: var(--kv-border-subtle);">
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

      <!-- ── 4. Davet yönetimi ── -->
      <section>
        <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.inviteSection') }}
        </h3>

        <!-- Davet oluştur formu -->
        <form class="flex flex-wrap gap-2 items-end mb-4" @submit.prevent="createInvite">
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

        <!-- Aktif davetler -->
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
      </section>

      <!-- ── 4.5 Yasaklılar ── -->
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
            <div class="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold text-white" style="background-color: var(--kv-accent-500);">
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

      <!-- ── 5. Ortamı Sil ── -->
      <section>
        <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-danger);">
          {{ t('guildSettings.deleteSection') }}
        </h3>
        <div
          class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
          style="border-color: var(--kv-danger); background-color: var(--kv-bg-elevated);"
        >
          <div class="flex-1 min-w-0">
            <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
              {{ t('guildSettings.deleteLabel') }}
            </p>
            <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
              {{ t('guildSettings.deleteDesc') }}
            </p>
          </div>
          <KvButton variant="danger" :disabled="saving" @click="showDeleteGuild = true">
            {{ t('guildSettings.deleteButton') }}
          </KvButton>
        </div>
        <p v-if="deleteGuildError" class="text-[12px] mt-2" style="color: var(--kv-danger);">{{ deleteGuildError }}</p>
      </section>

    </div>
  </KvModal>

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
</template>
