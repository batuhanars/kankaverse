<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRolesStore } from '@/stores/roles'
import { useMembersStore } from '@/stores/members'
import { rolesApi } from '@/api/roles'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvSwitch from '@/components/ui/KvSwitch.vue'
import type { GuildDto, GuildMemberDto, RoleDto } from '@/types'

const props = defineProps<{
  guild: GuildDto
  isOwner: boolean
  isAdmin: boolean
}>()

const emit = defineEmits<{
  'update:detailMode': [value: boolean]
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

// ── Mod: liste (null) ya da detay (rol ID) ───────────────────────────────
const selectedRoleId = ref<string | null>(null)
const selectedRole = computed(() => roles.value.find((r) => r.id === selectedRoleId.value) ?? null)

// Detay modunu parent'a bildir
watch(selectedRoleId, (id) => {
  emit('update:detailMode', id !== null)
})

function selectRole(id: string) {
  selectedRoleId.value = id
  errorMsg.value = ''
  activeTab.value = 'appearance'
}

function backToList() {
  selectedRoleId.value = null
  errorMsg.value = ''
}

// ── Aktif sekme (detay modunda) ───────────────────────────────────────────
type Tab = 'appearance' | 'permissions' | 'members'
const activeTab = ref<Tab>('appearance')

// ── İzin bayrakları (Faz 3) — gruplu; ADMINISTRATOR ayrıca en üstte ─────────
const PERMISSION_GROUPS: { key: string; flags: string[] }[] = [
  { key: 'general', flags: ['VIEW_CHANNELS', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'MANAGE_GUILD', 'MANAGE_EMOJIS', 'CREATE_INVITE'] },
  { key: 'membership', flags: ['KICK_MEMBERS', 'BAN_MEMBERS', 'CHANGE_NICKNAME', 'MANAGE_NICKNAMES'] },
  { key: 'message', flags: ['MANAGE_MESSAGES', 'MENTION_EVERYONE'] },
  { key: 'voice', flags: ['MUTE_MEMBERS', 'MOVE_MEMBERS', 'PRIORITY_SPEAKER'] },
]

// ── Üye arama filtresi ────────────────────────────────────────────────────
const memberSearch = ref('')
const filteredMembers = computed(() => {
  const q = memberSearch.value.trim().toLowerCase()
  if (!q) return allMembers.value
  return allMembers.value.filter((m) => m.username.toLowerCase().includes(q))
})

// ── Liste mod: rol arama ──────────────────────────────────────────────────
const roleSearch = ref('')
const everyoneRole = computed(() => roles.value.find((r) => r.isEveryone) ?? null)
const filteredRoles = computed(() => {
  const q = roleSearch.value.trim().toLowerCase()
  const nonEveryone = roles.value.filter((r) => !r.isEveryone)
  if (!q) return nonEveryone
  return nonEveryone.filter((r) => r.name.toLowerCase().includes(q))
})

// ── Taslak alanlar ────────────────────────────────────────────────────────
const draftName = ref('')
const draftColor = ref('#99aab5')
const draftHoist = ref(false)
const draftMentionable = ref(false)
const draftPermissions = ref<string[]>([])

watch(selectedRole, (role) => {
  if (!role) return
  draftName.value = role.name
  draftColor.value = role.color
  draftHoist.value = role.hoist
  draftMentionable.value = role.mentionable
  draftPermissions.value = [...role.permissions]
})

// İzin bayrağı seti değişti mi (sıra-bağımsız küme karşılaştırması)
const permsDirty = computed(() => {
  if (!selectedRole.value) return false
  const a = [...draftPermissions.value].sort()
  const b = [...selectedRole.value.permissions].sort()
  return a.length !== b.length || a.some((f, i) => f !== b[i])
})

const isDirty = computed(() =>
  selectedRole.value !== null &&
  (draftName.value !== selectedRole.value.name ||
    draftColor.value !== selectedRole.value.color ||
    draftHoist.value !== selectedRole.value.hoist ||
    draftMentionable.value !== selectedRole.value.mentionable ||
    permsDirty.value),
)

// ── İzin toggle yardımcıları ────────────────────────────────────────────────
const hasAdmin = computed(() => draftPermissions.value.includes('ADMINISTRATOR'))
function hasPerm(flag: string): boolean {
  return draftPermissions.value.includes(flag)
}
function setPerm(flag: string, on: boolean) {
  if (!canEdit.value) return
  const i = draftPermissions.value.indexOf(flag)
  if (on && i === -1) draftPermissions.value.push(flag)
  else if (!on && i !== -1) draftPermissions.value.splice(i, 1)
}

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

// ── Silme onay diyaloğu (detay modu) ─────────────────────────────────────
const showDeleteConfirm = ref(false)

// ── Liste-silme akışı ─────────────────────────────────────────────────────
const pendingDeleteRole = ref<RoleDto | null>(null)
const deletingList = ref(false)

// ── DnD sıralama ─────────────────────────────────────────────────────────
const dragRoleId = ref<string | null>(null)
const dragOverRoleId = ref<string | null>(null)

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
    // Yeni rol listeye düşer; detaya geçiş manuel (kullanıcı kartından girer).
    roleSearch.value = '' // filtre aktifse yeni rol gizlenmesin
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
      permissions: draftPermissions.value,
    }
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

