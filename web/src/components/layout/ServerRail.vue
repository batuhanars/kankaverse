<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import type { GuildDto } from '@/types'
import hexagonLogo from '@/assets/brand/kankaverse-hexagon.png'

defineProps<{
  onCreateGuild: () => void
  onJoinGuild: () => void
}>()

const { t } = useI18n()
const router = useRouter()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()

// ── Tooltip state ──
const tooltipVisible = ref(false)
const tooltipText = ref('')
const tooltipTop = ref(0)
const tooltipLeft = ref(0)

function showTooltip(event: MouseEvent, text: string) {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  tooltipText.value = text
  tooltipLeft.value = rect.right + 12
  tooltipTop.value = rect.top + rect.height / 2
  tooltipVisible.value = true
}

function hideTooltip() {
  tooltipVisible.value = false
}

function goHome() {
  router.push({ name: 'app' })
}

async function selectGuild(guild: GuildDto) {
  // Kanallar yüklü değilse önce fetch et
  if (!channelsStore.channelsForGuild(guild.id).length) {
    await channelsStore.fetchChannels(guild.id)
  }
  const channels = channelsStore.channelsForGuild(guild.id)
  if (channels.length > 0) {
    router.push({ name: 'channel', params: { guildId: guild.id, channelId: channels[0].id } })
  } else {
    // Kanal yok — guild'i aktif yap ama kanal route'u açma
    guildsStore.setActiveGuild(guild.id)
    channelsStore.setActiveChannel(null)
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
    <!-- Marka / home — guild'lerin üstünde sabit -->
    <div class="rail-item">
      <button
        class="guild-btn"
        @click="goHome"
        @mouseenter="showTooltip($event, t('brand.name'))"
        @mouseleave="hideTooltip"
      >
        <span :class="['hex-home', { 'hex-home--active': guildsStore.activeGuildId === null }]">
          <img :src="hexagonLogo" :alt="t('brand.name')" class="home-img" />
        </span>
      </button>
    </div>

    <div class="divider" />

    <!-- Guild ikonları -->
    <div
      v-for="guild in guildsStore.guilds"
      :key="guild.id"
      class="rail-item"
    >
      <!-- Okunmamış sol pill (aktif guild'de gösterme) -->
      <span
        class="unread-pill"
        :class="[
          guild.hasUnread && guildsStore.activeGuildId !== guild.id
            ? 'unread-pill--visible'
            : 'unread-pill--hidden',
        ]"
      />

      <button
        class="guild-btn"
        @click="selectGuild(guild)"
        @mouseenter="showTooltip($event, guild.name)"
        @mouseleave="hideTooltip"
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
    </div>

    <!-- Ayraç -->
    <div v-if="guildsStore.guilds.length" class="divider" />

    <!-- Ortam ekle -->
    <div class="rail-item">
      <button
        class="guild-btn add-btn"
        @click="onCreateGuild"
        @mouseenter="showTooltip($event, t('server.addOrtam'))"
        @mouseleave="hideTooltip"
      >
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
    </div>
  </nav>

  <!-- Tooltip — body'ye teleport, overflow kırpılmaz -->
  <Teleport to="body">
    <div
      v-if="tooltipVisible"
      class="rail-tooltip"
      role="tooltip"
      :style="{
        top: tooltipTop + 'px',
        left: tooltipLeft + 'px',
      }"
    >
      <span class="rail-tooltip__arrow" />
      <span class="rail-tooltip__text">{{ tooltipText }}</span>
    </div>
  </Teleport>
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
  overflow-x: hidden;
  flex-shrink: 0;
  width: 72px;
  background-color: var(--kv-bg-rail);
}

/* rail-item: konumlanma referansı */
.rail-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  flex-shrink: 0;
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

/* Marka/home hexagon — logo zaten hexagon şeklinde, clip-path gerekmez */
.hex-home {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  transition: transform 0.15s;
}

.home-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  pointer-events: none;
}

.guild-btn:hover .hex-home {
  transform: scale(1.05);
}

/* Home aktifken (guild seçili değilken) hafif accent parıltısı */
.hex-home--active .home-img {
  filter: drop-shadow(0 0 6px var(--kv-accent-500));
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

/* ── Okunmamış sol pill — rail içinde kalır (left: 0, taşma yok) ── */
.unread-pill {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  border-radius: 0 3px 3px 0;
  background-color: var(--kv-text-primary);
  transition: height 0.15s, opacity 0.15s;
}

.unread-pill--visible {
  height: 8px;
  opacity: 1;
}

.unread-pill--hidden {
  height: 0;
  opacity: 0;
}
</style>

<!-- Teleport hedefi body olduğu için scoped class çalışmaz — global stil -->
<style>
/* ── Rail tooltip (Teleport → body, fixed konumlama) ── */
.rail-tooltip {
  position: fixed;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  pointer-events: none;
  white-space: nowrap;
  z-index: 9999;
}

/* Sol-bakan ok (üçgen) */
.rail-tooltip__arrow {
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-right: 6px solid var(--kv-bg-elevated);
  flex-shrink: 0;
}

.rail-tooltip__text {
  display: block;
  padding: 5px 10px;
  background-color: var(--kv-bg-elevated);
  color: var(--kv-text-primary);
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--kv-radius-md);
  line-height: 1.4;
}
</style>
