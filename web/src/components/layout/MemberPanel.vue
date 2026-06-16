<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { usePresenceStore } from '@/stores/presence'
import { useAuthStore } from '@/stores/auth'
import { useMembersStore } from '@/stores/members'
import { useRolesStore } from '@/stores/roles'
import { useToastStore } from '@/stores/toast'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { useActiveMenu } from '@/composables/useActiveMenu'
import { guildsApi } from '@/api/guilds'
import { rolesApi } from '@/api/roles'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import KvModal from '@/components/ui/KvModal.vue'
import KvButton from '@/components/ui/KvButton.vue'
import UserCardPopover from '@/components/shared/UserCardPopover.vue'
import GuildMemberRow from '@/components/layout/GuildMemberRow.vue'
import type { GuildMemberDto, RoleDto } from '@/types'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const presenceStore = usePresenceStore()
const authStore = useAuthStore()
const membersStore = useMembersStore()
const rolesStore = useRolesStore()
const toast = useToastStore()

// REV-14: üye listesi store'dan (WS guild.member_* ile anlık güncellenir)
const members = computed(() => membersStore.membersFor(guildsStore.activeGuildId ?? ''))

// İşlem menüsü ve hata state'leri — watch'tan önce tanımla (immediate callback erişir)
const openMenuUserId = ref<string | null>(null)
// R1: hangi üyenin "Rolleri Yönet" alt-menüsü açık
const roleSubmenuUserId = ref<string | null>(null)
const roleError = ref('')
const kickError = ref('')

watch(
  () => guildsStore.activeGuildId,
  async (guildId) => {
    roleError.value = ''
    kickError.value = ''
    openMenuUserId.value = null
    roleSubmenuUserId.value = null
    if (!guildId) return
    try {
      await membersStore.fetchMembers(guildId)
      // R1: rol-seçici için ortamın rolleri (zaten yüklüyse no-op)
      await rolesStore.fetchRoles(guildId)
    } catch {
      // sessiz — boş kalır
    }
  },
  { immediate: true },
)

// Kendi userId
const myUserId = computed(() => authStore.user?.id ?? '')

// Aktif guild OWNER mi?
const isOwner = computed(() => {
  const guild = guildsStore.activeGuild()
  if (!guild || !myUserId.value) return false
  return guild.ownerId === myUserId.value
})

// Efektif izin (UX gating) — backend hiyerarşi + izni zorlar
const { can } = useGuildPermissions(() => guildsStore.activeGuildId ?? '')

// Üye üzerinde herhangi bir aksiyon yapabilir mi (menüyü göster)
const canActOnMembers = computed(
  () => isOwner.value || can('KICK_MEMBERS') || can('BAN_MEMBERS') || can('MANAGE_ROLES'),
)

// R1: rol-seçicide gösterilecek atanabilir roller (ortamın rolleri, @everyone hariç)
const assignableRoles = computed<RoleDto[]>(() =>
  rolesStore.rolesFor(guildsStore.activeGuildId ?? '').filter((r) => !r.isEveryone),
)

// ── Gruplar computed — hoist rollere göre ───────────────────────────────────

interface MemberGroup {
  key: string
  label: string
  color: string | null
  members: GuildMemberDto[]
}

const groups = computed((): MemberGroup[] => {
  const allMembers = members.value

  const online = allMembers.filter((m) => presenceStore.getStatus(m.userId) !== 'offline')
  const offline = allMembers.filter((m) => presenceStore.getStatus(m.userId) === 'offline')

  const hoistGroups = new Map<string, { role: { id: string; name: string; color: string; position: number }; members: GuildMemberDto[] }>()
  const noHoistOnline: GuildMemberDto[] = []

  for (const member of online) {
    const hoistRoles = (member.roles ?? []).filter((r) => r.hoist)
    if (hoistRoles.length === 0) {
      noHoistOnline.push(member)
      continue
    }
    const topRole = hoistRoles.reduce((best, r) => (r.position > best.position ? r : best))
    if (!hoistGroups.has(topRole.id)) {
      hoistGroups.set(topRole.id, { role: topRole, members: [] })
    }
    hoistGroups.get(topRole.id)!.members.push(member)
  }

  const sortedHoistGroups = [...hoistGroups.values()]
    .sort((a, b) => b.role.position - a.role.position)
    .map((g) => ({
      key: `hoist-${g.role.id}`,
      label: g.role.name,
      color: g.role.color,
      members: g.members,
    }))

  const result: MemberGroup[] = [...sortedHoistGroups]

  if (noHoistOnline.length > 0) {
    result.push({ key: 'online', label: t('member.online', { n: noHoistOnline.length }), color: null, members: noHoistOnline })
  }
  if (offline.length > 0) {
    result.push({ key: 'offline', label: t('member.offline', { n: offline.length }), color: null, members: offline })
  }

  return result.filter((g) => g.members.length > 0)
})

