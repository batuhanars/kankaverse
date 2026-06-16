<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import type { GuildMemberDto, RoleDto } from '@/types'
import type { PresenceStatus } from '@/stores/presence'

const { t } = useI18n()

const props = defineProps<{
  member: GuildMemberDto
  presenceStatus: PresenceStatus
  isOffline: boolean
  openMenuUserId: string | null
  roleLoading: string | null
  canManageRolesFn: (m: GuildMemberDto) => boolean
  canKickFn: (m: GuildMemberDto) => boolean
  canBanFn: (m: GuildMemberDto) => boolean
  canTransferFn: (m: GuildMemberDto) => boolean
  shouldShowMenuFn: (m: GuildMemberDto) => boolean
  // R1: atanabilir roller (ortamın rolleri, @everyone hariç) — rol-seçici alt-menüsü için
  assignableRoles?: RoleDto[]
  // R1: bu üyenin hangi rol-seçici alt-menüsü açık (member.userId eşleşirse açık)
  roleSubmenuUserId?: string | null
  roleColor?: string | null
  // R8/R13: başka bir üyenin overlay'i (menü/kart) açık → bu satırın hover'ı bastırılsın
  hoverSuppressed?: boolean
  // R8/R13: bu satırın kendi overlay'i (menü/kart) açık → ⋯ butonu görünür/tıklanabilir kalsın
  ownerActive?: boolean
}>()

const emit = defineEmits<{
  toggleMenu: [userId: string]
  closeMenu: []
  openKick: [member: GuildMemberDto]
  openBan: [member: GuildMemberDto]
  openTransfer: [member: GuildMemberDto]
  // R1: "Rolleri Yönet" alt-menüsünü aç/kapat
  toggleRoleSubmenu: [userId: string]
  // R1: bir rolü üyede aç/kapat (atanmışsa kaldır, değilse ata)
  toggleRole: [member: GuildMemberDto, role: RoleDto]
  // C5 follow-up: üye satırına sol-tık → kullanıcı kartı popover (mesaj-yazarı deseni)
  selectMember: [userId: string, x: number, y: number]
}>()

// R1: üyede bu rol atalı mı? (rol-seçici işaret durumu)
function memberHasRole(roleId: string): boolean {
  return (props.member.roles ?? []).some((r) => r.id === roleId)
}

function avatarInitial(username: string) {
  return username.charAt(0).toUpperCase()
}

// Satıra sol-tık → kullanıcı kartı (⋯ menü butonu @click.stop ile çakışmaz)
function onRowClick(e: MouseEvent) {
  emit('selectMember', props.member.userId, e.clientX, e.clientY)
}

// Hover-vurgu: başka üyenin overlay'i açıkken bastır; kendi overlay'i açıkken sabit kal.
function onRowEnter(e: MouseEvent) {
  if (props.hoverSuppressed) return
  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'
}

function onRowLeave(e: MouseEvent) {
  // Kendi overlay'i açıkken vurgu kalsın (kart/menü bu satıra çapalı).
  if (props.ownerActive) return
  ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
}
</script>