// ── Rol sil (detay modu — selectedRole'a bağlı) ───────────────────────────
async function deleteRole() {
  if (!selectedRole.value) return
  errorMsg.value = ''
  deleting.value = true
  showDeleteConfirm.value = false
  try {
    await rolesApi.deleteRole(selectedRole.value.id)
    rolesStore.removeRoleLocal(guildId.value, selectedRole.value.id)
    backToList()
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e?.response?.data?.error ?? ''
    errorMsg.value = t(`guildSettings.roles.errors.${code}`) || t('guildSettings.roles.deleteError')
  } finally {
    deleting.value = false
  }
}

// ── Rol sil (liste modu) ──────────────────────────────────────────────────
async function deleteRoleFromList() {
  if (!pendingDeleteRole.value) return
  const role = pendingDeleteRole.value
  errorMsg.value = ''
  deletingList.value = true
  pendingDeleteRole.value = null
  try {
    await rolesApi.deleteRole(role.id)
    rolesStore.removeRoleLocal(guildId.value, role.id)
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e?.response?.data?.error ?? ''
    errorMsg.value = t(`guildSettings.roles.errors.${code}`) || t('guildSettings.roles.deleteError')
  } finally {
    deletingList.value = false
  }
}

// ── DnD sıralama (liste modu) ─────────────────────────────────────────────
function onRoleDragStart(e: DragEvent, role: RoleDto) {
  if (!canEdit.value) return
  dragRoleId.value = role.id
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onRoleDragEnd() {
  dragRoleId.value = null
  dragOverRoleId.value = null
}

async function dropRoleBefore(beforeRoleId: string | null) {
  const draggedId = dragRoleId.value
  onRoleDragEnd()
  if (!draggedId || !canEdit.value) return
  if (draggedId === beforeRoleId) return

  // Mevcut sıra (position DESC = görünüm sırası, üst = yüksek position)
  const list = filteredRoles.value // non-everyone, zaten DESC sıralı
  const dragged = list.find((r) => r.id === draggedId)
  if (!dragged) return

  const rest = list.filter((r) => r.id !== draggedId)
  let insertIdx = rest.length // sona ekle (en alta)
  if (beforeRoleId) {
    const i = rest.findIndex((r) => r.id === beforeRoleId)
    if (i !== -1) insertIdx = i
  }
  rest.splice(insertIdx, 0, dragged)

  // Üst = en yüksek position; toplam uzunluk - idx → üst=length, alt=1
  const items = rest.map((r, idx) => ({ id: r.id, position: rest.length - idx }))

  rolesStore.applyReorder(guildId.value, items) // optimistik
  try {
    await rolesApi.reorderRoles(guildId.value, items)
  } catch {
    await rolesStore.fetchRoles(guildId.value) // hata → sunucudan tazele
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

// Üyeleri Yönet sekmesindeki üye sayısı
const membersWithRole = computed(() => {
  if (!selectedRoleId.value) return 0
  return allMembers.value.filter((m) => hasRole(m)).length
})
</script>

<template>
  <!-- ════════════════════════════════════════════
       MOD 1 — LİSTE (selectedRoleId === null)
       ════════════════════════════════════════════ -->
  <div v-if="!selectedRoleId" class="flex flex-col gap-5 pb-4">

    <!-- Açıklama satırı -->
    <p class="text-[13px]" style="color: var(--kv-text-secondary);">
      {{ t('guildSettings.roles.listDesc') }}
    </p>

    <!-- Hata -->
    <p
      v-if="errorMsg"
      class="px-3 py-2 text-[12px] rounded-[var(--kv-radius-sm)]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-danger);"
    >
      {{ errorMsg }}
    </p>

    <!-- @everyone kartı -->
    <button
      v-if="everyoneRole"
      type="button"
      class="w-full flex items-center gap-3 px-4 py-3 rounded-[var(--kv-radius-md)] border text-left transition-colors cursor-pointer"
      style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
      @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'"
      @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
      @click="selectRole(everyoneRole!.id)"
    >
      <!-- Renk noktası -->
      <span
        class="shrink-0 w-3 h-3 rounded-full"
        :style="`background-color: ${everyoneRole.color};`"
      />
      <!-- Metinler -->
      <div class="flex-1 min-w-0">
        <p class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">
          {{ t('guildSettings.roles.everyoneCardTitle') }}
        </p>
        <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.roles.everyoneCardSubtitle') }}
        </p>
      </div>
      <!-- Chevron -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="color: var(--kv-text-muted);">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>

    <!-- Arama + Rol Oluştur -->
    <div class="flex items-center gap-3">
      <div class="flex-1">
        <KvInput
          v-model="roleSearch"
          :placeholder="t('guildSettings.roles.searchPlaceholder')"
        />
      </div>
      <KvButton v-if="canEdit" :loading="creating" @click="createRole">
        {{ t('guildSettings.roles.createButton') }}
      </KvButton>
    </div>

    <!-- Yardım metni -->
    <p class="text-[12px]" style="color: var(--kv-text-muted);">
      {{ t('guildSettings.roles.colorHint') }}
    </p>

    <!-- Tablo başlığı -->
    <div class="flex items-center px-3 py-1">
      <span class="flex-1 text-[11px] font-bold uppercase tracking-widest" style="color: var(--kv-text-muted);">
        {{ t('guildSettings.roles.rolesCountHeader') }} — {{ filteredRoles.length }}
      </span>
      <span class="text-[11px] font-bold uppercase tracking-widest shrink-0" style="color: var(--kv-text-muted);">
        {{ t('guildSettings.roles.membersHeader') }}
      </span>
    </div>

    <!-- Rol satırları -->
    <div class="flex flex-col gap-2">
      <div
        v-for="role in filteredRoles"
        :key="role.id"
        role="button"
        tabindex="0"
        class="group w-full flex items-center gap-3 px-4 py-3 rounded-[var(--kv-radius-md)] border text-left transition-colors cursor-pointer relative"
        :class="dragOverRoleId === role.id ? 'kv-drop-target' : ''"
        :style="`color: var(--kv-text-secondary); border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);${dragRoleId === role.id ? ' opacity: 0.4;' : ''}`"
        :draggable="canEdit && !roleSearch ? 'true' : 'false'"
        @mouseenter="($event.currentTarget as HTMLElement).style.borderColor = 'var(--kv-accent-subtle)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.borderColor = 'var(--kv-border-subtle)'"
        @click="selectRole(role.id)"
        @keydown.enter="selectRole(role.id)"
        @dragstart="onRoleDragStart($event, role)"
        @dragend="onRoleDragEnd"
        @dragover.prevent="dragOverRoleId = role.id"
        @dragleave="dragOverRoleId = null"
        @drop.prevent="dropRoleBefore(role.id)"
      >
        <!-- Drop indicator: üst kenar çizgisi -->
        <div
          v-if="dragOverRoleId === role.id"
          class="absolute inset-x-0 top-0 h-0.5 rounded-full pointer-events-none"
          style="background-color: var(--kv-accent-500);"
        />
        <!-- Sürükleme tutacağı (canEdit + arama yok) -->
        <span
          v-if="canEdit && !roleSearch"
          class="shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
          style="color: var(--kv-text-muted);"
          @click.stop
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
            <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
            <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
          </svg>
        </span>
        <!-- Renk noktası -->
        <span
          class="shrink-0 w-3 h-3 rounded-full"
          :style="`background-color: ${role.color};`"
        />
        <!-- Ad -->
        <span class="flex-1 text-[14px] font-medium truncate" style="color: var(--kv-text-primary);">
          {{ role.name }}
        </span>
        <!-- Üye sayısı + ikon -->
        <div class="shrink-0 flex items-center gap-1" style="color: var(--kv-text-muted);">
          <span class="text-[13px]">{{ role.memberCount }}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <!-- Aksiyon butonları (canEdit, her zaman görünür) -->
        <div
          v-if="canEdit"
          class="shrink-0 flex items-center gap-0.5"
        >
          <!-- Düzenle -->
          <button
            type="button"
            class="flex items-center justify-center w-9 h-9 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            :title="t('guildSettings.roles.editTooltip')"
            @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
            @click.stop="selectRole(role.id)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <!-- Sil (isEveryone değilse) -->
          <button
            v-if="!role.isEveryone"
            type="button"
            class="flex items-center justify-center w-9 h-9 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
            :title="t('guildSettings.roles.deleteTooltip')"
            @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-danger-subtle)'; ($event.currentTarget as HTMLElement).style.color = 'var(--kv-danger)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'; ($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-secondary)'"
            @click.stop="pendingDeleteRole = role"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
        <!-- Chevron -->
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="color: var(--kv-text-muted);">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>

      <!-- Boş durum -->
      <p
        v-if="filteredRoles.length === 0 && roleSearch"
        class="px-3 py-2 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('guildSettings.roles.noRoleSelected') }}
      </p>
    </div>
  </div>

  <!-- ════════════════════════════════════════════
       MOD 2 — DETAY (selectedRoleId !== null)
       ════════════════════════════════════════════ -->
  <div v-else class="flex min-h-0 h-full w-full">

    <!-- Sol dar kolon: GERİ + rol listesi -->
    <div
      class="shrink-0 flex flex-col border-r overflow-y-auto"
      style="width: 220px; background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
    >
      <!-- GERİ + Yeni rol oluştur -->
      <div class="flex items-center justify-between px-3 py-3 border-b shrink-0" style="border-color: var(--kv-border-subtle);">
        <button
          type="button"
          class="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-widest cursor-pointer transition-colors"
          style="color: var(--kv-text-muted);"
          @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)'"
          @click="backToList"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          {{ t('guildSettings.roles.back') }}
        </button>
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

      <!-- Rol listesi (tümü, @everyone dahil, position DESC) -->
      <div class="flex-1 overflow-y-auto py-1">
        <button
          v-for="role in roles"
          :key="role.id"
          type="button"
          class="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors cursor-pointer"
          :class="selectedRoleId === role.id ? 'bg-[var(--kv-accent-subtle)]' : 'hover:bg-[var(--kv-bg-elevated)]'"
          :style="selectedRoleId === role.id ? 'color: var(--kv-text-primary);' : 'color: var(--kv-text-secondary);'"
          @click="selectRole(role.id)"
        >
          <span class="shrink-0 w-3 h-3 rounded-full" :style="`background-color: ${role.color};`" />
          <span class="flex-1 truncate font-medium">{{ role.name }}</span>
          <svg
            v-if="role.isEveryone"
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="shrink-0" style="color: var(--kv-text-muted);"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Ana alan: editör -->
    <div class="flex-1 min-w-0 flex flex-col overflow-hidden" style="background-color: var(--kv-bg-content);">

      <!-- Dar iç kolon (max 720px, sola yaslı) -->
      <div class="flex flex-col min-h-0 flex-1 overflow-hidden" style="max-width: 720px; width: 100%;">

      <!-- Editör başlık -->
      <div
        class="shrink-0 px-8 pt-6 pb-0"
      >
        <h3 class="text-[11px] font-bold uppercase tracking-widest mb-4" style="color: var(--kv-text-muted);">
          {{ t('guildSettings.roles.editTitle', { name: selectedRole?.name ?? '' }) }}
        </h3>

        <!-- Sekmeler -->
        <div class="flex gap-0 border-b" style="border-color: var(--kv-border-subtle);">
          <button
            type="button"
            class="px-4 py-2 text-[14px] font-medium transition-colors cursor-pointer border-b-2"
            :style="activeTab === 'appearance'
              ? 'color: var(--kv-text-primary); border-color: var(--kv-accent-500);'
              : 'color: var(--kv-text-secondary); border-color: transparent;'"
            @click="activeTab = 'appearance'"
          >
            {{ t('guildSettings.roles.tabAppearance') }}
          </button>
          <button
            type="button"
            class="px-4 py-2 text-[14px] font-medium transition-colors cursor-pointer border-b-2"
            :style="activeTab === 'permissions'
              ? 'color: var(--kv-text-primary); border-color: var(--kv-accent-500);'
              : 'color: var(--kv-text-secondary); border-color: transparent;'"
            @click="activeTab = 'permissions'"
          >
            {{ t('guildSettings.roles.tabPermissions') }}
          </button>
          <button
            v-if="!selectedRole?.isEveryone"
            type="button"
            class="px-4 py-2 text-[14px] font-medium transition-colors cursor-pointer border-b-2"
            :style="activeTab === 'members'
              ? 'color: var(--kv-text-primary); border-color: var(--kv-accent-500);'
              : 'color: var(--kv-text-secondary); border-color: transparent;'"
            @click="activeTab = 'members'"
          >
            {{ t('guildSettings.roles.tabMembers') }} ({{ membersWithRole }})
          </button>
        </div>
      </div>

      <!-- İçerik alanı -->
      <div class="flex-1 overflow-y-auto px-8 py-5 flex flex-col gap-5">

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
          v-if="selectedRole?.isEveryone"
          class="px-3 py-2 text-[12px] rounded-[var(--kv-radius-sm)]"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
        >
          {{ t('guildSettings.roles.everyoneNote') }}
        </p>

        <!-- ══ GÖRÜNÜM SEKMESİ ══ -->
        <template v-if="activeTab === 'appearance'">

          <!-- ROL ADI -->
          <section v-if="!selectedRole?.isEveryone">
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
          <section v-if="!selectedRole?.isEveryone">
            <div
              class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
            >
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
                  {{ t('guildSettings.roles.hoistLabel') }}
                </p>
                <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                  {{ t('guildSettings.roles.hoistDesc') }}
                </p>
              </div>
              <KvSwitch v-model="draftHoist" :disabled="!canEdit" />
            </div>
          </section>

          <!-- MENTIONABLE -->
          <section>
            <div
              class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
            >
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
                  {{ t('guildSettings.roles.mentionableLabel') }}
                </p>
                <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                  {{ t('guildSettings.roles.mentionableDesc') }}
                </p>
              </div>
              <KvSwitch v-model="draftMentionable" :disabled="!canEdit" />
            </div>
          </section>

        </template>

        <!-- ══ İZİNLER SEKMESİ ══ -->
        <template v-if="activeTab === 'permissions'">

          <!-- ADMINISTRATOR — en üstte, uyarılı -->
          <section>
            <div
              class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
              :style="hasAdmin
                ? 'border-color: var(--kv-danger); background-color: var(--kv-danger-subtle);'
                : 'border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);'"
            >
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">
                  {{ t('guildSettings.roles.permsAdminLabel') }}
                </p>
                <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                  {{ t('guildSettings.roles.permsAdminDesc') }}
                </p>
              </div>
              <KvSwitch
                :model-value="hasAdmin"
                :disabled="!canEdit"
                @update:model-value="(v: boolean) => setPerm('ADMINISTRATOR', v)"
              />
            </div>
            <p
              v-if="hasAdmin"
              class="mt-2 px-3 py-2 text-[12px] rounded-[var(--kv-radius-sm)]"
              style="background-color: var(--kv-danger-subtle); color: var(--kv-danger);"
            >
              {{ t('guildSettings.roles.permsAdminWarning') }}
            </p>
          </section>

          <!-- Bayrak grupları -->
          <section v-for="group in PERMISSION_GROUPS" :key="group.key">
            <label class="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style="color: var(--kv-text-muted);">
              {{ t(`guildSettings.roles.permsGroups.${group.key}`) }}
            </label>
            <div class="flex flex-col gap-2">
              <div
                v-for="flag in group.flags"
                :key="flag"
                class="flex items-center justify-between gap-4 px-3 py-2.5 rounded-[var(--kv-radius-md)] border transition-opacity"
                :style="`border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);${hasAdmin ? ' opacity: 0.55;' : ''}`"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
                    {{ t(`guildSettings.roles.permsFlags.${flag}.label`) }}
                  </p>
                  <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                    {{ t(`guildSettings.roles.permsFlags.${flag}.desc`) }}
                  </p>
                </div>
                <KvSwitch
                  :model-value="hasAdmin || hasPerm(flag)"
                  :disabled="!canEdit || hasAdmin"
                  @update:model-value="(v: boolean) => setPerm(flag, v)"
                />
              </div>
            </div>
          </section>

        </template>

        <!-- ══ KAYDET / SİL (Görünüm + İzinler sekmelerinde) ══ -->
        <div
          v-if="canEdit && activeTab !== 'members'"
          class="flex items-center gap-3 mt-2 pt-4 border-t"
          style="border-color: var(--kv-border-subtle);"
        >
          <KvButton
            :disabled="!isDirty || saving || !hexValid"
            :loading="saving"
            @click="saveRole"
          >
            {{ saving ? t('guildSettings.roles.saving') : t('guildSettings.roles.saveButton') }}
          </KvButton>
          <KvButton
            v-if="!selectedRole?.isEveryone"
            variant="danger"
            :disabled="deleting"
            :loading="deleting"
            @click="showDeleteConfirm = true"
          >
            {{ deleting ? t('guildSettings.roles.deleting') : t('guildSettings.roles.deleteButton') }}
          </KvButton>
        </div>

        <!-- ══ ÜYELERİ YÖNET SEKMESİ ══ -->
        <template v-if="activeTab === 'members' && !selectedRole?.isEveryone">

          <!-- Üye arama -->
          <KvInput
            v-model="memberSearch"
            :placeholder="t('guildSettings.roles.memberSearchPlaceholder')"
          />

          <p v-if="filteredMembers.length === 0" class="text-[13px]" style="color: var(--kv-text-muted);">
            {{ t('guildSettings.roles.manageMembersEmpty') }}
          </p>

          <div v-else class="flex flex-col gap-1">
            <div
              v-for="member in filteredMembers"
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
                @click="toggleMemberRole(member)"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <path v-if="hasRole(member)" d="M20 6L9 17l-5-5"/>
                  <path v-else d="M12 5v14M5 12h14"/>
                </svg>
              </button>
            </div>
          </div>

        </template>

      </div>
      </div><!-- /dar iç kolon -->
    </div>
  </div>

  <!-- Silme onay diyaloğu (detay modu) -->
  <ConfirmDialog
    v-if="showDeleteConfirm && selectedRole"
    :title="t('guildSettings.roles.deleteConfirmTitle')"
    :message="t('guildSettings.roles.deleteConfirmMessage', { name: selectedRole.name })"
    :confirm-label="t('guildSettings.roles.deleteConfirmButton')"
    :loading="deleting"
    @confirm="deleteRole"
    @cancel="showDeleteConfirm = false"
  />

  <!-- Silme onay diyaloğu (liste modu) -->
  <ConfirmDialog
    v-if="pendingDeleteRole"
    :title="t('guildSettings.roles.deleteConfirmTitle')"
    :message="t('guildSettings.roles.deleteConfirmMessage', { name: pendingDeleteRole.name })"
    :confirm-label="t('guildSettings.roles.deleteConfirmButton')"
    :loading="deletingList"
    @confirm="deleteRoleFromList"
    @cancel="pendingDeleteRole = null"
  />
</template>