// ── İşlem menüsü ──────────────────────────────────────────────────────────

function toggleMenu(userId: string) {
  // Bug 1: ⋯ ↔ profil kartı birbirini dışlar. ⋯'a tıklayınca açık profil kartı kapansın.
  showCard.value = false
  roleSubmenuUserId.value = null
  openMenuUserId.value = openMenuUserId.value === userId ? null : userId
}

function closeMenu() {
  openMenuUserId.value = null
  roleSubmenuUserId.value = null
}

// ── Kullanıcı kartı popover (üye satırına sol-tık — mesaj-yazarı deseni) ─────
const showCard = ref(false)
const cardUserId = ref('')
const cardX = ref(0)
const cardY = ref(0)

function openCard(userId: string, x: number, y: number) {
  closeMenu()
  cardUserId.value = userId
  cardX.value = x
  cardY.value = y
  showCard.value = true
}

function closeCard() {
  showCard.value = false
}

onMounted(() => window.addEventListener('kv:close-user-cards', closeCard))
onUnmounted(() => {
  window.removeEventListener('kv:close-user-cards', closeCard)
  // Panel sökülürken açık overlay sahipliğini bırak (sızıntıyı önle).
  if (activeMemberUserId.value) clearActive(`member:${activeMemberUserId.value}`)
})

// ── R8/R13: paylaşılan aktif-overlay durumu ────────────────────────────────
// Bir üyenin ⋯ menüsü VEYA profil kartı açıkken, o üyenin satırı "aktif sahip"tir.
// Diğer satırlar buna bakar (isSuppressed) → hover-vurgu/⋯-görünürlüğünü bastırır.
const { setActive, clearActive, isSuppressed } = useActiveMenu()

// Hangi üyenin overlay'i açık? (menü veya kart) — ikisi de mutual-exclusive.
const activeMemberUserId = computed<string | null>(() => {
  if (openMenuUserId.value) return openMenuUserId.value
  if (showCard.value) return cardUserId.value
  return null
})

watch(activeMemberUserId, (userId, prev) => {
  if (prev && prev !== userId) clearActive(`member:${prev}`)
  if (userId) setActive(`member:${userId}`)
  else if (prev) clearActive(`member:${prev}`)
})

// Bir satırın hover'ı bastırılmalı mı? (başka üyenin overlay'i açık)
function isRowSuppressed(userId: string): boolean {
  return isSuppressed(`member:${userId}`)
}

// Üye satırında menü gösterilip gösterilmeyeceği
function shouldShowMenu(member: GuildMemberDto): boolean {
  if (!canActOnMembers.value) return false
  if (member.userId === myUserId.value) return false
  if (member.role === 'OWNER') return false
  // Enum-ADMIN hedefe yalnız OWNER aksiyon alabilir (backend hiyerarşisiyle uyumlu UI yaklaşığı)
  if (!isOwner.value && member.role === 'ADMIN') return false
  return true
}

// R1: bu üyenin rolleri yönetilebilir mi (MANAGE_ROLES + owner). Backend hiyerarşiyi zorlar.
function canManageRoles(member: GuildMemberDto): boolean {
  if (member.userId === myUserId.value) return false
  if (member.role === 'OWNER') return false
  return isOwner.value || can('MANAGE_ROLES')
}

function canKick(member: GuildMemberDto): boolean {
  if (member.userId === myUserId.value) return false
  if (member.role === 'OWNER') return false
  if (isOwner.value) return true
  if (member.role === 'ADMIN') return false // enum-admin'i yalnız owner atabilir
  return can('KICK_MEMBERS')
}

function canBan(member: GuildMemberDto): boolean {
  if (member.userId === myUserId.value) return false
  if (member.role === 'OWNER') return false
  if (isOwner.value) return true
  if (member.role === 'ADMIN') return false
  return can('BAN_MEMBERS')
}

