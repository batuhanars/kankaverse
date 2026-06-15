<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { usePresenceStore } from '@/stores/presence'
import { useAuthStore } from '@/stores/auth'
import { useMembersStore } from '@/stores/members'
import { guildsApi } from '@/api/guilds'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
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

// Aktif guild'de ADMIN mi? (store önbellekten)
const isAdminOrOwner = computed(() => {
  if (!myUserId.value) return false
  return guildsStore.isAdminInActiveGuild(myUserId.value)
})

// Yöneticiler (OWNER önce, sonra ADMIN'ler) — presence'tan bağımsız, her zaman üstte
const adminMembers = computed(() =>
  members.value
    .filter((m) => m.role === 'OWNER' || m.role === 'ADMIN')
    .sort((a, b) => {
      if (a.role === 'OWNER') return -1
      if (b.role === 'OWNER') return 1
      return 0
    }),
)

// Kalan üyeler (OWNER/ADMIN hariç) — çevrimiçi/çevrimdışı gruplu
const regularOnline = computed(() =>
  members.value.filter(
    (m) => m.role === 'MEMBER' && presenceStore.getStatus(m.userId) !== 'offline',
  ),
)

const regularOffline = computed(() =>
  members.value.filter(
    (m) => m.role === 'MEMBER' && presenceStore.getStatus(m.userId) === 'offline',
  ),
)

function avatarInitial(username: string) {
  return username.charAt(0).toUpperCase()
}

// ── İşlem menüsü ──────────────────────────────────────────────────────────

function toggleMenu(userId: string) {
  openMenuUserId.value = openMenuUserId.value === userId ? null : userId
}

function closeMenu() {
  openMenuUserId.value = null
}

// Üye satırında menü gösterilip gösterilmeyeceği:
// OWNER veya ADMIN ise göster (ama hedef OWNER ise ve kendim OWNER değilsem bazı aksiyonlar gizli)
function shouldShowMenu(member: GuildMemberDto): boolean {
  if (!isAdminOrOwner.value) return false
  // Kendi satırımda hiçbir aksiyon yok — menüyü gizle
  if (member.userId === myUserId.value) return false
  // Hedef OWNER — hiçbir aksiyon mevcut değil
  if (member.role === 'OWNER') return false
  // ADMIN kullanıcısı: yalnız MEMBER atabilir (ADMIN'e değil), rol değiştiremez
  // ADMIN hedef ADMIN ise ADMIN kullanıcısı için aksiyon yok
  if (!isOwner.value && member.role === 'ADMIN') return false
  return true
}

// Rol değiştir göster: yalnız OWNER ve hedef OWNER değil, kendisi değil
function canChangeRole(member: GuildMemberDto): boolean {
  return isOwner.value && member.userId !== myUserId.value && member.role !== 'OWNER'
}

// Kick göster: OWNER → ADMIN/MEMBER; ADMIN → yalnız MEMBER
function canKick(member: GuildMemberDto): boolean {
  if (member.userId === myUserId.value) return false
  if (member.role === 'OWNER') return false
  if (isOwner.value) return true
  // ADMIN kullanıcısı — yalnız MEMBER atabilir
  if (isAdminOrOwner.value && member.role === 'MEMBER') return true
  return false
}

// ── Rol değiştir ──────────────────────────────────────────────────────────

const roleLoading = ref<string | null>(null) // loading olan userId