<template>
  <div
    class="group relative flex items-center gap-2 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-pointer"
    :class="{
      'opacity-50': props.isOffline && props.openMenuUserId !== props.member.userId,
      'z-30': props.openMenuUserId === props.member.userId,
    }"
    :style="`transition: background-color 0.1s; background-color: ${props.ownerActive ? 'var(--kv-bg-elevated)' : 'transparent'};`"
    @mouseenter="onRowEnter"
    @mouseleave="onRowLeave"
    @click.stop="onRowClick"
  >
    <!-- Avatar + presence dot -->
    <div class="relative shrink-0">
      <div
        class="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold overflow-hidden"
        :style="props.isOffline
          ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);'
          : props.roleColor
            ? `background-color: ${props.roleColor}33; color: ${props.roleColor};`
            : 'background-color: var(--kv-accent-500); color: #fff;'"
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
        :status="props.presenceStatus"
        border-color="var(--kv-bg-sidebar)"
        class="absolute -bottom-0.5 -right-0.5 w-3 h-3"
      />
    </div>

    <!-- Kullanıcı adı -->
    <div class="flex-1 min-w-0">
      <span
        class="block text-[14px] font-medium truncate"
        :style="props.isOffline ? 'color: var(--kv-text-muted);' : 'color: var(--kv-text-primary);'"
      >
        {{ member.username }}
      </span>
    </div>

    <!-- Taç: sahip -->
    <span
      v-if="member.role === 'OWNER'"
      class="shrink-0 text-[10px] px-1 py-0.5 rounded"
      style="background-color: var(--kv-accent-subtle); color: var(--kv-accent-500);"
      :title="t('member.role.OWNER')"
    >
      👑
    </span>
    <!-- Rozet: yönetici -->
    <span
      v-else-if="member.role === 'ADMIN'"
      class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
    >
      {{ t('member.role.ADMIN') }}
    </span>

    <!-- İşlem menüsü butonu.
         - ownerActive (kendi menü/kart açık) → görünür ve tıklanabilir kalır (Bug 1).
         - hoverSuppressed (başka satırın overlay'i açık) → gizli ve tıklanamaz.
         - aksi halde → normal hover ile görünür. -->
    <div
      v-if="shouldShowMenuFn(member)"
      class="relative shrink-0 transition-opacity"
      :class="props.ownerActive
        ? 'opacity-100'
        : props.hoverSuppressed
          ? 'opacity-0 pointer-events-none'
          : 'opacity-0 group-hover:opacity-100'"
    >
      <button
        class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-rail)]"
        style="width: 20px; height: 20px; color: var(--kv-text-muted);"
        :disabled="roleLoading === member.userId"
        @click.stop="emit('toggleMenu', member.userId)"
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
        <!-- R1: Rolleri Yönet (MANAGE_ROLES) — alt-menüde rol-seçici -->
        <template v-if="canManageRolesFn(member)">
          <button
            class="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
            style="color: var(--kv-text-secondary);"
            @click.stop="emit('toggleRoleSubmenu', member.userId)"
          >
            <span>{{ t('member.actions.manageRoles') }}</span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              class="shrink-0 transition-transform" :class="roleSubmenuUserId === member.userId ? 'rotate-90' : ''"
            >
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>

          <!-- Rol-seçici listesi (açıkken) -->
          <div
            v-if="roleSubmenuUserId === member.userId"
            class="max-h-56 overflow-y-auto border-t"
            style="border-color: var(--kv-border-subtle);"
          >
            <p
              v-if="!assignableRoles || assignableRoles.length === 0"
              class="px-3 py-2 text-[12px]"
              style="color: var(--kv-text-muted);"
            >
              {{ t('member.actions.noAssignableRoles') }}
            </p>
            <button
              v-for="role in assignableRoles"
              :key="role.id"
              class="w-full flex items-center gap-2 px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
              style="color: var(--kv-text-secondary);"
              :disabled="roleLoading === member.userId"
              @click.stop="emit('toggleRole', member, role)"
            >
              <!-- Onay kutusu: atanmışsa dolu -->
              <span
                class="shrink-0 w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center"
                :style="memberHasRole(role.id)
                  ? 'background-color: var(--kv-accent-500); border-color: var(--kv-accent-500);'
                  : 'border-color: var(--kv-border-strong);'"
              >
                <svg
                  v-if="memberHasRole(role.id)"
                  width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff"
                  stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"
                >
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </span>
              <!-- Rol renk noktası -->
              <span class="shrink-0 w-2 h-2 rounded-full" :style="`background-color: ${role.color};`" />
              <span class="flex-1 min-w-0 truncate">{{ role.name }}</span>
            </button>
          </div>
        </template>
        <!-- At (kick) -->
        <button
          v-if="canKickFn(member)"
          class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-danger);"
          @click="emit('openKick', member)"
        >
          {{ t('member.actions.kick') }}
        </button>
        <!-- Yasakla (ban) -->
        <button
          v-if="canBanFn(member)"
          class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-danger);"
          @click="emit('openBan', member)"
        >
          {{ t('member.actions.ban') }}
        </button>
        <!-- Sahiplik devri -->
        <button
          v-if="canTransferFn(member)"
          class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
          style="color: var(--kv-text-secondary);"
          @click="emit('openTransfer', member)"
        >
          {{ t('member.actions.transferOwnership') }}
        </button>
      </div>
    </div>
  </div>
</template>
