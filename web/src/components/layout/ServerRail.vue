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

/** Pill CSS sınıfını hesapla — yalnızca aktiflik/hover, unread İLE İLGİSİ YOK */
function pillClass(guild: GuildDto): string {
  const isActive = guildsStore.activeGuildId === guild.id
  if (isActive) return 'pill--active'
  return 'pill--hidden'
}

/** Sayaç metnini formatla (>99 → "99+") */
function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
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
      <!-- Discord tarzı sol pill (animasyonlu: gizli / kısa / orta / uzun) -->
      <span :class="['pill', pillClass(guild)]" />

      <button
        class="guild-btn"
        @click="selectGuild(guild)"
        @mouseenter="showTooltip($event, guild.name)"
        @mouseleave="hideTooltip"
      >
        <!-- guild-icon-wrap: hover sınıfı eklemek için sarmalayıcı -->
        <span
          :class="[
            'hex-wrap',
            guildsStore.activeGuildId === guild.id ? 'hex-wrap--active' : 'hex-wrap--idle',
            guild.iconUrl ? 'hex-wrap--has-icon' : '',
          ]"
        >
          <span class="hex">
            <img
              v-if="guild.iconUrl"
              :src="guild.iconUrl"
              :alt="guild.name"
              class="hex-img"
            />
            <span v-else class="hex-label">{{ guildInitial(guild.name) }}</span>
          </span>

          <!-- Kırmızı sayaç rozeti — sağ-alt; aktif guild'de de gösterilir, yalnız 0'da gizlenir -->
          <span
            v-if="guild.unreadCount > 0"
            class="badge"
          >
            {{ badgeLabel(guild.unreadCount) }}
          </span>
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

/* rail-item: konumlanma referansı (pill + ikon + rozet için) */
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

/* ── Discord tarzı sol pill ──
   rail-item'ın soluna yapışık; taşma yok (overflow-x: hidden rail'de var).
   YALNIZCA hover + aktiflik göstergesi — unread ile İLGİSİ YOK.
   Yükseklik: gizli→0 / hover→20px / aktif→40px */
.pill {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  border-radius: 0 3px 3px 0;
  background-color: var(--kv-text-primary);
  transition: height 0.15s ease, opacity 0.15s ease;
  pointer-events: none;
}

.pill--hidden {
  height: 0;
  opacity: 0;
}

.pill--active {
  height: 40px;
  opacity: 1;
}

/* Hover'da pill orta boya çık (yalnızca gizli pill için) */
.rail-item:hover .pill--hidden {
  height: 20px;
  opacity: 1;
}

/* ── Hexagon sarmalayıcı (pozisyon referansı rozet için) ── */
.hex-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

/* ── Hexagon ── */
.hex {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  transition: background-color 0.15s, color 0.15s, border-radius 0.15s;
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

/* Aktif guild (harf-baş-harfi): hex arka planı accent */
.hex-wrap--active:not(.hex-wrap--has-icon) .hex {
  background-color: var(--kv-accent-500);
  color: #ffffff;
}

/* Aktif guild (görsel ikon): arka plan yok — aktiflik sol pill ile gösterilir */
.hex-wrap--active.hex-wrap--has-icon .hex {
  background-color: transparent;
}

/* Pasif guild (harf-baş-harfi): arka plan + hover (yumuşatılmış — border-radius geçişiyle) */
.hex-wrap--idle:not(.hex-wrap--has-icon) .hex {
  background-color: var(--kv-bg-elevated);
  color: var(--kv-text-secondary);
}

.guild-btn:hover .hex-wrap--idle:not(.hex-wrap--has-icon) .hex {
  background-color: var(--kv-accent-500);
  color: #ffffff;
  border-radius: 30%;
}

/* Görsel ikonlu guild: arka plan yok (ikon dolduruyor), hover accent de yok */
.hex-wrap--idle.hex-wrap--has-icon .hex {
  background-color: transparent;
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

/* "+" ekle butonu */
.hex--add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background-color: var(--kv-accent-subtle);
  color: var(--kv-accent-500);
  transition: background-color 0.15s, color 0.15s;
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

/* ── Kırmızı sayaç rozeti — sağ-alt köşe ── */
.badge {
  position: absolute;
  bottom: -2px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background-color: var(--kv-danger);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
  /* Rozet kırpılmasın — rail'in overflow-x: hidden'ından korunmak için
     badge hex-wrap içinde (rail dışına taşmaz, 48px + 4px sağda = ikon sınırı içinde) */
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
