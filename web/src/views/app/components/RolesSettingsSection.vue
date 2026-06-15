<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRolesStore } from '@/stores/roles'
import { useMembersStore } from '@/stores/members'
import { rolesApi } from '@/api/roles'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import KvButton from '@/components/ui/KvButton.vue'
import type { GuildDto, GuildMemberDto } from '@/types'

const props = defineProps<{
  guild: GuildDto
  isOwner: boolean
  isAdmin: boolean
}>()

const { t } = useI18n()
const rolesStore = useRolesStore()
const membersStore = useMembersStore()

const guildId = computed(() => props.guild.id)
const roles = computed(() => rolesStore.rolesFor(guildId.value))
const allMembers = computed(() => membersStore.membersFor(guildId.value))

onMounted(() => {
  rolesStore.fetchRoles(guildId.value).catch(() => {})
})

// ── Seçili rol state ──────────────────────────────────────────────────────
const selectedRoleId = ref<string | null>(null)
const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value) ?? null)

// ── Taslak alanlar ────────────────────────────────────────────────────────
const draftName = ref('')
const draftColor = ref('#99aab5')
const draftHoist = ref(false)
const draftMentionable = ref(false)

watch(selectedRole, (role) => {
  if (!role) return
  draftName.value = role.name
  draftColor.value = role.color
  draftHoist.value = role.hoist
  draftMentionable.value = role.mentionable
})

const isDirty = computed(() =>
  selectedRole.value !== null &&
  (draftName.value !== selectedRole.value.name ||
    draftColor.value !== selectedRole.value.color ||
    draftHoist.value !== selectedRole.value.hoist ||
    draftMentionable.value !== selectedRole.value.mentionable),
)

// ── Renk ──────────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  '#99aab5',
  '#1abc9c',
  '#2ecc71',
  '#3498db',
  '#9b59b6',
  '#e91e63',
  '#f1c40f',
  '#e67e22',
  '#e74c3c',
  '#ff6b3d',
]
const hexValid = computed(() => /^#[0-9a-fA-F]{6}$/.test(draftColor.value))

// ── Hata/loading state ────────────────────────────────────────────────────
const errorMsg = ref('')
const creating = ref(false)
const saving = ref(false)
const deleting = ref(false)

// ── Silme onay diyaloğu ───────────────────────────────────────────────────
const showDeleteConfirm = ref(false)

// ── Yetki ─────────────────────────────────────────────────────────────────
const canEdit = computed(() => props.isOwner || props.isAdmin)

// ── Rol oluştur ───────────────────────────────────────────────────────────
async function createRole() {
  errorMsg.value = ''
  creating.value = true
  try {
    const res = await rolesApi.createRole(guildId.value, {
      name: t('guildSettings.roles.newRoleName'),
    })
    rolesStore.upsertRole(guildId.value, res.data)
    selectedRoleId.value = res.data.id
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e?.response?.data?.error ?? ''
    errorMsg.value = t(`guildSettings.roles.errors.${code}`) || t('guildSettings.roles.createButton')
  } finally {
    creating.value = false
  }
}

// ── Rol kaydet ────────────────────────────────────────────────────────────
async function saveRole() {
  if (!selectedRole.value || !isDirty.value) return
  errorMsg.value = ''
  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      color: draftColor.value,
      hoist: draftHoist.value,
      mentionable: draftMentionable.value,
    }
    // @everyone için ad ve hoist değiştirilemiyor
    if (!selectedRole.value.isEveryone) {
      payload.name = draftName.value
    }
    const res = await rolesApi.updateRole(selectedRole.value.id, payload)
    rolesStore.upsertRole(guildId.value, res.data)
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e?.response?.data?.error ?? ''
    errorMsg.value = t(`guildSettings.roles.errors.${code}`) || t('guildSettings.roles.saveError')
  } finally {
    saving.value = false
  }
}

// ── Rol sil ───────────────────────────────────────────────────────────────
async function deleteRole() {
  if (!selectedRole.value) return
  errorMsg.value = ''
  deleting.value = true
  showDeleteConfirm.value = false
  try {
    await rolesApi.deleteRole(selectedRole.value.id)
    rolesStore.removeRoleLocal(guildId.value, selectedRole.value.id)
    selectedRoleId.value = null
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e?.response?.data?.error ?? ''
    errorMsg.value = t(`guildSettings.roles.errors.${code}`) || t('guildSettings.roles.deleteError')
  } finally {
    deleting.value = false
  }
}

// ── Üye rol toggle ────────────────────────────────────────────────────────
function hasRole(member: GuildMemberDto): boolean {
  return member.roles.some((r) => r.id === selectedRoleId.value)
}

