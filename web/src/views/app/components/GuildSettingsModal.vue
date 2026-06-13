<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@vueuse/core'
import { useGuildsStore } from '@/stores/guilds'
import { guildsApi } from '@/api/guilds'
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

// ── İkon yükleme ──
const iconFileInput = ref<HTMLInputElement | null>(null)
const iconUploading = ref(false)
const iconUploadPct = ref(0)
const iconError = ref('')

const ICON_MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ICON_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function triggerIconPicker() {
  iconFileInput.value?.click()
}

async function onIconFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // istemci kontrolü
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

  iconError.value = ''
  iconUploading.value = true
  iconUploadPct.value = 0

  try {
    const presignRes = await guildsApi.iconPresign(props.guild.id, file.type)
    const { uploadUrl, storageKey } = presignRes.data

    await attachmentsApi.uploadToS3(uploadUrl, file, (pct) => {
      iconUploadPct.value = pct
    })

    const updated = await guildsStore.updateGuildIcon(props.guild.id, storageKey)
    emit('updated', updated)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    iconError.value = err.response?.data?.message ?? t('guildSettings.iconErrorUpload')
  } finally {
    iconUploading.value = false
    iconUploadPct.value = 0
    input.value = ''
  }
}

async function removeIcon() {
  iconError.value = ''
  iconUploading.value = true
  try {
    const updated = await guildsStore.updateGuildIcon(props.guild.id, null)
    emit('updated', updated)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    iconError.value = err.response?.data?.message ?? t('guildSettings.iconErrorUpload')
  } finally {
    iconUploading.value = false
  }
}

function guildInitialForPreview(name: string): string {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}

// ── Ad düzenle ──
const editName = ref(props.guild.name)
const nameError = ref('')
const nameSaving = ref(false)

async function saveName() {
  const n = editName.value.trim()
  if (!n || n === props.guild.name) return
  nameSaving.value = true
  nameError.value = ''
  try {
    const updated = await guildsStore.updateGuild(props.guild.id, { name: n })
    emit('updated', updated)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    nameError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    nameSaving.value = false
  }
}

// ── adultsOnly toggle ──
const adultsOnly = ref(props.guild.adultsOnly)
const adultsOnlySaving = ref(false)
const adultsOnlyError = ref('')

async function toggleAdultsOnly() {
  adultsOnlySaving.value = true
  adultsOnlyError.value = ''
  const next = !adultsOnly.value
  try {
    const updated = await guildsStore.updateGuild(props.guild.id, { adultsOnly: next })
    adultsOnly.value = updated.adultsOnly
    emit('updated', updated)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    adultsOnlyError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    adultsOnlySaving.value = false
  }
}

// ── Ortam kuralları ──
const editRules = ref(props.guild.rules ?? '')
const rulesSaving = ref(false)
const rulesError = ref('')
const rulesSaved = ref(false)

async function saveRules() {
  rulesSaving.value = true
  rulesError.value = ''
  rulesSaved.value = false
  try {
    const updated = await guildsStore.updateGuild(props.guild.id, { rules: editRules.value })
    editRules.value = updated.rules ?? ''
    rulesSaved.value = true
    emit('updated', updated)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    rulesError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    rulesSaving.value = false
  }
}

// ── Davet oluştur ──
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

// ── Aktif davetler ──
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

onMounted(loadInvites)

// ── İptal ──
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
</script>

<template>
  <KvModal :title="t('guildSettings.title')" @close="emit('close')">
    <div class="flex flex-col gap-6">

      <!-- ── 0. Ortam ikonu ── -->
      <section>
        <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.iconSection') }}
        </h3>
        <div class="flex items-center gap-4">
          <!-- Altıgen önizleme -->
          <div
            class="shrink-0 flex items-center justify-content center"
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
                v-if="guild.iconUrl"
                :src="guild.iconUrl"
                :alt="guild.name"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ guildInitialForPreview(guild.name) }}</span>
            </div>
          </div>

          <!-- Butonlar + hata -->
          <div class="flex flex-col gap-2">
            <div class="flex gap-2">
              <KvButton
                size="sm"
                :loading="iconUploading"
                :disabled="iconUploading"
                @click="triggerIconPicker"
              >
                {{ iconUploading ? t('guildSettings.iconUploading', { pct: iconUploadPct }) : t('guildSettings.iconUpload') }}
              </KvButton>
              <KvButton
                v-if="guild.iconUrl"
                size="sm"
                variant="danger"
                :disabled="iconUploading"
                @click="removeIcon"
              >
                {{ t('guildSettings.iconRemove') }}
              </KvButton>
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
        <form class="flex gap-2 items-end" @submit.prevent="saveName">
          <div class="flex-1">
            <KvInput
              v-model="editName"
              :label="t('guildSettings.nameLabel')"
              :placeholder="t('guild.namePlaceholder')"
              :error="nameError"
            />
          </div>
          <KvButton type="submit" :loading="nameSaving" :disabled="!editName.trim() || editName.trim() === guild.name">
            {{ t('common.save') }}
          </KvButton>
        </form>
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
            <p v-if="adultsOnlyError" class="text-[12px] mt-1" style="color: var(--kv-danger);">{{ adultsOnlyError }}</p>
          </div>
          <!-- Toggle button -->
          <button
            type="button"
            :disabled="adultsOnlySaving"
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50"
            :style="adultsOnly ? 'background-color: var(--kv-accent-500);' : 'background-color: var(--kv-bg-rail);'"
            @click="toggleAdultsOnly"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
              :class="adultsOnly ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>
      </section>

      <!-- ── 3. Ortam kuralları ── -->
      <section>
        <h3 class="text-[13px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.rulesSection') }}
        </h3>
        <form class="flex flex-col gap-2" @submit.prevent="saveRules">
          <textarea
            v-model="editRules"
            :placeholder="t('guildSettings.rulesPlaceholder')"
            rows="5"
            maxlength="2000"
            class="w-full resize-none rounded-[var(--kv-radius-md)] border px-3 py-2 text-[14px] outline-none transition-colors"
            style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
          />
          <p v-if="rulesError" class="text-[12px]" style="color: var(--kv-danger);">{{ rulesError }}</p>
          <p v-if="rulesSaved" class="text-[12px]" style="color: var(--kv-success, #3DB46E);">{{ t('common.save') }} ✓</p>
          <div class="flex justify-end">
            <KvButton type="submit" :loading="rulesSaving">
              {{ t('guildSettings.rulesSave') }}
            </KvButton>
          </div>
        </form>
      </section>

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

    </div>
  </KvModal>

  <!-- İptal onay diyaloğu -->
  <ConfirmDialog
    v-if="revokeTarget"
    :title="t('invite.revokeConfirmTitle')"
    :message="t('invite.revokeConfirmMessage', { code: revokeTarget.code })"
    :confirm-label="t('invite.revoke')"
    :loading="revoking"
    @confirm="confirmRevoke"
    @cancel="revokeTarget = null"
  />
</template>
