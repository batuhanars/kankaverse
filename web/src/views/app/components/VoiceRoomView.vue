<script setup lang="ts">
/**
 * VoiceRoomView — ses kanalına girildiğinde merkez alanda gösterilir (sohbet yerine).
 * Üstte kanal başlığı, ortada Discord-tarzı katılımcı kartları (avatar + konuşma halkası + mute),
 * altta kontrol barı (sustur / sağırlaştır / ayrıl). Katılımcılar LiveKit Room'dan canlı gelir.
 *
 * R11 — ses moderasyonu: izinli kullanıcı, kendi+owner DIŞINDAKİ katılımcıya hover ⋯ menüsünden
 * "Sustur/Susturmayı Kaldır" (MUTE_MEMBERS) ve "Taşı" (MOVE_MEMBERS) uygular. Moderatör-mute göstergesi
 * self-mute ikonundan görsel ayrışır.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@vueuse/core'
import { useVoiceStore, type RoomMember } from '@/stores/voice'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useToastStore } from '@/stores/toast'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { voiceApi } from '@/api/voice'
import type { ChannelDto } from '@/types'
import VoiceControlBar from '@/components/shared/VoiceControlBar.vue'
import VoiceVideoGrid from '@/components/shared/VoiceVideoGrid.vue'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'

const { t } = useI18n()
const voiceStore = useVoiceStore()
const channelsStore = useChannelsStore()
const guildsStore = useGuildsStore()
const toast = useToastStore()

// Aktif kanal (ses) store'dan — prop'suz; <component :is> ile metin varyantıyla simetrik
const channelId = computed(() => channelsStore.activeChannelId ?? '')
const channelName = computed(() => channelsStore.activeChannel()?.name ?? '')
const guildId = computed(() => channelsStore.activeChannel()?.guildId ?? '')
const connectedHere = computed(() => voiceStore.connectedChannelId === channelId.value)
const members = computed<RoomMember[]>(() => (connectedHere.value ? voiceStore.roomParticipants : []))

// R11 izinler (UX kapısı — otorite backend)
const { can } = useGuildPermissions(() => guildId.value)
const canMute = computed(() => can('MUTE_MEMBERS'))
const canMove = computed(() => can('MOVE_MEMBERS'))

// Hedef owner mı? (owner hedeflenemez)
const ownerId = computed(() => guildsStore.guilds.find((g) => g.id === guildId.value)?.ownerId ?? null)
function isOwner(m: RoomMember): boolean {
  return !!ownerId.value && m.userId === ownerId.value
}

// Bu katılımcıda moderasyon menüsü gösterilsin mi (kendi/owner hariç + en az bir izin)
function canModerate(m: RoomMember): boolean {
  if (m.isLocal || isOwner(m)) return false
  return canMute.value || canMove.value
}

// Taşınabilecek diğer ses kanalları (aynı guild, mevcut kanal hariç)
const moveTargets = computed<ChannelDto[]>(() =>
  channelsStore
    .channelsForGuild(guildId.value)
    .filter((c) => c.type === 'GUILD_VOICE' && c.id !== channelId.value),
)

function isSpeaking(m: RoomMember): boolean {
  return voiceStore.speakingUserIds.has(m.userId) && !isMutedFor(m)
}
function isMutedFor(m: RoomMember): boolean {
  return m.isLocal ? voiceStore.isMuted : voiceStore.mutedUserIds.has(m.userId)
}
function isServerMutedFor(m: RoomMember): boolean {
  return !m.isLocal && voiceStore.serverMutedUserIds.has(m.userId)
}

// ── Aksiyon menüsü (hover ⋯ → küçük dropdown) ────────────────────────────────
const openMenuUserId = ref<string | null>(null)
const moveSubmenuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
onClickOutside(menuRef, () => { openMenuUserId.value = null; moveSubmenuOpen.value = false })

function toggleMenu(userId: string) {
  if (openMenuUserId.value === userId) {
    openMenuUserId.value = null
  } else {
    openMenuUserId.value = userId
  }
  moveSubmenuOpen.value = false
}
function closeMenu() {
  openMenuUserId.value = null
  moveSubmenuOpen.value = false
}

async function toggleServerMute(m: RoomMember) {
  closeMenu()
  try {
    if (isServerMutedFor(m)) await voiceApi.unmute(channelId.value, m.userId)
    else await voiceApi.mute(channelId.value, m.userId)
    // Set güncellemesi WS (voice.participant_muted/unmuted) ile gelir.
  } catch (e: unknown) {
    toast.error(errMessage(e, 'voice.muteFailed'))
  }
}

async function moveTo(m: RoomMember, target: ChannelDto) {
  closeMenu()
  try {
    await voiceApi.move(channelId.value, m.userId, target.id)
  } catch (e: unknown) {
    toast.error(errMessage(e, 'voice.moveFailed'))
  }
}

async function stopBroadcast(m: RoomMember) {
  closeMenu()
  try {
    await voiceApi.stopBroadcast(channelId.value, m.userId)
  } catch (e: unknown) {
    toast.error(errMessage(e, 'voice.stopBroadcastFailed'))
  }
}

// Odadan çıkar — onaylı
const disconnectTarget = ref<RoomMember | null>(null)
function askDisconnect(m: RoomMember) {
  closeMenu()
  disconnectTarget.value = m
}
async function doDisconnect() {
  if (!disconnectTarget.value) return
  const target = disconnectTarget.value
  disconnectTarget.value = null
  try {
    await voiceApi.disconnect(channelId.value, target.userId)
  } catch (e: unknown) {
    toast.error(errMessage(e, 'voice.disconnectFailed'))
  }
}

function isBroadcastingFor(m: RoomMember): boolean {
  return voiceStore.isBroadcasting(channelId.value, m.userId)
}

function errMessage(e: unknown, fallbackKey: string): string {
  const err = e as { response?: { data?: { message?: string } } }
  return err.response?.data?.message ?? t(fallbackKey)
}
</script>

<template>
  <div class="flex flex-col flex-1 min-h-0 overflow-hidden rounded-[var(--kv-radius-lg)]" style="background-color: var(--kv-bg-content);">
    <!-- Orta: katılımcı kartları — üst başlık GuildTopBar'a taşındı -->
    <div class="flex-1 min-h-0 overflow-y-auto p-6">
      <!-- Bağlanılıyor -->
      <div v-if="!connectedHere && voiceStore.connecting" class="h-full flex items-center justify-center">
        <p class="text-[15px]" style="color: var(--kv-text-muted);">{{ t('voice.joining') }}</p>
      </div>
      <!-- Bağlı değil → Discord-benzeri ortalanmış çağrı -->
      <div v-else-if="!connectedHere" class="h-full flex flex-col items-center justify-center gap-4">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
        <div class="flex flex-col items-center gap-1.5">
          <span class="text-[22px] font-semibold" style="color: var(--kv-text-primary);">{{ channelName }}</span>
          <p class="text-[14px]" style="color: var(--kv-text-muted);">{{ t('voice.notConnected') }}</p>
        </div>
        <button
          class="px-6 py-2.5 rounded-[var(--kv-radius-md)] text-[15px] font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
          style="background-color: var(--kv-accent-500);"
          @click="voiceStore.join(channelId)"
        >{{ t('voice.joinAction') }}</button>
        <p v-if="voiceStore.error" class="text-[13px]" style="color: var(--kv-danger);">{{ voiceStore.error }}</p>
      </div>
      <!-- C4: Video grid (yalnız aktif video track varsa görünür) -->
      <div v-else-if="voiceStore.videoTracks.length" class="flex flex-col gap-4">
        <VoiceVideoGrid />
        <!-- Katılımcı ızgarası — video varken küçük görünür (video-dışı katılımcılar) -->
        <div class="flex flex-wrap gap-4 justify-center content-start">
          <div
            v-for="m in members.filter(m => !voiceStore.videoTracks.some(e => e.participantId === m.userId))"
            :key="m.userId"
            class="group relative flex flex-col items-center gap-2 w-[160px] py-6 rounded-[var(--kv-radius-lg)]"
            style="background-color: var(--kv-bg-elevated);"
          >
            <div
              class="w-20 h-20 rounded-full flex items-center justify-center text-[28px] font-bold text-white overflow-hidden"
              :class="{ 'kv-speaking': isSpeaking(m) }"
              style="background-color: var(--kv-accent-500);"
            >
              <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.username" class="w-full h-full object-cover" />
              <span v-else>{{ m.username[0]?.toUpperCase() }}</span>
            </div>
            <div class="flex items-center gap-1.5 max-w-full">
              <svg v-if="isServerMutedFor(m)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
                <path d="M12 2L4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5l-8-3z"/>
                <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
              </svg>
              <svg v-else-if="isMutedFor(m)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
              </svg>
              <span class="text-[14px] truncate" style="color: var(--kv-text-primary);">
                {{ m.username }}<template v-if="m.isLocal"> ({{ t('voice.you') }})</template>
              </span>
              <!-- #1 YAYINDA rozeti (video ızgarasında video-dışı kartlar) -->
              <span
                v-if="isBroadcastingFor(m)"
                class="text-[10px] font-bold px-1.5 py-0.5 rounded-sm leading-none shrink-0"
                style="background-color: var(--kv-accent-500); color: #fff;"
              >
                {{ t('voice.live') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Katılımcı ızgarası — video track yok, ses-only -->
      <!-- Kimse yok durumu (bağlı ama oda boş) -->
      <div v-else-if="!members.length" class="h-full flex flex-col items-center justify-center gap-3">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
        <p class="text-[15px]" style="color: var(--kv-text-muted);">{{ t('voice.emptyRoom') }}</p>
      </div>
      <div v-else class="flex flex-wrap gap-4 justify-center content-start">
        <div
          v-for="m in members"
          :key="m.userId"
          class="group relative flex flex-col items-center gap-2 w-[160px] py-6 rounded-[var(--kv-radius-lg)]"
          style="background-color: var(--kv-bg-elevated);"
        >
          <!-- R11: moderasyon menüsü (kendi+owner hariç, izinli kullanıcı) -->
          <div
            v-if="canModerate(m)"
            class="absolute top-2 right-2 transition-opacity"
            :class="openMenuUserId === m.userId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
          >
            <button
              class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-rail)]"
              style="width: 24px; height: 24px; color: var(--kv-text-muted);"
              :aria-label="t('voice.moderationMenu')"
              @click.stop="toggleMenu(m.userId)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="1" fill="currentColor"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
                <circle cx="12" cy="19" r="1" fill="currentColor"/>
              </svg>
            </button>

            <!-- Dropdown -->
            <div
              v-if="openMenuUserId === m.userId"
              ref="menuRef"
              class="absolute right-0 top-full mt-1 z-20 rounded-[var(--kv-radius-md)] border overflow-hidden"
              style="min-width: 180px; background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
              @click.stop
            >
              <!-- Sustur / Susturmayı kaldır -->
              <button
                v-if="canMute"
                class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                style="color: var(--kv-text-secondary);"
                @click="toggleServerMute(m)"
              >
                {{ isServerMutedFor(m) ? t('voice.serverUnmute') : t('voice.serverMute') }}
              </button>
              <!-- Taşı (alt-liste) -->
              <template v-if="canMove">
                <button
                  class="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                  style="color: var(--kv-text-secondary);"
                  @click.stop="moveSubmenuOpen = !moveSubmenuOpen"
                >
                  <span>{{ t('voice.moveTo') }}</span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                    class="shrink-0 transition-transform" :class="moveSubmenuOpen ? 'rotate-90' : ''"
                  >
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
                <div
                  v-if="moveSubmenuOpen"
                  class="max-h-56 overflow-y-auto border-t"
                  style="border-color: var(--kv-border-subtle);"
                >
                  <p
                    v-if="moveTargets.length === 0"
                    class="px-3 py-2 text-[12px]"
                    style="color: var(--kv-text-muted);"
                  >
                    {{ t('voice.noMoveTargets') }}
                  </p>
                  <button
                    v-for="target in moveTargets"
                    :key="target.id"
                    class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)] truncate"
                    style="color: var(--kv-text-secondary);"
                    @click="moveTo(m, target)"
                  >
                    {{ target.name }}
                  </button>
                </div>
              </template>
              <!-- Yayını Durdur (MUTE_MEMBERS, yalnız yayın yapıyorsa) -->
              <button
                v-if="canMute && isBroadcastingFor(m)"
                class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                style="color: var(--kv-text-secondary);"
                @click="stopBroadcast(m)"
              >
                {{ t('voice.stopBroadcast') }}
              </button>
              <!-- Odadan Çıkar (MOVE_MEMBERS) -->
              <button
                v-if="canMove"
                class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                style="color: var(--kv-danger);"
                @click="askDisconnect(m)"
              >
                {{ t('voice.disconnectUser') }}
              </button>
            </div>
          </div>

          <!-- Avatar + konuşma halkası (animasyonlu) -->
          <div
            class="w-20 h-20 rounded-full flex items-center justify-center text-[28px] font-bold text-white overflow-hidden"
            :class="{ 'kv-speaking': isSpeaking(m) }"
            style="background-color: var(--kv-accent-500);"
          >
            <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.username" class="w-full h-full object-cover" />
            <span v-else>{{ m.username[0]?.toUpperCase() }}</span>
          </div>
          <!-- Ad + mute göstergeleri + YAYINDA rozeti -->
          <div class="flex items-center gap-1.5 max-w-full">
            <!-- R11: moderatör (server) susturması — self-mute ikonundan ayrışan kalkan ikonu -->
            <svg v-if="isServerMutedFor(m)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0" :aria-label="t('voice.serverMuted')">
              <title>{{ t('voice.serverMuted') }}</title>
              <path d="M12 2L4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5l-8-3z"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
            </svg>
            <!-- Self / track mute (mevcut) -->
            <svg v-else-if="isMutedFor(m)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
            <span class="text-[14px] truncate" style="color: var(--kv-text-primary);">
              {{ m.username }}<template v-if="m.isLocal"> ({{ t('voice.you') }})</template>
            </span>
            <!-- #1 YAYINDA rozeti (ses odasında da göster) -->
            <span
              v-if="isBroadcastingFor(m)"
              class="text-[10px] font-bold px-1.5 py-0.5 rounded-sm leading-none shrink-0"
              style="background-color: var(--kv-accent-500); color: #fff;"
            >
              {{ t('voice.live') }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Alt kontrol barı (paylaşılan) -->
    <div v-if="connectedHere" class="shrink-0 py-4 border-t" style="border-color: var(--kv-border-subtle);">
      <VoiceControlBar />
    </div>
  </div>

  <!-- Odadan çıkar onay dialog -->
  <ConfirmDialog
    v-if="disconnectTarget"
    :message="t('voice.disconnectConfirm', { username: disconnectTarget.username })"
    :confirm-label="t('voice.disconnectUser')"
    @confirm="doDisconnect"
    @cancel="disconnectTarget = null"
  />
</template>
