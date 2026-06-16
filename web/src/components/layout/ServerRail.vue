<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useAuthStore } from '@/stores/auth'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { guildsApi } from '@/api/guilds'
import GuildSettingsView from '@/views/app/components/GuildSettingsView.vue'
import InvitePeopleModal from '@/components/layout/InvitePeopleModal.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { GuildDto } from '@/types'
import hexagonLogo from '@/assets/brand/kankaverse-hexagon.png'

defineProps<{
  onCreateGuild: () => void
  onJoinGuild: () => void
}>()

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const authStore = useAuthStore()

// ── Sağ-tık context menüsü (cursor-konumlu; UserCardPopover deseni) ──
// contextGuild: hangi ortama sağ-tıklandı (aktif ortam DEĞİL; hedef ortam).
const contextGuild = ref<GuildDto | null>(null)
const ctxX = ref(0)
const ctxY = ref(0)

// Hedef ortamın izinleri (aktif ortam değil — sağ-tıklanan).
// reaktif: contextGuild değişince yeni guild.id'ye çözülür.
const { can: ctxCan, canOpenSettings: ctxCanOpenSettings, isOwner: ctxIsOwner } =
  useGuildPermissions(() => contextGuild.value?.id ?? '')

// Menü panel ölçüleri (kenar-taşma clamp'i için)
const CTX_MENU_W = 200
const CTX_MENU_H = 160

const ctxPosStyle = computed(() => {
  const left = Math.min(ctxX.value, window.innerWidth - CTX_MENU_W - 8)
  const top = Math.min(ctxY.value, window.innerHeight - CTX_MENU_H - 8)
  return `top:${Math.max(8, top)}px;left:${Math.max(8, left)}px;`
})

function openGuildContext(event: MouseEvent, guild: GuildDto) {
  // Bu sağ-tık document'taki 'contextmenu' kapatıcısına ULAŞMASIN — yoksa menü
  // açıldığı anda aynı event onu kapatır (açılmıyor görünür). Başka ortama sağ-tık
  // yine geçer (stop yalnız bu event'i document'tan korur, menüyü kapatmaz).
  event.stopPropagation()
  ctxX.value = event.clientX
  ctxY.value = event.clientY
  contextGuild.value = guild
}

function closeGuildContext() {
  contextGuild.value = null
}

// Dışarı-tık / Esc / scroll ile kapan (UserCardPopover: setTimeout ile aynı-tık çakışmasını önle)
function onDocPointer() {
  // Modal açıkken (davet/ayarlar/ayrıl) menü zaten kapanmış olur; yine de güvenli.
  closeGuildContext()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeGuildContext()
}
function onScroll() {
  closeGuildContext()
}
onMounted(() => {
  document.addEventListener('click', onDocPointer)
  document.addEventListener('contextmenu', onDocPointer)
  document.addEventListener('keydown', onKey)
  // capture: rail kendi içinde scroll edebilir → yakala
  window.addEventListener('scroll', onScroll, true)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocPointer)
  document.removeEventListener('contextmenu', onDocPointer)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('scroll', onScroll, true)
})

// ── Menü aksiyonları (hedef = contextGuild) → menü kapanır, modal açılır ──
const showInvite = ref(false)
const showSettings = ref(false)
const showLeaveConfirm = ref(false)
const leaving = ref(false)
const leaveError = ref('')

// Modallar contextGuild snapshot'ına bağlanır; menü kapanırken contextGuild
// sıfırlanmasın diye aksiyon anında ayrı bir actionGuild'e kopyalıyoruz.
const actionGuild = ref<GuildDto | null>(null)

function openInvite() {
  actionGuild.value = contextGuild.value
  closeGuildContext()
  showInvite.value = true
}
function openSettings() {
  actionGuild.value = contextGuild.value
  closeGuildContext()
  showSettings.value = true
}
function openLeave() {
  actionGuild.value = contextGuild.value
  leaveError.value = ''
  closeGuildContext()
  showLeaveConfirm.value = true
}

