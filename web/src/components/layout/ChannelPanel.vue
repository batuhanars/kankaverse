<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useAuthStore } from '@/stores/auth'
import { useSocket } from '@/composables/useSocket'
import type { ChannelDto } from '@/types'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const authStore = useAuthStore()
const { joinChannel, leaveChannel } = useSocket()

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
    class="flex flex-col shrink-0 border-r"
    style="width: 248px; background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
  >
    <!-- Guild başlık -->
    <div
      class="h-12 flex items-center px-4 border-b font-semibold text-[15px] text-[var(--kv-text-primary)]"
      style="border-color: var(--kv-border-subtle);"
    >
      {{ guildsStore.activeGuild()?.name ?? '' }}
    </div>

    <!-- Kanal listesi -->
    <div class="flex-1 overflow-y-auto py-4 px-2">
      <div
        class="mb-1 px-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--kv-text-muted)]"
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
            : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-bg-elevated)] hover:text-[var(--kv-text-body)]',
        ]"
        @click="selectChannel(channel)"
      >
        <span class="text-[var(--kv-text-muted)]">#</span>
        <span class="truncate">{{ channel.name }}</span>
      </button>

      <p
        v-if="!channelsStore.channelsForGuild(guildsStore.activeGuildId ?? '').length"
        class="px-2 text-[13px] text-[var(--kv-text-muted)]"
      >
        {{ t('channel.noChannels') }}
      </p>
    </div>

    <!-- Alt kullanıcı çubuğu -->
    <div
      class="h-14 flex items-center gap-2 px-3 border-t"
      style="background-color: var(--kv-bg-rail); border-color: var(--kv-border-subtle);"
    >
      <div
        class="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--kv-bg-elevated)] text-[13px] font-semibold text-[var(--kv-text-secondary)]"
      >
        {{ authStore.user?.username.charAt(0).toUpperCase() }}
      </div>
      <div class="flex flex-col min-w-0">
        <span class="text-[13px] font-semibold text-[var(--kv-text-primary)] truncate">
          {{ authStore.user?.username }}
        </span>
        <span class="text-[11px] text-[var(--kv-text-muted)]">çevrimiçi</span>
      </div>
    </div>
  </aside>
</template>
