<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useSocket } from '@/composables/useSocket'
import type { ChannelDto } from '@/types'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
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
    class="flex flex-col h-full shrink-0 rounded-r-[var(--kv-radius-lg)] overflow-hidden"
    style="width: 264px; background-color: var(--kv-bg-sidebar);"
  >
    <!-- Ortam adı başlığı: 64px -->
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b font-semibold text-[15px]"
      style="border-color: var(--kv-border-subtle); color: var(--kv-text-primary);"
    >
      {{ guildsStore.activeGuild()?.name ?? '' }}
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
</template>