async function toggleMemberRole(member: GuildMemberDto) {
  if (!selectedRoleId.value) return
  errorMsg.value = ''
  try {
    if (hasRole(member)) {
      const res = await rolesApi.removeRole(selectedRoleId.value, member.userId)
      membersStore.updateMember(guildId.value, res.data)
    } else {
      const res = await rolesApi.assignRole(selectedRoleId.value, member.userId)
      membersStore.updateMember(guildId.value, res.data)
    }
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e?.response?.data?.error ?? ''
    errorMsg.value = t(`guildSettings.roles.errors.${code}`) || t('guildSettings.roles.assignError')
  }
}
</script>

<template>
  <div class="flex gap-0 h-full min-h-0" style="border-radius: var(--kv-radius-lg); overflow: hidden;">
    <!-- Sol sütun: rol listesi -->
    <div
      class="flex flex-col shrink-0 border-r"
      style="min-width: 180px; max-width: 220px; width: 200px; background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
    >
      <!-- Başlık + oluştur butonu -->
      <div class="flex items-center justify-between px-3 py-3 border-b" style="border-color: var(--kv-border-subtle);">
        <span class="text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.nav.roller') }}
        </span>
        <button
          v-if="canEdit"
          :disabled="creating"
          class="flex items-center justify-center w-5 h-5 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-muted);"
          :title="t('guildSettings.roles.createButton')"
          @click="createRole"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </div>

      <!-- Rol listesi -->
      <div class="flex-1 overflow-y-auto py-1">
        <button
          v-for="role in roles"
          :key="role.id"
          class="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors cursor-pointer"
          :class="selectedRoleId === role.id ? 'bg-[var(--kv-accent-subtle)]' : 'hover:bg-[var(--kv-bg-elevated)]'"
          :style="selectedRoleId === role.id ? 'color: var(--kv-text-primary);' : 'color: var(--kv-text-secondary);'"
          @click="selectedRoleId = role.id; errorMsg = ''"
        >
          <!-- Renk noktası -->
          <span
            class="shrink-0 w-3 h-3 rounded-full"
            :style="`background-color: ${role.color};`"
          />
          <!-- Ad -->
          <span class="flex-1 truncate font-medium">{{ role.name }}</span>
          <!-- Üye sayısı -->
          <span class="shrink-0 text-[11px]" style="color: var(--kv-text-muted);">{{ role.memberCount }}</span>
          <!-- @everyone kilit ikonu -->
          <svg
            v-if="role.isEveryone"
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="shrink-0"
            style="color: var(--kv-text-muted);"
            :title="t('guildSettings.roles.lockBadge')"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Sağ sütun: rol editörü -->
    <div class="flex-1 min-w-0 overflow-y-auto px-6 py-5 flex flex-col gap-5" style="background-color: var(--kv-bg-content);">

      <!-- Seçim yok -->
      <div
        v-if="!selectedRole"
        class="flex items-center justify-center flex-1"
        style="color: var(--kv-text-muted);"
      >
        <p class="text-[13px]">{{ t('guildSettings.roles.noRoleSelected') }}</p>
      </div>

      <template v-else>
        <!-- Hata -->
        <p
          v-if="errorMsg"
          class="px-3 py-2 text-[12px] rounded-[var(--kv-radius-sm)]"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-danger);"
        >
          {{ errorMsg }}
        </p>

        <!-- @everyone uyarısı -->
        <p
          v-if="selectedRole.isEveryone"
          class="px-3 py-2 text-[12px] rounded-[var(--kv-radius-sm)]"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
        >
          {{ t('guildSettings.roles.everyoneNote') }}
        </p>

        <!-- ROL ADI -->
        <section v-if="!selectedRole.isEveryone">
          <label class="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
            {{ t('guildSettings.roles.nameLabel') }}
          </label>
          <input
            v-model="draftName"
            type="text"
            :disabled="!canEdit"
            :placeholder="t('guildSettings.roles.namePlaceholder')"
            class="w-full max-w-xs rounded-[var(--kv-radius-md)] border px-3 py-2 text-[14px] outline-none transition-colors"
            style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
          />
        </section>

        <!-- ROL RENGİ -->
        <section>
          <label class="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
            {{ t('guildSettings.roles.colorLabel') }}
          </label>
          <!-- Renk swatchları -->
          <div class="flex flex-wrap gap-2 mb-2">
            <button
              v-for="preset in COLOR_PRESETS"
              :key="preset"
              class="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer"
              :style="`background-color: ${preset}; border-color: ${draftColor === preset ? 'var(--kv-text-primary)' : 'transparent'};`"
              :disabled="!canEdit"
              @click="draftColor = preset"
            />
          </div>
          <!-- Özel hex -->
          <div class="flex items-center gap-2 mt-1">
            <label class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('guildSettings.roles.colorCustomLabel') }}</label>
            <input
              v-model="draftColor"
              type="text"
              :disabled="!canEdit"
              :placeholder="t('guildSettings.roles.colorPlaceholder')"
              maxlength="7"
              class="w-28 rounded-[var(--kv-radius-sm)] border px-2 py-1 text-[13px] font-mono outline-none transition-colors"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
            />
            <!-- Önizleme -->
            <span
              v-if="hexValid"
              class="w-5 h-5 rounded-full border"
              :style="`background-color: ${draftColor}; border-color: var(--kv-border-subtle);`"
            />
          </div>
          <p v-if="!hexValid && draftColor !== ''" class="mt-1 text-[11px]" style="color: var(--kv-danger);">
            {{ t('guildSettings.roles.colorInvalid') }}
          </p>
        </section>

        <!-- HOIST -->
        <section v-if="!selectedRole.isEveryone">
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              v-model="draftHoist"
              type="checkbox"
              :disabled="!canEdit"
              class="w-4 h-4 rounded cursor-pointer"
              style="accent-color: var(--kv-accent-500);"
            />
            <div>
              <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
                {{ t('guildSettings.roles.hoistLabel') }}
              </p>
              <p class="text-[12px]" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.roles.hoistDesc') }}
              </p>
            </div>
          </label>
        </section>

        <!-- MENTIONABLE -->
        <section>
          <label class="flex items-center gap-3 cursor-pointer">
            <input
              v-model="draftMentionable"
              type="checkbox"
              :disabled="!canEdit"
              class="w-4 h-4 rounded cursor-pointer"
              style="accent-color: var(--kv-accent-500);"
            />
            <div>
              <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
                {{ t('guildSettings.roles.mentionableLabel') }}
              </p>
              <p class="text-[12px]" style="color: var(--kv-text-muted);">
                {{ t('guildSettings.roles.mentionableDesc') }}
              </p>
            </div>
          </label>
        </section>

        <!-- Kaydet / Sil butonları -->
        <div v-if="canEdit" class="flex items-center gap-3 pt-1 border-t" style="border-color: var(--kv-border-subtle);">
          <KvButton
            :disabled="!isDirty || saving || !hexValid"
            :loading="saving"
            @click="saveRole"
          >
            {{ saving ? t('guildSettings.roles.saving') : t('guildSettings.roles.saveButton') }}
          </KvButton>
          <KvButton
            v-if="!selectedRole.isEveryone"
            variant="danger"
            :disabled="deleting"
            :loading="deleting"
            @click="showDeleteConfirm = true"
          >
            {{ deleting ? t('guildSettings.roles.deleting') : t('guildSettings.roles.deleteButton') }}
          </KvButton>
        </div>

        <!-- ── Üyeleri Yönet ── -->
        <section v-if="!selectedRole.isEveryone && canEdit" class="pt-2 border-t" style="border-color: var(--kv-border-subtle);">
          <h3 class="text-[11px] font-semibold uppercase tracking-widest mb-3" style="color: var(--kv-text-muted);">
            {{ t('guildSettings.roles.manageMembersTitle') }}
          </h3>

          <p v-if="allMembers.length === 0" class="text-[13px]" style="color: var(--kv-text-muted);">
            {{ t('guildSettings.roles.manageMembersEmpty') }}
          </p>

          <div v-else class="flex flex-col gap-1">
            <div
              v-for="member in allMembers"
              :key="member.userId"
              class="flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-sm)] border"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
            >
              <!-- Avatar -->
              <div
                class="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold overflow-hidden shrink-0"
                style="background-color: var(--kv-accent-500); color: #fff;"
              >
                <img
                  v-if="member.avatarUrl"
                  :src="member.avatarUrl"
                  :alt="member.username"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ member.username.charAt(0).toUpperCase() }}</span>
              </div>
              <!-- Ad -->
              <span class="flex-1 text-[13px] truncate" style="color: var(--kv-text-primary);">
                {{ member.username }}
              </span>
              <!-- Toggle -->
              <button
                class="shrink-0 w-5 h-5 rounded-[var(--kv-radius-sm)] border flex items-center justify-center transition-colors cursor-pointer"
                :style="hasRole(member)
                  ? 'background-color: var(--kv-accent-500); border-color: var(--kv-accent-500); color: #fff;'
                  : 'background-color: transparent; border-color: var(--kv-border-subtle); color: var(--kv-text-muted);'"
                :title="hasRole(member) ? t('guildSettings.roles.deleteButton') : t('guildSettings.roles.createButton')"
                @click="toggleMemberRole(member)"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <path v-if="hasRole(member)" d="M20 6L9 17l-5-5"/>
                  <path v-else d="M12 5v14M5 12h14"/>
                </svg>
              </button>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>

  <!-- Silme onay diyaloğu -->
  <ConfirmDialog
    v-if="showDeleteConfirm && selectedRole"
    :title="t('guildSettings.roles.deleteConfirmTitle')"
    :message="t('guildSettings.roles.deleteConfirmMessage', { name: selectedRole.name })"
    :confirm-label="t('guildSettings.roles.deleteConfirmButton')"
    :loading="deleting"
    @confirm="deleteRole"
    @cancel="showDeleteConfirm = false"
  />
</template>