// Ortam ayarları penceresi OWNER bayrağı (ChannelPanel ile aynı: ownerId === ben)
const settingsIsOwner = computed(() => {
  const g = actionGuild.value
  return !!g && !!authStore.user && g.ownerId === authStore.user.id
})
// MANAGE_CHANNELS = ChannelPanel'deki "isAdmin" (kanal yönetimi) — settings içi gating
const settingsCan = useGuildPermissions(() => actionGuild.value?.id ?? '')
const settingsIsAdmin = computed(() => settingsCan.can('MANAGE_CHANNELS'))

// ── Ortamdan ayrıl (ChannelPanel.doLeave akışının aynası) ──
async function doLeave() {
  const guild = actionGuild.value
  if (!guild) return
  leaving.value = true
  leaveError.value = ''
  try {
    await guildsApi.leaveGuild(guild.id)
    guildsStore.removeGuildLocal(guild.id)
    showLeaveConfirm.value = false
    // Ayrılınan ortam aktifse anasayfaya dön; değilse mevcut görünüm korunur
    if (guildsStore.activeGuildId === guild.id || route.params.guildId === guild.id) {
      router.push({ name: 'app' })
    }
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    leaveError.value = err.response?.data?.message ?? t('common.error')
  } finally {
    leaving.value = false
  }
}

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

function goDiscover() {
  router.push({ name: 'discover' })
}

