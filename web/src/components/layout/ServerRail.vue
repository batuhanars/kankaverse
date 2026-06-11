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
  <nav class="rail">
    <!-- Guild ikonları -->
    <button
      v-for="guild in guildsStore.guilds"
      :key="guild.id"
      :title="guild.name"
      class="guild-btn"
      @click="selectGuild(guild)"
    >
      <span :class="['hex', guildsStore.activeGuildId === guild.id ? 'hex--active' : 'hex--idle']">
        <img
          v-if="guild.iconUrl"
          :src="guild.iconUrl"
          :alt="guild.name"
          class="hex-img"
        />
        <span v-else class="hex-label">{{ guildInitial(guild.name) }}</span>
      </span>
    </button>

    <!-- Ayraç -->
    <div v-if="guildsStore.guilds.length" class="divider" />

    <!-- Sunucu ekle — hexagonal, accent-subtle → hover accent-500 -->
    <button class="guild-btn add-btn" title="Sunucu Ekle" @click="onCreateGuild">
      <span class="hex hex--add">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
    </button>
  </nav>
</template>

<style scoped>
/* Hexagon clip-path — tek doğruluk kaynağı burada, inline style yok */
.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  overflow-y: auto;
  flex-shrink: 0;
  width: 72px;
  background-color: var(--kv-bg-rail);
}

.guild-btn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.hex {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  transition: background-color 0.15s, color 0.15s;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}

.hex-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hex-label {
  pointer-events: none;
}

/* Aktif guild */
.hex--active {
  background-color: var(--kv-accent-500);
  color: #ffffff;
}

/* Pasif guild */
.hex--idle {
  background-color: var(--kv-bg-elevated);
  color: var(--kv-text-secondary);
}

.guild-btn:hover .hex--idle {
  background-color: var(--kv-accent-500);
  color: #ffffff;
}

/* "+" ekle butonu — marka rengi, şeffaf zemin → hover'da opak */
.hex--add {
  background-color: var(--kv-accent-subtle);
  color: var(--kv-accent-500);
}

.add-btn:hover .hex--add {
  background-color: var(--kv-accent-500);
  color: #ffffff;
}

.add-btn:active .hex--add {
  background-color: var(--kv-accent-600);
}

.divider {
  width: 32px;
  height: 1px;
  background-color: var(--kv-border-strong);
  margin: 4px 0;
}
</style>