async function changeRole(member: GuildMemberDto, newRole: 'ADMIN' | 'MEMBER') {
  const guildId = guildsStore.activeGuildId
  if (!guildId) return
  roleLoading.value = member.userId
  roleError.value = ''
  closeMenu()
  try {
    const res = await guildsApi.updateMemberRole(guildId, member.userId, newRole)
    // Optimistik güncelle (WS guild.member_updated da gelir — idempotent)
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
    // Optimistik (WS guild.member_left da gelir — idempotent)
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

    <!-- Üye listesi -->
    <div class="flex-1 overflow-y-auto py-2">

      <!-- Yöneticiler grubu (OWNER + ADMIN) — presence'tan bağımsız, her zaman üstte -->
      <template v-if="adminMembers.length > 0">
        <p
          class="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest"
          style="color: var(--kv-text-muted);"
        >
          {{ t('member.admins', { n: adminMembers.length }) }}
        </p>
        <div
          v-for="member in adminMembers"
          :key="member.userId"
          class="group relative flex items-center gap-2 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-default"
          style="transition: background-color 0.1s;"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
          @click.stop
        >
          <!-- Avatar + presence dot -->
          <div class="relative shrink-0">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold overflow-hidden"
              style="background-color: var(--kv-accent-500); color: #fff;"
            >
              <img
                v-if="member.avatarUrl"
                :src="member.avatarUrl"
                :alt="member.username"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ avatarInitial(member.username) }}</span>
            </div>
            <PresenceDot
              :status="presenceStore.getStatus(member.userId)"
              border-color="var(--kv-bg-sidebar)"
              class="absolute -bottom-0.5 -right-0.5 w-3 h-3"
            />
          </div>

          <!-- Kullanıcı adı -->
          <div class="flex-1 min-w-0">
            <span
              class="block text-[14px] font-medium truncate"
              style="color: var(--kv-text-primary);"
            >
              {{ member.username }}
            </span>
          </div>

          <!-- Taç: owner -->
          <span
            v-if="member.role === 'OWNER'"
            class="shrink-0 text-[10px] px-1 py-0.5 rounded"
            style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
            :title="t('member.role.OWNER')"
          >
            👑
          </span>
          <!-- Rozet: admin -->
          <span
            v-else-if="member.role === 'ADMIN'"
            class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
          >
            {{ t('member.role.ADMIN') }}
          </span>

          <!-- İşlem menüsü butonu — yetkiliye göre gösterilir -->
          <div v-if="shouldShowMenu(member)" class="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-rail)]"
              style="width: 20px; height: 20px; color: var(--kv-text-muted);"
              :title="t('member.actions.kick')"
              :disabled="roleLoading === member.userId"
              @click.stop="toggleMenu(member.userId)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="1" fill="currentColor"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
                <circle cx="12" cy="19" r="1" fill="currentColor"/>
              </svg>
            </button>

            <!-- Dropdown menü -->
            <div
              v-if="openMenuUserId === member.userId"
              class="absolute right-0 top-full mt-1 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
              style="min-width: 152px; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
              @click.stop
            >
              <!-- Rol değiştir (yalnız OWNER) -->
              <template v-if="canChangeRole(member)">
                <button
                  v-if="member.role === 'MEMBER'"
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click="changeRole(member, 'ADMIN')"
                >
                  {{ t('member.actions.makeAdmin') }}
                </button>
                <button
                  v-else-if="member.role === 'ADMIN'"
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click="changeRole(member, 'MEMBER')"
                >
                  {{ t('member.actions.makeMember') }}
                </button>
              </template>
              <!-- At (kick) -->
              <button
                v-if="canKick(member)"
                class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                style="color: var(--kv-danger);"
                @click="openKick(member)"
              >
                {{ t('member.actions.kick') }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Kalan üyeler — çevrimiçi -->
      <template v-if="regularOnline.length > 0">
        <p
          class="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest"
          style="color: var(--kv-text-muted);"
        >
          {{ t('member.online', { n: regularOnline.length }) }}
        </p>
        <div
          v-for="member in regularOnline"
          :key="member.userId"
          class="group relative flex items-center gap-2 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-default"
          style="transition: background-color 0.1s;"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
          @click.stop
        >
          <div class="relative shrink-0">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold overflow-hidden"
              style="background-color: var(--kv-accent-500); color: #fff;"
            >
              <img
                v-if="member.avatarUrl"
                :src="member.avatarUrl"
                :alt="member.username"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ avatarInitial(member.username) }}</span>
            </div>
            <PresenceDot
              :status="presenceStore.getStatus(member.userId)"
              border-color="var(--kv-bg-sidebar)"
              class="absolute -bottom-0.5 -right-0.5 w-3 h-3"
            />
          </div>
          <div class="flex-1 min-w-0">
            <span
              class="block text-[14px] font-medium truncate"
              style="color: var(--kv-text-primary);"
            >
              {{ member.username }}
            </span>
          </div>

          <!-- İşlem menüsü butonu -->
          <div v-if="shouldShowMenu(member)" class="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-rail)]"
              style="width: 20px; height: 20px; color: var(--kv-text-muted);"
              :disabled="roleLoading === member.userId"
              @click.stop="toggleMenu(member.userId)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="1" fill="currentColor"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
                <circle cx="12" cy="19" r="1" fill="currentColor"/>
              </svg>
            </button>

            <div
              v-if="openMenuUserId === member.userId"
              class="absolute right-0 top-full mt-1 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
              style="min-width: 152px; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
              @click.stop
            >
              <template v-if="canChangeRole(member)">
                <button
                  v-if="member.role === 'MEMBER'"
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click="changeRole(member, 'ADMIN')"
                >
                  {{ t('member.actions.makeAdmin') }}
                </button>
                <button
                  v-else-if="member.role === 'ADMIN'"
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click="changeRole(member, 'MEMBER')"
                >
                  {{ t('member.actions.makeMember') }}
                </button>
              </template>
              <button
                v-if="canKick(member)"
                class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                style="color: var(--kv-danger);"
                @click="openKick(member)"
              >
                {{ t('member.actions.kick') }}
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Kalan üyeler — çevrimdışı -->
      <template v-if="regularOffline.length > 0">
        <p
          class="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-widest"
          style="color: var(--kv-text-muted);"
        >
          {{ t('member.offline', { n: regularOffline.length }) }}
        </p>
        <div
          v-for="member in regularOffline"
          :key="member.userId"
          class="group relative flex items-center gap-2 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-default opacity-50"
          style="transition: background-color 0.1s;"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
          @click.stop
        >
          <div class="relative shrink-0">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold overflow-hidden"
              style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
            >
              <img
                v-if="member.avatarUrl"
                :src="member.avatarUrl"
                :alt="member.username"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ avatarInitial(member.username) }}</span>
            </div>
            <PresenceDot
              status="offline"
              border-color="var(--kv-bg-sidebar)"
              class="absolute -bottom-0.5 -right-0.5 w-3 h-3"
            />
          </div>
          <div class="flex-1 min-w-0">
            <span
              class="block text-[14px] font-medium truncate"
              style="color: var(--kv-text-muted);"
            >
              {{ member.username }}
            </span>
          </div>

          <!-- İşlem menüsü butonu (çevrimdışı üyeler için de göster) -->
          <div v-if="shouldShowMenu(member)" class="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-rail)]"
              style="width: 20px; height: 20px; color: var(--kv-text-muted);"
              :disabled="roleLoading === member.userId"
              @click.stop="toggleMenu(member.userId)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="1" fill="currentColor"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
                <circle cx="12" cy="19" r="1" fill="currentColor"/>
              </svg>
            </button>

            <div
              v-if="openMenuUserId === member.userId"
              class="absolute right-0 top-full mt-1 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
              style="min-width: 152px; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
              @click.stop
            >
              <template v-if="canChangeRole(member)">
                <button
                  v-if="member.role === 'MEMBER'"
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click="changeRole(member, 'ADMIN')"
                >
                  {{ t('member.actions.makeAdmin') }}
                </button>
                <button
                  v-else-if="member.role === 'ADMIN'"
                  class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click="changeRole(member, 'MEMBER')"
                >
                  {{ t('member.actions.makeMember') }}
                </button>
              </template>
              <button
                v-if="canKick(member)"
                class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                style="color: var(--kv-danger);"
                @click="openKick(member)"
              >
                {{ t('member.actions.kick') }}
              </button>
            </div>
          </div>
        </div>
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
</template>