function canTransfer(member: GuildMemberDto): boolean {
  return isOwner.value && member.userId !== myUserId.value && member.role !== 'OWNER'
}

// ── R1: Rolleri Yönet (rol ata/kaldır — RolesSettingsSection ile aynı api/roles) ──────

const roleLoading = ref<string | null>(null)

// "Rolleri Yönet" alt-menüsünü aç/kapat (aynı üyeye tekrar → kapat)
function toggleRoleSubmenu(userId: string) {
  roleSubmenuUserId.value = roleSubmenuUserId.value === userId ? null : userId
}

// Bir rolü üyede aç/kapat: atanmışsa kaldır, değilse ata. Backend hiyerarşi + MANAGE_ROLES zorlar.
async function toggleRole(member: GuildMemberDto, role: RoleDto) {
  const guildId = guildsStore.activeGuildId
  if (!guildId || roleLoading.value) return
  const hasRole = (member.roles ?? []).some((r) => r.id === role.id)
  roleLoading.value = member.userId
  try {
    const res = hasRole
      ? await rolesApi.removeRole(role.id, member.userId)
      : await rolesApi.assignRole(role.id, member.userId)
    // Üye listesi rolleri anlık yansısın (WS guild.member_updated de gelir; bu optimistik)
    membersStore.updateMember(guildId, res.data)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    toast.error(err.response?.data?.message ?? t('common.error'))
  } finally {
    roleLoading.value = null
  }
}

// ── Kick ──────────────────────────────────────────────────────────────────

const kickTarget = ref<GuildMemberDto | null>(null)
const kicking = ref(false)
// R2: opsiyonel kick sebebi (max 512, boş bırakılabilir)
const kickReason = ref('')

function openKick(member: GuildMemberDto) {
  kickTarget.value = member
  kickReason.value = ''
  kickError.value = ''
  closeMenu()
}

function closeKick() {
  kickTarget.value = null
  kickReason.value = ''
}

async function confirmKick() {
  const target = kickTarget.value
  if (!target) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  kicking.value = true
  kickError.value = ''
  try {
    await guildsApi.kickMember(guildId, target.userId, kickReason.value.trim() || undefined)
    membersStore.removeMember(guildId, target.userId)
    closeKick()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    kickError.value = code && ['CANNOT_KICK_OWNER', 'CANNOT_KICK_SELF', 'NOT_GUILD_MEMBER', 'FORBIDDEN'].includes(code)
      ? t(`member.errors.${code}`)
      : (err.response?.data?.message ?? t('common.error'))
    closeKick()
  } finally {
    kicking.value = false
  }
}

// ── Yasakla (ban) ───────────────────────────────────────────────────────────

const banTarget = ref<GuildMemberDto | null>(null)
const banning = ref(false)

function openBan(member: GuildMemberDto) {
  banTarget.value = member
  kickError.value = ''
  closeMenu()
}

async function confirmBan() {
  const target = banTarget.value
  if (!target) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  banning.value = true
  kickError.value = ''
  try {
    await guildsApi.banMember(guildId, target.userId)
    membersStore.removeMember(guildId, target.userId)
    banTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    kickError.value = code && ['CANNOT_BAN_OWNER', 'CANNOT_BAN_SELF', 'NOT_GUILD_MEMBER', 'FORBIDDEN'].includes(code)
      ? t(`member.errors.${code}`)
      : (err.response?.data?.message ?? t('common.error'))
    banTarget.value = null
  } finally {
    banning.value = false
  }
}

// ── Sahiplik devri ────────────────────────────────────────────────────────

const transferTarget = ref<GuildMemberDto | null>(null)
const transferring = ref(false)

function openTransfer(member: GuildMemberDto) {
  transferTarget.value = member
  roleError.value = ''
  closeMenu()
}

async function confirmTransfer() {
  const target = transferTarget.value
  if (!target) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  transferring.value = true
  roleError.value = ''
  try {
    await guildsApi.transferOwnership(guildId, target.userId)
    transferTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    roleError.value = err.response?.data?.message ?? t('common.error')
    transferTarget.value = null
  } finally {
    transferring.value = false
  }
}
</script>

