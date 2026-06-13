<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { usePresenceStore } from '@/stores/presence'
import { guildsApi } from '@/api/guilds'
import PresenceDot from '@/components/shared/PresenceDot.vue'
import type { GuildMemberDto } from '@/types'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const presenceStore = usePresenceStore()

const members = ref<GuildMemberDto[]>([])

watch(
  () => guildsStore.activeGuildId,
  async (guildId) => {
    if (!guildId) {
      members.value = []
      return
    }
    try {
      const res = await guildsApi.getMembers(guildId)
      members.value = res.data
    } catch {
      members.value = []
    }
  },
  { immediate: true },
)

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
</script>

<template>
  <aside
    class="flex flex-col shrink-0 mb-4 mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="width: 248px; background-color: var(--kv-bg-sidebar);"
  >
    <!-- Başlık -->
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b text-[13px] font-semibold uppercase tracking-widest"
      style="border-color: var(--kv-border-subtle); color: var(--kv-text-muted);"
    >
      {{ t('member.panel') }}
    </div>

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
          class="flex items-center gap-2 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-default"
          style="transition: background-color 0.1s;"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
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
          class="flex items-center gap-2 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-default"
          style="transition: background-color 0.1s;"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
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
          class="flex items-center gap-2 px-3 py-1.5 mx-1 rounded-[var(--kv-radius-sm)] cursor-default opacity-50"
          style="transition: background-color 0.1s;"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-bg-elevated)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
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
        </div>
      </template>
    </div>
  </aside>
</template>
