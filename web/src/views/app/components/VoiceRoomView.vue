<script setup lang="ts">
/**
 * VoiceRoomView — ses kanalına girildiğinde merkez alanda gösterilir (sohbet yerine).
 * Üstte kanal başlığı, ortada Discord-tarzı katılımcı kartları, altta kontrol barı.
 *
 * Kart ızgarası (C4 §D2): her katılımcı TEK kart. Kamera/ekran yayınlıyorsa kartta o video,
 * yoksa avatar görünür. Kartlar katılımcı sayısına göre ekranı böler (1→tam, 2→yan yana, …);
 * ızgara `flex-1 min-h-0`, kontrol barı `shrink-0` → alt butonlar HER ZAMAN görünür.
 *
 * R11 — ses moderasyonu: izinli kullanıcı, kendi+owner DIŞINDAKİ katılımcıya hover ⋯ menüsünden
 * "Sustur/Susturmayı Kaldır" (MUTE_MEMBERS) ve "Taşı" (MOVE_MEMBERS) uygular.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@vueuse/core'
import { useVoiceStore, type RoomMember, type VideoTrackEntry } from '@/stores/voice'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useToastStore } from '@/stores/toast'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { voiceApi } from '@/api/voice'
import type { ChannelDto } from '@/types'
import VoiceControlBar from '@/components/shared/VoiceControlBar.vue'
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

// FIX 2 — yayın yapanlar üstte (stable sort)
const sortedMembers = computed<RoomMember[]>(() =>
  [...members.value].sort((a, b) => {
    const aLive = isBroadcastingFor(a) ? 0 : 1
    const bLive = isBroadcastingFor(b) ? 0 : 1
    return aLive - bLive
  }),
)

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

// ── Kart ızgarası (Discord-tarzı) ────────────────────────────────────────────
// Her katılımcı bir kart. Video track'i (kamera/ekran) olan tile video; olmayan avatar.
// Bir katılımcı hem kamera hem ekran paylaşırsa iki ayrı video tile olur (Discord gibi).
type VoiceTile =
  | { key: string; kind: 'video'; member: RoomMember | null; entry: VideoTrackEntry }
  | { key: string; kind: 'avatar'; member: RoomMember; entry?: undefined }

function memberById(id: string): RoomMember | null {
  return members.value.find((m) => m.userId === id) ?? null
}

const tiles = computed<VoiceTile[]>(() => {
  const videoTiles: VoiceTile[] = voiceStore.videoTracks.map((e) => ({
    key: `${e.participantId}:${e.trackKind}`,
    kind: 'video',
    member: memberById(e.participantId),
    entry: e,
  }))
  const withVideo = new Set(voiceStore.videoTracks.map((e) => e.participantId))
  const avatarTiles: VoiceTile[] = sortedMembers.value
    .filter((m) => !withVideo.has(m.userId))
    .map((m) => ({ key: m.userId, kind: 'avatar', member: m }))
  return [...videoTiles, ...avatarTiles]
})

// Kolon sayısı katılımcı sayısına göre: 1→1, 2-4→2, 5-9→3, 10+→4.
// grid-auto-rows 1fr → satırlar yüksekliği eşit böler (kartlar ekranı doldurur).
const gridStyle = computed(() => {
  const n = Math.max(tiles.value.length, 1)
  const cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridAutoRows: 'minmax(0, 1fr)',
  }
})

function tileName(tile: VoiceTile): string {
  return tile.member?.username ?? tile.entry?.username ?? ''
}
function tileIsLocal(tile: VoiceTile): boolean {
  return tile.member?.isLocal ?? tile.entry?.isLocal ?? false
}

// Video track → <video> bağlama (function ref; el null'da no-op)
function attachVideo(el: Element | null, entry?: VideoTrackEntry) {
  if (!el || !entry) return
  try {
    entry.track.attach(el as HTMLVideoElement)
  } catch {
    /* track zaten detach edilmiş olabilir — yoksay */
  }
}

