<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { usePresenceStore } from '@/stores/presence'
import { useAuthStore } from '@/stores/auth'
import { useMembersStore } from '@/stores/members'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { guildsApi } from '@/api/guilds'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import GuildMemberRow from '@/components/layout/GuildMemberRow.vue'
import type { GuildMemberDto } from '@/types'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const presenceStore = usePresenceStore()
const authStore = useAuthStore()
const membersStore = useMembersStore()

// REV-14: üye listesi store'dan (WS guild.member_* ile anlık güncellenir)
const members = computed(() => membersStore.membersFor(guildsStore.activeGuildId ?? ''))

// İşlem menüsü ve hata state'leri — watch'tan önce tanımla (immediate callback erişir)
const openMenuUserId = ref<string | null>(null)
const roleError = ref('')
const kickError = ref('')

watch(
  () => guildsStore.activeGuildId,
  async (guildId) => {
    roleError.value = ''
    kickError.value = ''
    openMenuUserId.value = null
    if (!guildId) return
    try {
      await membersStore.fetchMembers(guildId)
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
const canActOnMembers = computed(() => isOwner.value || can('KICK_MEMBERS') || can('BAN_MEMBERS'))

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
  openMenuUserId.value = openMenuUserId.value === userId ? null : userId
}

function closeMenu() {
  openMenuUserId.value = null
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

function canChangeRole(member: GuildMemberDto): boolean {
  // Enum rol ataması (ADMIN/MEMBER) yalnız OWNER (backend: updateMemberRole OWNER-only)
  return isOwner.value && member.userId !== myUserId.value && member.role !== 'OWNER'
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

// ── Rol değiştir ──────────────────────────────────────────────────────────

const roleLoading = ref<string | null>(null)

async function changeRole(member: GuildMemberDto, newRole: 'ADMIN' | 'MEMBER') {
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  roleLoading.value = member.userId
  roleError.value = ''
  closeMenu()
  try {
    const res = await guildsApi.updateMemberRole(guildId, member.userId, newRole)
    membersStore.updateMember(guildId, res.data)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    roleError.value = code && ['CANNOT_MODIFY_OWNER', 'NOT_GUILD_MEMBER', 'FORBIDDEN'].includes(code)
      ? t(`member.errors.${code}`)
      : (err.response?.data?.message ?? t('common.error'))
  } finally {
    roleLoading.value = null
  }
}

// ── Kick ──────────────────────────────────────────────────────────────────

const kickTarget = ref<GuildMemberDto | null>(null)
const kicking = ref(false)

function openKick(member: GuildMemberDto) {
  kickTarget.value = member
  kickError.value = ''
  closeMenu()
}

async function confirmKick() {
  const target = kickTarget.value
  if (!target) return
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  kicking.value = true
  kickError.value = ''
  try {
    await guildsApi.kickMember(guildId, target.userId)
    membersStore.removeMember(guildId, target.userId)
    kickTarget.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const code = err.response?.data?.error
    kickError.value = code && ['CANNOT_KICK_OWNER', 'CANNOT_KICK_SELF', 'NOT_GUILD_MEMBER', 'FORBIDDEN'].includes(code)
      ? t(`member.errors.${code}`)
      : (err.response?.data?.message ?? t('common.error'))
    kickTarget.value = null
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
          :can-change-role-fn="canChangeRole"
          :can-kick-fn="canKick"
          :can-ban-fn="canBan"
          :can-transfer-fn="canTransfer"
          :should-show-menu-fn="shouldShowMenu"
          :role-color="group.color"
          @toggle-menu="toggleMenu"
          @close-menu="closeMenu"
          @change-role="changeRole"
          @open-kick="openKick"
          @open-ban="openBan"
          @open-transfer="openTransfer"
        />
      </template>
    </div>
  </aside>

  <!-- Kick onay diyaloğu -->
  <ConfirmDialog
    v-if="kickTarget"
    :title="t('member.actions.kickConfirmTitle')"
    :message="t('member.actions.kickConfirmMessage', { username: kickTarget.username })"
    :confirm-label="t('member.actions.kickConfirmButton')"
    :loading="kicking"
    @confirm="confirmKick"
    @cancel="kickTarget = null"
  />

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
</template>
