<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRolesStore } from '@/stores/roles'
import { useMembersStore } from '@/stores/members'
import { useToastStore } from '@/stores/toast'
import { rolesApi } from '@/api/roles'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import KvButton from '@/components/ui/KvButton.vue'
import KvInput from '@/components/ui/KvInput.vue'
import KvSwitch from '@/components/ui/KvSwitch.vue'
import type { GuildDto, RoleDto } from '@/types'

const props = defineProps<{
  guild: GuildDto
  isOwner: boolean
  isAdmin: boolean
}>()

const emit = defineEmits<{
  'update:detailMode': [value: boolean]
  'update:dirty': [value: boolean]
}>()

const { t } = useI18n()
const rolesStore = useRolesStore()
const membersStore = useMembersStore()
const toast = useToastStore()

const guildId = computed(() => props.guild.id)
const roles = computed(() => rolesStore.rolesFor(guildId.value))
const allMembers = computed(() => membersStore.membersFor(guildId.value))

onMounted(() => {
  rolesStore.fetchRoles(guildId.value).catch(() => {})
  // Üye yönetimi sekmesi için üye listesi (zaten yüklüyse no-op)
  membersStore.fetchMembers(guildId.value).catch(() => {})
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

// Listeye dön. Kaydedilmemiş değişiklik varsa önce onay iste.
const showLeaveConfirm = ref(false)
function backToList() {
  if (isDirty.value) {
    showLeaveConfirm.value = true
    return
  }
  selectedRoleId.value = null
  errorMsg.value = ''
}
function confirmLeave() {
  showLeaveConfirm.value = false
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

// ── Üye yönetimi (batch: pendingAdd/pendingRemove diff) ─────────────────────
// Üye değişiklikleri anında değil, "Değişiklikleri Kaydet" ile uygulanır.
// Diff modeli geç-yüklenen üye listesine dayanıklıdır (initial reaktif).
const memberSearch = ref('')
const pendingAdd = ref<Set<string>>(new Set())
const pendingRemove = ref<Set<string>>(new Set())

// Rolün sunucudaki mevcut üyeleri (reaktif — kaydedince güncellenir)
const initialMemberIds = computed<Set<string>>(() => {
  const role = selectedRole.value
  if (!role) return new Set()
  return new Set(allMembers.value.filter((m) => m.roles.some((r) => r.id === role.id)).map((m) => m.userId))
})

// Kaydedildiğinde role sahip olacak üye kümesi (initial + bekleyen ekle − bekleyen çıkar)
const effectiveMemberIds = computed<Set<string>>(() => {
  const s = new Set(initialMemberIds.value)
  for (const id of pendingAdd.value) s.add(id)
  for (const id of pendingRemove.value) s.delete(id)
  return s
})

// Üyeleri Yönet sekmesinde gösterilen liste: yalnız role sahip (efektif) üyeler + arama
const roleMembers = computed(() => {
  const q = memberSearch.value.trim().toLowerCase()
  const list = allMembers.value.filter((m) => effectiveMemberIds.value.has(m.userId))
  if (!q) return list
  return list.filter((m) => m.username.toLowerCase().includes(q))
})

function removeMemberFromRole(userId: string) {
  if (!canEdit.value) return
  if (initialMemberIds.value.has(userId)) {
    pendingRemove.value = new Set(pendingRemove.value).add(userId)
  } else {
    const next = new Set(pendingAdd.value)
    next.delete(userId)
    pendingAdd.value = next
  }
}
function addMemberToRole(userId: string) {
  if (!canEdit.value) return
  if (initialMemberIds.value.has(userId)) {
    const next = new Set(pendingRemove.value)
    next.delete(userId)
    pendingRemove.value = next
  } else {
    pendingAdd.value = new Set(pendingAdd.value).add(userId)
  }
}

const membersDirty = computed(() => pendingAdd.value.size > 0 || pendingRemove.value.size > 0)

// ── Üye Ekle modalı ─────────────────────────────────────────────────────────
const showAddMember = ref(false)
const addMemberSearch = ref('')
const addableMembers = computed(() => {
  const q = addMemberSearch.value.trim().toLowerCase()
  const list = allMembers.value.filter((m) => !effectiveMemberIds.value.has(m.userId))
  if (!q) return list
  return list.filter((m) => m.username.toLowerCase().includes(q))
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
const draftIsDefault = ref(false)
const draftPermissions = ref<string[]>([])

// Seçili rol değişince taslakları sıfırla (bekleyen üye değişikliklerini de)
watch(selectedRoleId, () => {
  const role = selectedRole.value
  pendingAdd.value = new Set()
  pendingRemove.value = new Set()
  memberSearch.value = ''
  if (!role) return
  draftName.value = role.name
  draftColor.value = role.color
  draftHoist.value = role.hoist
  draftMentionable.value = role.mentionable
  draftIsDefault.value = role.isDefault
  draftPermissions.value = [...role.permissions]
})

// İzin bayrağı seti değişti mi (sıra-bağımsız küme karşılaştırması)
const permsDirty = computed(() => {
  if (!selectedRole.value) return false
  const a = [...draftPermissions.value].sort()
  const b = [...selectedRole.value.permissions].sort()
  return a.length !== b.length || a.some((f, i) => f !== b[i])
})

const appearanceDirty = computed(() =>
  selectedRole.value !== null &&
  (draftName.value !== selectedRole.value.name ||
    draftColor.value !== selectedRole.value.color ||
    draftHoist.value !== selectedRole.value.hoist ||
    draftMentionable.value !== selectedRole.value.mentionable ||
    draftIsDefault.value !== selectedRole.value.isDefault),
)

const isDirty = computed(() =>
  selectedRole.value !== null && (appearanceDirty.value || permsDirty.value || membersDirty.value),
)

// Üst bileşene (GuildSettingsView) dirty durumunu bildir → nav/kapat guard'ı
watch(isDirty, (v) => emit('update:dirty', v))

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

// ── Yetki (izin-tabanlı; backend MANAGE_ROLES + hiyerarşiyi zorlar) ─────────
const { can, hasAll } = useGuildPermissions(() => guildId.value)
const canEdit = computed(() => props.isOwner || can('MANAGE_ROLES'))

// F1 UX: aktör yalnız KENDİ sahip olduğu izinleri verebilir (backend CANNOT_GRANT_PERMISSION).
// Zaten role atanmış bir bayrağı (kaldırma için) toggle'lamak serbest; yeni eklemek izin ister.
function canToggleFlag(flag: string): boolean {
  if (!canEdit.value) return false
  if (hasAll.value) return true // owner / enum-admin / ADMINISTRATOR-sahibi → her izni verebilir
  if (can(flag)) return true // aktör bu izne sahip → verebilir
  return selectedRole.value?.permissions.includes(flag) ?? false // yoksa yalnız mevcut bayrağı kaldırabilir
}

// ── Rol oluştur ───────────────────────────────────────────────────────────
async function createRole() {
  errorMsg.value = ''
  creating.value = true
  try {
    const res = await rolesApi.createRole(guildId.value, {
      name: t('guildSettings.roles.newRoleName'),
    })
    rolesStore.upsertRole(guildId.value, res.data)
    selectRole(res.data.id) // yeni rolün detayına gir (düzenlemeye hazır)
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e?.response?.data?.error ?? ''
    errorMsg.value = t(`guildSettings.roles.errors.${code}`) || t('guildSettings.roles.createButton')
  } finally {
    creating.value = false
  }
}

// ── Birleşik kaydet (görünüm + izinler + üye diff, tek butondan) ────────────
async function saveAll() {
  const role = selectedRole.value
  if (!role || !isDirty.value) return
  errorMsg.value = ''
  saving.value = true
  try {
    // 1) Rol alanları (görünüm + izinler) değiştiyse PATCH
    if (appearanceDirty.value || permsDirty.value) {
      const payload: Record<string, unknown> = {
        color: draftColor.value,
        mentionable: draftMentionable.value,
        permissions: draftPermissions.value,
      }
      // @everyone: name/hoist/isDefault GÖNDERİLMEZ — backend bunları @everyone'da reddeder
      // (payload'da hoist olması mentionable kaydını da düşürüyordu — Görsel #36 bug'ı).
      if (!role.isEveryone) {
        payload.name = draftName.value
        payload.hoist = draftHoist.value
        payload.isDefault = draftIsDefault.value
      }
      const res = await rolesApi.updateRole(role.id, payload)
      rolesStore.upsertRole(guildId.value, res.data)
    }
    // 2) Üye diff: önce çıkarılanlar, sonra eklenenler (hiyerarşi backend'de zorlanır)
    for (const userId of pendingRemove.value) {
      const res = await rolesApi.removeRole(role.id, userId)
      membersStore.updateMember(guildId.value, res.data)
    }
    for (const userId of pendingAdd.value) {
      const res = await rolesApi.assignRole(role.id, userId)
      membersStore.updateMember(guildId.value, res.data)
    }
    pendingAdd.value = new Set()
    pendingRemove.value = new Set()
    toast.success(t('toast.rolesSaved'))
  } catch (err: unknown) {
    const e = err as { response?: { data?: { error?: string } } }
    const code = e?.response?.data?.error ?? ''
    errorMsg.value = t(`guildSettings.roles.errors.${code}`) || t('guildSettings.roles.saveError')
    toast.error(errorMsg.value)
  } finally {
    saving.value = false
  }
}

// ── Sıfırla (tüm taslakları sunucu durumuna döndür) ────────────────────────
function reset() {
  const role = selectedRole.value
  pendingAdd.value = new Set()
  pendingRemove.value = new Set()
  errorMsg.value = ''
  if (!role) return
  draftName.value = role.name
  draftColor.value = role.color
  draftHoist.value = role.hoist
  draftMentionable.value = role.mentionable
  draftIsDefault.value = role.isDefault
  draftPermissions.value = [...role.permissions]
}

// Üst bileşenin nav/kapat guard'ında çağırabilmesi için
defineExpose({ reset, discardAndLeave: confirmLeave })

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

// Üyeleri Yönet sekmesindeki üye sayısı (efektif = initial + bekleyen diff)
const membersWithRole = computed(() => effectiveMemberIds.value.size)
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
        <!-- Varsayılan rol rozeti -->
        <span
          v-if="role.isDefault"
          class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
        >{{ t('guildSettings.roles.defaultBadge') }}</span>
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

      <!-- İçerik alanı — alt boşluk: yüzen kaydet barı son satırı kapatmasın (Görsel #31) -->
      <div class="flex-1 overflow-y-auto px-8 pt-5 pb-28 flex flex-col gap-5">

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

          <!-- VARSAYILAN ROL — yeni katılan üyelere otomatik atanır (@everyone hariç) -->
          <section v-if="!selectedRole?.isEveryone">
            <div
              class="flex items-center justify-between gap-4 px-3 py-3 rounded-[var(--kv-radius-md)] border"
              style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-elevated);"
            >
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium" style="color: var(--kv-text-primary);">
                  {{ t('guildSettings.roles.defaultLabel') }}
                </p>
                <p class="text-[12px] mt-0.5" style="color: var(--kv-text-muted);">
                  {{ t('guildSettings.roles.defaultDesc') }}
                </p>
              </div>
              <KvSwitch v-model="draftIsDefault" :disabled="!canEdit" />
            </div>
          </section>

          <!-- Rolü Sil — destructive, taslak-kaydından bağımsız -->
          <section
            v-if="canEdit && !selectedRole?.isEveryone"
            class="pt-4 mt-2 border-t"
            style="border-color: var(--kv-border-subtle);"
          >
            <KvButton variant="danger" :disabled="deleting" :loading="deleting" @click="showDeleteConfirm = true">
              {{ deleting ? t('guildSettings.roles.deleting') : t('guildSettings.roles.deleteButton') }}
            </KvButton>
          </section>

        </template>

        <!-- ══ İZİNLER SEKMESİ ══ -->
        <template v-if="activeTab === 'permissions'">

          <!-- F1: aktör tüm izinlere sahip değilse "veremezsin" notu -->
          <p
            v-if="canEdit && !hasAll"
            class="px-3 py-2 text-[12px] rounded-[var(--kv-radius-sm)]"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
          >
            {{ t('guildSettings.roles.permsGrantHint') }}
          </p>

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
                :disabled="!canToggleFlag('ADMINISTRATOR')"
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
                  :disabled="hasAdmin || !canToggleFlag(flag)"
                  @update:model-value="(v: boolean) => setPerm(flag, v)"
                />
              </div>
            </div>
          </section>

        </template>

        <!-- ══ ÜYELERİ YÖNET SEKMESİ ══ -->
        <template v-if="activeTab === 'members' && !selectedRole?.isEveryone">

          <!-- Arama + Üye Ekle -->
          <div class="flex items-center gap-3">
            <div class="flex-1">
              <KvInput
                v-model="memberSearch"
                :placeholder="t('guildSettings.roles.memberSearchPlaceholder')"
              />
            </div>
            <KvButton v-if="canEdit" @click="addMemberSearch = ''; showAddMember = true">
              {{ t('guildSettings.roles.addMemberButton') }}
            </KvButton>
          </div>

          <p v-if="roleMembers.length === 0" class="text-[13px]" style="color: var(--kv-text-muted);">
            {{ t('guildSettings.roles.roleMembersEmpty') }}
          </p>

          <div v-else class="flex flex-col gap-1">
            <div
              v-for="member in roleMembers"
              :key="member.userId"
              class="group flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-sm)] border"
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
              <!-- Rolden çıkar (X) -->
              <button
                v-if="canEdit"
                type="button"
                class="shrink-0 flex items-center justify-center w-7 h-7 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
                style="background-color: transparent; color: var(--kv-text-muted);"
                :title="t('guildSettings.roles.removeMemberTooltip')"
                @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-danger-subtle)'; ($event.currentTarget as HTMLElement).style.color = 'var(--kv-danger)'"
                @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; ($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)'"
                @click="removeMemberFromRole(member.userId)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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

  <!-- Kaydedilmemiş değişiklik onayı (listeye dönerken) -->
  <ConfirmDialog
    v-if="showLeaveConfirm"
    :title="t('guildSettings.roles.unsavedTitle')"
    :message="t('guildSettings.roles.unsavedMessage')"
    :confirm-label="t('guildSettings.roles.discardButton')"
    @confirm="confirmLeave"
    @cancel="showLeaveConfirm = false"
  />

  <!-- Role Üye Ekle modalı -->
  <Teleport to="body">
    <div
      v-if="showAddMember"
      class="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style="background-color: var(--kv-bg-overlay);"
      @click.self="showAddMember = false"
    >
      <div
        class="flex flex-col w-full max-w-md rounded-[var(--kv-radius-lg)] border overflow-hidden"
        style="max-height: 70vh; background-color: var(--kv-bg-content); border-color: var(--kv-border-subtle);"
      >
        <div class="shrink-0 px-5 py-4 border-b" style="border-color: var(--kv-border-subtle);">
          <h3 class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
            {{ t('guildSettings.roles.addMemberTitle') }}
          </h3>
        </div>
        <div class="shrink-0 px-5 pt-3">
          <KvInput v-model="addMemberSearch" :placeholder="t('guildSettings.roles.memberSearchPlaceholder')" />
        </div>
        <div class="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-1">
          <p v-if="addableMembers.length === 0" class="text-[13px]" style="color: var(--kv-text-muted);">
            {{ t('guildSettings.roles.addMemberEmpty') }}
          </p>
          <button
            v-for="member in addableMembers"
            :key="member.userId"
            type="button"
            class="flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-sm)] text-left transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
            @click="addMemberToRole(member.userId)"
          >
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold overflow-hidden shrink-0"
              style="background-color: var(--kv-accent-500); color: #fff;"
            >
              <img v-if="member.avatarUrl" :src="member.avatarUrl" :alt="member.username" class="w-full h-full object-cover" />
              <span v-else>{{ member.username.charAt(0).toUpperCase() }}</span>
            </div>
            <span class="flex-1 text-[13px] truncate" style="color: var(--kv-text-primary);">{{ member.username }}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-accent-500);">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
        <div class="shrink-0 px-5 py-3 border-t flex justify-end" style="border-color: var(--kv-border-subtle);">
          <KvButton variant="ghost" @click="showAddMember = false">{{ t('common.close') }}</KvButton>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Discord-tarzı sabit kaydet barı — 3 sekme tek kaydet/sıfırla -->
  <Teleport to="body">
    <div
      v-if="selectedRoleId && canEdit && isDirty"
      class="fixed left-1/2 -translate-x-1/2 z-[55] flex items-center gap-4 px-4 py-3 rounded-[var(--kv-radius-md)] border"
      style="bottom: 24px; min-width: 420px; max-width: 92vw; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
    >
      <span class="flex-1 text-[14px] font-medium" style="color: var(--kv-text-primary);">
        {{ t('guildSettings.roles.unsavedBar') }}
      </span>
      <button
        type="button"
        class="text-[14px] font-medium cursor-pointer transition-colors"
        style="color: var(--kv-text-secondary);"
        :disabled="saving"
        @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-secondary)'"
        @click="reset"
      >
        {{ t('guildSettings.roles.resetButton') }}
      </button>
      <KvButton :disabled="saving || !hexValid" :loading="saving" @click="saveAll">
        {{ saving ? t('guildSettings.roles.saving') : t('guildSettings.roles.saveChanges') }}
      </KvButton>
    </div>
  </Teleport>
</template>