// Tek kartı tam-ekran yap (video oynatıcı konvansiyonu)
async function toggleTileFullscreen(e: Event) {
  const el = (e.currentTarget as HTMLElement).closest('.kv-video-tile') as HTMLElement | null
  if (!el) return
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await el.requestFullscreen()
  } catch {
    /* yoksay */
  }
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
  <div class="flex flex-col flex-1 min-h-0 overflow-hidden mr-4 rounded-[var(--kv-radius-lg)]" style="background-color: var(--kv-bg-content);">
    <!-- Üst başlık: ses kanalı adı -->
    <div class="shrink-0 flex items-center gap-2 px-4 h-14 border-b" style="border-color: var(--kv-border-subtle);">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
      <span class="text-[16px] font-semibold" style="color: var(--kv-text-primary);">{{ channelName }}</span>
      <span v-if="connectedHere" class="text-[13px]" style="color: var(--kv-text-muted);">· {{ members.length }}</span>
    </div>

    <!-- Orta: katılımcı kart ızgarası -->
    <div class="flex-1 min-h-0 overflow-hidden p-4">
      <!-- Bağlanılıyor -->
      <div v-if="!connectedHere && voiceStore.connecting" class="h-full flex items-center justify-center">
        <p class="text-[15px]" style="color: var(--kv-text-muted);">{{ t('voice.joining') }}</p>
      </div>
      <!-- Bağlı değil → katıl -->
      <div v-else-if="!connectedHere" class="h-full flex flex-col items-center justify-center gap-3">
        <p class="text-[15px]" style="color: var(--kv-text-muted);">{{ t('voice.notConnected') }}</p>
        <button
          class="px-4 py-2 rounded-[var(--kv-radius-md)] text-[14px] font-semibold text-white cursor-pointer transition-opacity hover:opacity-90"
          style="background-color: var(--kv-accent-500);"
          @click="voiceStore.join(channelId)"
        >{{ t('voice.joinAction') }}</button>
        <p v-if="voiceStore.error" class="text-[13px]" style="color: var(--kv-danger);">{{ voiceStore.error }}</p>
      </div>
      <!-- Bağlı: kart ızgarası — video varsa video, yoksa avatar; sayıya göre ekranı böler -->
      <div v-else class="grid gap-3 w-full h-full" :style="gridStyle">
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="kv-video-tile group relative flex items-center justify-center min-h-0 min-w-0 overflow-hidden rounded-[var(--kv-radius-lg)]"
          :style="`background-color: ${tile.kind === 'video' ? '#000' : 'var(--kv-bg-elevated)'};${tile.member && isSpeaking(tile.member) ? ' box-shadow: inset 0 0 0 2px var(--kv-accent-500);' : ''}`"
        >
          <!-- Video (kamera = cover; ekran = contain, kırpma yok) -->
          <video
            v-if="tile.kind === 'video'"
            :ref="(el) => attachVideo(el as Element, tile.entry)"
            autoplay
            playsinline
            class="w-full h-full"
            :class="tile.entry.trackKind === 'screen' ? 'object-contain' : 'object-cover'"
            :aria-label="tile.entry.trackKind === 'screen' ? t('voice.screenShareActive') : t('voice.cameraActive')"
          />
          <!-- Avatar (video yok) -->
          <div
            v-else
            class="w-24 h-24 rounded-full flex items-center justify-center text-[32px] font-bold text-white overflow-hidden"
            :class="{ 'kv-speaking': isSpeaking(tile.member) }"
            style="background-color: var(--kv-accent-500);"
          >
            <img v-if="tile.member.avatarUrl" :src="tile.member.avatarUrl" :alt="tile.member.username" class="w-full h-full object-cover" />
            <span v-else>{{ tile.member.username[0]?.toUpperCase() }}</span>
          </div>

          <!-- Tam-ekran (yalnız video tile, hover'da) -->
          <button
            v-if="tile.kind === 'video'"
            class="absolute top-2 left-2 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            style="width: 28px; height: 28px; background-color: rgba(0,0,0,0.5); color: #fff;"
            :title="t('voice.enterFullscreen')"
            @click.stop="toggleTileFullscreen"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
              <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>
          </button>

          <!-- R11: moderasyon menüsü (kendi+owner hariç, izinli kullanıcı) -->
          <div
            v-if="tile.member && canModerate(tile.member)"
            class="absolute top-2 right-2 transition-opacity"
            :class="openMenuUserId === tile.member.userId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
          >
            <button
              class="flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              style="width: 26px; height: 26px; color: #fff; background-color: rgba(0,0,0,0.5);"
              :aria-label="t('voice.moderationMenu')"
              @click.stop="toggleMenu(tile.member.userId)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="1" fill="currentColor"/>
                <circle cx="12" cy="12" r="1" fill="currentColor"/>
                <circle cx="12" cy="19" r="1" fill="currentColor"/>
              </svg>
            </button>

            <!-- Dropdown -->
            <div
              v-if="openMenuUserId === tile.member.userId"
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
                @click="toggleServerMute(tile.member)"
              >
                {{ isServerMutedFor(tile.member) ? t('voice.serverUnmute') : t('voice.serverMute') }}
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
                    @click="moveTo(tile.member, target)"
                  >
                    {{ target.name }}
                  </button>
                </div>
              </template>
              <!-- Yayını Durdur (MUTE_MEMBERS, yalnız yayın yapıyorsa) -->
              <button
                v-if="canMute && isBroadcastingFor(tile.member)"
                class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                style="color: var(--kv-text-secondary);"
                @click="stopBroadcast(tile.member)"
              >
                {{ t('voice.stopBroadcast') }}
              </button>
              <!-- Odadan Çıkar (MOVE_MEMBERS) -->
              <button
                v-if="canMove"
                class="w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
                style="color: var(--kv-danger);"
                @click="askDisconnect(tile.member)"
              >
                {{ t('voice.disconnectUser') }}
              </button>
            </div>
          </div>

          <!-- Alt etiket: ad + mute/yayın göstergesi -->
          <div
            class="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full pointer-events-none"
            style="background-color: rgba(0,0,0,0.5); max-width: calc(100% - 16px);"
          >
            <!-- Moderatör (server) susturması -->
            <svg v-if="tile.member && isServerMutedFor(tile.member)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
              <path d="M12 2L4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5l-8-3z"/>
              <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
            </svg>
            <!-- Self / track mute -->
            <svg v-else-if="tile.member && isMutedFor(tile.member)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
            </svg>
            <!-- Ekran paylaşımı ikonu (mute yokken, ekran tile'ı) -->
            <svg v-else-if="tile.kind === 'video' && tile.entry.trackKind === 'screen'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #fff;" class="shrink-0">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span class="text-[12px] truncate" style="color: #fff;">
              {{ tileName(tile) }}<template v-if="tileIsLocal(tile)"> ({{ t('voice.you') }})</template>
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
