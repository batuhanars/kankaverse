<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useAuthStore } from '@/stores/auth'
import { useSocket } from '@/composables/useSocket'
import GuildSettingsModal from '@/views/app/components/GuildSettingsModal.vue'
import type { ChannelDto } from '@/types'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const authStore = useAuthStore()
const { joinChannel, leaveChannel } = useSocket()

const showSettings = ref(false)

const isOwner = computed(() => {
  const guild = guildsStore.activeGuild()
  if (!guild || !authStore.user) return false
  return guild.ownerId === authStore.user.id
})

async function selectChannel(channel: ChannelDto) {
  const prev = channelsStore.activeChannelId
  if (prev && prev !== channel.id) {
    leaveChannel(prev)
  }
  channelsStore.setActiveChannel(channel.id)
  await joinChannel(channel.id)
}
</script>

<template>
  <aside
    class="flex flex-col h-full shrink-0 rounded-r-[var(--kv-radius-lg)] overflow-hidden"
    style="width: 264px; background-color: var(--kv-bg-sidebar);"
  >
    <!-- Ortam adı başlığı: 64px -->
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b font-semibold text-[15px] gap-2"
      style="border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
    >
      <span class="flex-1 truncate">{{ guildsStore.activeGuild()?.name ?? '' }}</span>

      <!-- Ayarlar dişlisi — yalnız OWNER -->
      <button
        v-if="isOwner"
        class="shrink-0 w-7 h-7 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
        style="color: var(--kv-text-muted);"
        :title="t('common.settings')"
        @click="showSettings = true"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>

    <!-- Kanal listesi -->
    <div class="flex-1 overflow-y-auto pt-4 pb-20 px-2">
      <div
        class="mb-1 px-2 text-[11px] font-semibold uppercase tracking-widest"
        style="color: var(--kv-text-muted);"
      >
        {{ t('channel.textChannels') }}
      </div>

      <button
        v-for="channel in channelsStore.channelsForGuild(guildsStore.activeGuildId ?? '')"
        :key="channel.id"
        :class="[
          'w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--kv-radius-sm)] text-[14px] text-left cursor-pointer transition-colors',
          channelsStore.activeChannelId === channel.id
            ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-text-primary)]'
            : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-accent-subtle)] hover:text-[var(--kv-text-primary)]',
        ]"
        @click="selectChannel(channel)"
      >
        <span style="color: var(--kv-text-muted);">#</span>
        <span class="truncate">{{ channel.name }}</span>
      </button>

      <p
        v-if="!channelsStore.channelsForGuild(guildsStore.activeGuildId ?? '').length"
        class="px-2 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('channel.noChannels') }}
      </p>
    </div>
  </aside>

  <!-- Ortam Ayarları Modalı -->
  <GuildSettingsModal
    v-if="showSettings && guildsStore.activeGuild()"
    :guild="guildsStore.activeGuild()!"
    @close="showSettings = false"
    @updated="showSettings = false"
  />
</template>