async function selectGuild(guild: GuildDto) {
  // Kanallar yüklü değilse önce fetch et (kategorilerle birlikte)
  if (!channelsStore.channelsForGuild(guild.id).length) {
    await channelsStore.fetchChannelsAndCategories(guild.id, authStore.user?.id)
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

/** Pill CSS sınıfını hesapla — öncelik: aktif > (hover CSS'de) > unread-dot > gizli */
function pillClass(guild: GuildDto): string {
  const isActive = guildsStore.activeGuildId === guild.id
  if (isActive) return 'pill--active'
  if (guild.unreadCount > 0) return 'pill--unread'
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
        @contextmenu.prevent="openGuildContext($event, guild)"
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

          <!-- REV-4: kırmızı sayaç = okunmamış BAHSETME (generic unread değil; o beyaz pill'de).
               Sağ-alt; aktif guild'de de gösterilir, yalnız 0'da gizlenir -->
          <span
            v-if="guild.unreadMentionCount > 0"
            class="badge"
          >
            {{ badgeLabel(guild.unreadMentionCount) }}
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

    <!-- Keşfet / pusula girişi — Ortam Ekle'nin altında -->
    <div class="rail-item">
      <span :class="['pill', route.name === 'discover' ? 'pill--active' : 'pill--hidden']" />
      <button
        class="guild-btn"
        @click="goDiscover"
        @mouseenter="showTooltip($event, t('discover.railTooltip'))"
        @mouseleave="hideTooltip"
      >
        <span :class="['hex', 'hex--discover', { 'hex--discover-active': route.name === 'discover' }]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
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

  <!-- ── Ortam sağ-tık context menüsü (cursor-konumlu; body'ye teleport) ── -->
  <Teleport to="body">
    <div
      v-if="contextGuild"
      class="rail-ctx"
      role="menu"
      :style="ctxPosStyle"
      @click.stop
      @contextmenu.prevent.stop
    >
      <!-- Üye Davet Et — CREATE_INVITE -->
      <button
        v-if="ctxCan('CREATE_INVITE')"
        class="rail-ctx__item"
        role="menuitem"
        @click="openInvite"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="rail-ctx__icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        <span>{{ t('invitePeople.title') }}</span>
      </button>

      <!-- Ortam Ayarları — canOpenSettings -->
      <button
        v-if="ctxCanOpenSettings"
        class="rail-ctx__item"
        role="menuitem"
        @click="openSettings"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="rail-ctx__icon"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>{{ t('guildSettings.title') }}</span>
      </button>

      <!-- Ayraç + Ortamdan Ayrıl — OWNER hariç (owner ayrılamaz) -->
      <template v-if="!ctxIsOwner">
        <div
          v-if="ctxCan('CREATE_INVITE') || ctxCanOpenSettings"
          class="rail-ctx__divider"
        />
        <button
          class="rail-ctx__item rail-ctx__item--danger"
          role="menuitem"
          @click="openLeave"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="rail-ctx__icon"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span>{{ t('guild.leave') }}</span>
        </button>
      </template>
    </div>
  </Teleport>

  <!-- ── Sağ-tıklanan ortam için barındırılan modallar (actionGuild) ── -->
  <!-- Üye Davet Et -->
  <InvitePeopleModal
    v-if="showInvite && actionGuild"
    :guild-id="actionGuild.id"
    @close="showInvite = false"
  />

  <!-- Ortam Ayarları (tam-ekran) -->
  <GuildSettingsView
    v-if="showSettings && actionGuild"
    :guild="actionGuild"
    :is-owner="settingsIsOwner"
    :is-admin="settingsIsAdmin"
    @close="showSettings = false"
  />

  <!-- Ortamdan Ayrıl onayı -->
  <ConfirmDialog
    v-if="showLeaveConfirm && actionGuild"
    :title="t('guild.leaveTitle')"
    :message="leaveError || t('guild.leaveConfirm', { name: actionGuild.name })"
    :confirm-label="t('guild.leave')"
    :loading="leaving"
    @confirm="doLeave"
    @cancel="showLeaveConfirm = false; leaveError = ''"
  />
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

/* Unread varsa küçük yuvarlak dot — aktif değil, hover değil */
.pill--unread {
  height: 8px;
  border-radius: 50%;
  opacity: 1;
}

/* Hover'da pill orta boya çık — gizli veya unread-dot üzerinde */
.rail-item:hover .pill--hidden,
.rail-item:hover .pill--unread {
  height: 20px;
  border-radius: 0 3px 3px 0;
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

/* Keşfet / pusula hexagon — idle nötr, hover/aktif accent */
.hex--discover {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  overflow: hidden;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background-color: var(--kv-bg-elevated);
  color: var(--kv-text-secondary);
  transition: background-color 0.15s, color 0.15s, border-radius 0.15s;
}

.guild-btn:hover .hex--discover {
  background-color: var(--kv-accent-500);
  color: #ffffff;
  border-radius: 30%;
}

.hex--discover-active {
  background-color: var(--kv-accent-500);
  color: #ffffff;
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

/* ── Ortam sağ-tık context menüsü (Teleport → body, fixed konumlama) ──
   GuildMemberRow/ChannelPanel dropdown'larıyla görsel tutarlı: elevated bg,
   ince subtle kenarlık, gölge YOK. */
.rail-ctx {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  padding: 4px;
  background-color: var(--kv-bg-elevated);
  border: 1px solid var(--kv-border-subtle);
  border-radius: var(--kv-radius-md);
  overflow: hidden;
}

.rail-ctx__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--kv-radius-sm);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: var(--kv-text-primary);
  background: transparent;
  border: none;
  transition: background-color 0.12s;
}

.rail-ctx__item:hover {
  background-color: var(--kv-accent-subtle);
}

.rail-ctx__icon {
  flex-shrink: 0;
  color: var(--kv-text-muted);
}

.rail-ctx__item--danger {
  color: var(--kv-danger);
}

.rail-ctx__item--danger .rail-ctx__icon {
  color: var(--kv-danger);
}

.rail-ctx__item--danger:hover {
  background-color: rgba(242, 59, 75, 0.1);
}

.rail-ctx__divider {
  height: 1px;
  margin: 4px 6px;
  background-color: var(--kv-border-subtle);
}
</style>
