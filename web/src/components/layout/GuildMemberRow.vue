<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import type { GuildMemberDto } from '@/types'
import type { PresenceStatus } from '@/stores/presence'

const { t } = useI18n()

const props = defineProps<{
  member: GuildMemberDto
  presenceStatus: PresenceStatus
  isOffline: boolean
  openMenuUserId: string | null
  roleLoading: string | null
  canChangeRoleFn: (m: GuildMemberDto) => boolean
  canKickFn: (m: GuildMemberDto) => boolean
  canBanFn: (m: GuildMemberDto) => boolean
  canTransferFn: (m: GuildMemberDto) => boolean
  shouldShowMenuFn: (m: GuildMemberDto) => boolean
  roleColor?: string | null
}>()

const emit = defineEmits<{
  toggleMenu: [userId: string]
  closeMenu: []
  changeRole: [member: GuildMemberDto, newRole: 'ADMIN' | 'MEMBER']
  openKick: [member: GuildMemberDto]
  openBan: [member: GuildMemberDto]
  openTransfer: [member: GuildMemberDto]
}>()

function avatarInitial(username: string) {
  return username.charAt(0).toUpperCase()
}
</script>

<template>
  <div
    class="group relative flex items-center gap-2 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-default"
    :class="{ 'opacity-50': props.isOffline }"
    style="transition: background-color 0.1s;"
    @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
    @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
    @click.stop
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

    <!-- İşlem menüsü butonu -->
    <div
      v-if="shouldShowMenuFn(member)"
      class="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
        <!-- Rol değiştir (yalnız OWNER) -->
        <template v-if="canChangeRoleFn(member)">
          <button
            v-if="member.role === 'MEMBER'"
            class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
            style="color: var(--kv-text-secondary);"
            @click="emit('changeRole', member, 'ADMIN')"
          >
            {{ t('member.actions.makeAdmin') }}
          </button>
          <button
            v-else-if="member.role === 'ADMIN'"
            class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
            style="color: var(--kv-text-secondary);"
            @click="emit('changeRole', member, 'MEMBER')"
          >
            {{ t('member.actions.makeMember') }}
          </button>
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