<template>
  <aside
    class="flex flex-col shrink-0 mb-4 mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
    @click="closeMenu"
  >
    <!-- Başlık -->
    <div
      class="flex items-center px-4 shrink-0 border-b text-[13px] font-semibold uppercase tracking-widest"
      style="height: var(--kv-header-height); border-color: var(--kv-border-subtle); color: var(--kv-text-muted);"
    >
      {{ t('member.panel') }}
    </div>

    <!-- Hata mesajı (rol/kick) -->
    <p
      v-if="roleError || kickError"
      class="mx-3 mt-2 px-3 py-2 text-[12px] rounded-[var(--kv-radius-sm)]"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-danger);"
    >
      {{ roleError || kickError }}
    </p>

    <!-- Üye listesi — hoist grupları -->
    <div class="flex-1 overflow-y-auto py-2">
      <template v-for="group in groups" :key="group.key">
        <!-- Grup başlığı -->
        <p
          class="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest"
          :style="group.color ? `color: ${group.color};` : 'color: var(--kv-text-muted);'"
        >
          {{ group.label }}
          <span v-if="group.color" class="opacity-60 normal-case ml-1">— {{ group.members.length }}</span>
        </p>

        <!-- Üye satırları -->
        <GuildMemberRow
          v-for="member in group.members"
          :key="member.userId"
          :member="member"
          :presence-status="presenceStore.getStatus(member.userId)"
          :is-offline="group.key === 'offline'"
          :open-menu-user-id="openMenuUserId"
          :role-loading="roleLoading"
          :can-manage-roles-fn="canManageRoles"
          :can-kick-fn="canKick"
          :can-ban-fn="canBan"
          :can-transfer-fn="canTransfer"
          :should-show-menu-fn="shouldShowMenu"
          :assignable-roles="assignableRoles"
          :role-submenu-user-id="roleSubmenuUserId"
          :role-color="group.color"
          :hover-suppressed="isRowSuppressed(member.userId)"
          :owner-active="activeMemberUserId === member.userId"
          @toggle-menu="toggleMenu"
          @close-menu="closeMenu"
          @toggle-role-submenu="toggleRoleSubmenu"
          @toggle-role="toggleRole"
          @open-kick="openKick"
          @open-ban="openBan"
          @open-transfer="openTransfer"
          @select-member="openCard"
        />
      </template>
    </div>
  </aside>

  <!-- Kick modalı — opsiyonel sebep alanı (R2) -->
  <KvModal v-if="kickTarget" :title="t('member.actions.kickTitle')" @close="closeKick">
    <p class="text-[14px] mb-5" style="color: var(--kv-text-body);">
      {{ t('member.actions.kickConfirmMessage', { username: kickTarget.username }) }}
    </p>

    <label class="block text-[12px] font-semibold mb-1.5" style="color: var(--kv-text-muted);">
      {{ t('member.actions.kickReasonLabel') }}
    </label>
    <textarea
      v-model="kickReason"
      :placeholder="t('member.actions.kickReasonPlaceholder')"
      maxlength="500"
      rows="3"
      class="w-full resize-none px-3 py-2 text-[14px] rounded-[var(--kv-radius-md)] border outline-none mb-6"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-body); border-color: var(--kv-border-subtle);"
    />

    <div class="flex gap-3 justify-end">
      <KvButton variant="ghost" :disabled="kicking" @click="closeKick">{{ t('common.cancel') }}</KvButton>
      <KvButton variant="danger" :loading="kicking" @click="confirmKick">
        {{ t('member.actions.kickConfirmButton') }}
      </KvButton>
    </div>
  </KvModal>

  <!-- Ban onay diyaloğu -->
  <ConfirmDialog
    v-if="banTarget"
    :title="t('member.actions.banConfirmTitle')"
    :message="t('member.actions.banConfirmMessage', { username: banTarget.username })"
    :confirm-label="t('member.actions.ban')"
    :loading="banning"
    @confirm="confirmBan"
    @cancel="banTarget = null"
  />

  <!-- Sahiplik devri onay diyaloğu -->
  <ConfirmDialog
    v-if="transferTarget"
    :title="t('member.actions.transferConfirmTitle')"
    :message="t('member.actions.transferConfirmMessage', { username: transferTarget.username })"
    :confirm-label="t('member.actions.transferOwnership')"
    :loading="transferring"
    @confirm="confirmTransfer"
    @cancel="transferTarget = null"
  />

  <!-- Kullanıcı kartı (üye satırına sol-tık — mesaj-yazarı deseni) -->
  <UserCardPopover
    v-if="showCard"
    :user-id="cardUserId"
    :x="cardX"
    :y="cardY"
    @close="closeCard"
  />
</template>
