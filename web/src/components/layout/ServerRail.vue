<script setup lang="ts">
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import type { GuildDto } from '@/types'

defineProps<{
  onCreateGuild: () => void
  onJoinGuild: () => void
}>()

const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()

async function selectGuild(guild: GuildDto) {
  guildsStore.setActiveGuild(guild.id)
  await channelsStore.fetchChannels(guild.id)
  const channels = channelsStore.channelsForGuild(guild.id)
  if (channels.length > 0) {
    channelsStore.setActiveChannel(channels[0].id)
  }
}

function guildInitial(name: string) {
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}
</script>

<template>
  <nav
    class="flex flex-col items-center gap-2 py-3 overflow-y-auto shrink-0"
    style="width: 72px; background-color: var(--kv-bg-rail);"
  >
    <!-- Guild ikonları -->
    <button
      v-for="guild in guildsStore.guilds"
      :key="guild.id"
      :title="guild.name"
      :class="[
        'w-12 h-12 flex items-center justify-center text-[13px] font-semibold transition-all cursor-pointer',
        'text-[var(--kv-text-secondary)] hover:text-white',
        guildsStore.activeGuildId === guild.id
          ? 'bg-[var(--kv-accent-500)] text-white'
          : 'bg-[var(--kv-bg-elevated)] hover:bg-[var(--kv-accent-subtle)]',
      ]"
      style="clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"
      @click="selectGuild(guild)"
    >
      <img
        v-if="guild.iconUrl"
        :src="guild.iconUrl"
        :alt="guild.name"
        class="w-full h-full object-cover"
        style="clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);"
      />
      <span v-else>{{ guildInitial(guild.name) }}</span>
    </button>

    <!-- Ayraç -->
    <div v-if="guildsStore.guilds.length" class="w-8 h-px bg-[var(--kv-border-strong)] my-1" />

    <!-- Sunucu oluştur / katıl -->
    <button
      title="Sunucu Ekle"
      class="w-12 h-12 flex items-center justify-center text-[24px] font-light bg-[var(--kv-bg-elevated)] text-[var(--kv-success)] hover:bg-[var(--kv-success)] hover:text-white transition-all cursor-pointer rounded-full"
      @click="onCreateGuild"
    >
      +
    </button>
  </nav>
</template>
