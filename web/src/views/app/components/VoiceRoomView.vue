<script setup lang="ts">
/**
 * VoiceRoomView — ses kanalına girildiğinde merkez alanda gösterilir (sohbet yerine).
 * Üstte kanal başlığı (+ tüm-oda tam ekran), ortada katılımcı kutucukları, altta kontrol barı.
 *
 * İki düzen (Discord-tarzı):
 *  - IZGARA: kimse ekran paylaşmıyor ve manuel odak yok → eşit ızgara (her katılımcı eşit kutu).
 *  - SAHNE : biri ekran paylaşıyor VEYA bir kutucuğa tıklandı → odaktaki kişi büyük "sahne",
 *            diğerleri altta yatay "şerit". Varsayılan odak = ekran paylaşan; tıklama odağı değiştirir
 *            (yalnız yerel — başkasını etkilemez). Konuşana göre otomatik geçiş YOK.
 *
 * Tam ekran: oda-seviyesi (başlık + sahne + kontrol barı tam ekran) — kutucuk-başına değil.
 *
 * R11 — ses moderasyonu: izinli kullanıcı, kendi+owner DIŞINDAKİ katılımcıya hover ⋯ menüsünden
 * "Sustur/Susturmayı Kaldır" (MUTE_MEMBERS) ve "Taşı" (MOVE_MEMBERS) uygular. (Menü VoiceTile içinde;
 * aksiyonlar buraya emit edilir — API çağrısı parent'ta.)
 */
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore, type RoomMember, type VoiceTileData } from '@/stores/voice'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useToastStore } from '@/stores/toast'
import { useGuildPermissions } from '@/composables/useGuildPermissions'
import { voiceApi } from '@/api/voice'
import type { ChannelDto } from '@/types'
import VoiceControlBar from '@/components/shared/VoiceControlBar.vue'
import VoiceTile from '@/components/shared/VoiceTile.vue'
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

// ── Kutucuklar ────────────────────────────────────────────────────────────────
// Her katılımcı bir kutucuk. Video track'i (kamera/ekran) olan tile video; olmayan avatar.
// Bir katılımcı hem kamera hem ekran paylaşırsa iki ayrı video tile olur (Discord gibi).
function memberById(id: string): RoomMember | null {
  return members.value.find((m) => m.userId === id) ?? null
}

const tiles = computed<VoiceTileData[]>(() => {
  const videoTiles: VoiceTileData[] = voiceStore.videoTracks.map((e) => ({
    key: `${e.participantId}:${e.trackKind}`,
    kind: 'video',
    member: memberById(e.participantId),
    entry: e,
  }))
  const withVideo = new Set(voiceStore.videoTracks.map((e) => e.participantId))
  const avatarTiles: VoiceTileData[] = sortedMembers.value
    .filter((m) => !withVideo.has(m.userId))
    .map((m) => ({ key: m.userId, kind: 'avatar', member: m }))
  return [...videoTiles, ...avatarTiles]
})

// Kolon sayısı katılımcı sayısına göre: 1→1, 2-4→2, 5-9→3, 10+→4 (yalnız IZGARA düzeninde).
const gridStyle = computed(() => {
  const n = Math.max(tiles.value.length, 1)
  const cols = n === 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridAutoRows: 'minmax(0, 1fr)',
  }
})

// ── Odak (sahne) düzeni ─────────────────────────────────────────────────────────
// Manuel odak yerel; ekran paylaşımı varsa varsayılan odak odur. Stale anahtar → fallback.
const focusedKey = ref<string | null>(null)
const screenFocusKey = computed<string | null>(() => {
  const screen = tiles.value.find((t) => t.kind === 'video' && t.entry.trackKind === 'screen')
  return screen?.key ?? null
})
const effectiveFocusKey = computed<string | null>(() => {
  if (focusedKey.value && tiles.value.some((t) => t.key === focusedKey.value)) return focusedKey.value
  return screenFocusKey.value
})
const isStageMode = computed(() => effectiveFocusKey.value !== null)
const focusedTile = computed<VoiceTileData | null>(
  () => tiles.value.find((t) => t.key === effectiveFocusKey.value) ?? null,
)
// "Izgara görünümü"ne dönüş yalnız manuel odak sebebiyle sahnedeyken (ekran paylaşımı yokken) anlamlı.
const showGridButton = computed(() => focusedKey.value !== null && screenFocusKey.value === null)

function setFocus(key: string) {
  focusedKey.value = key
}
function clearFocus() {
  focusedKey.value = null
}

// Sığdır/doldur: ekran paylaşımı 'contain' (tüm ekran görünür, kırpma yok); kamera 'cover'
// (kutuyu doldur). Manuel geçiş butonu kaldırıldı — bu varsayılanlar yeterli.
function fitOf(tile: VoiceTileData): 'cover' | 'contain' {
  return tile.kind === 'video' && tile.entry.trackKind === 'screen' ? 'contain' : 'cover'
}

// VoiceTile'a geçen prop demeti (ızgara/sahne/şerit ortak).
function tileProps(tile: VoiceTileData, variant: 'grid' | 'stage' | 'strip') {
  const m = tile.member
  return {
    tile,
    variant,
    speaking: m ? isSpeaking(m) : false,
    muted: m ? isMutedFor(m) : false,
    serverMuted: m ? isServerMutedFor(m) : false,
    fit: fitOf(tile),
    canModerate: m ? canModerate(m) : false,
    canMute: canMute.value,
    canMove: canMove.value,
    moveTargets: moveTargets.value,
    broadcasting: m ? isBroadcastingFor(m) : false,
    focused: variant === 'stage' ? true : variant === 'strip' && tile.key === effectiveFocusKey.value,
  }
}

// ── Tüm-oda tam ekranı ──────────────────────────────────────────────────────────
const roomRef = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
function onFsChange() {
  isFullscreen.value = !!document.fullscreenElement
}
onMounted(() => document.addEventListener('fullscreenchange', onFsChange))
onUnmounted(() => document.removeEventListener('fullscreenchange', onFsChange))
async function toggleRoomFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (roomRef.value) await roomRef.value.requestFullscreen()
  } catch {
    /* yoksay */
  }
}

// ── Moderasyon aksiyonları (VoiceTile emit'lerine bağlanır; API burada) ───────────
async function onTileServerMute(tile: VoiceTileData) {
  const m = tile.member
  if (!m) return
  try {
    if (isServerMutedFor(m)) await voiceApi.unmute(channelId.value, m.userId)
    else await voiceApi.mute(channelId.value, m.userId)
    // Set güncellemesi WS (voice.participant_muted/unmuted) ile gelir.
  } catch (e: unknown) {
    toast.error(errMessage(e, 'voice.muteFailed'))
  }
}

async function onTileMove(tile: VoiceTileData, target: ChannelDto) {
  const m = tile.member
  if (!m) return
  try {
    await voiceApi.move(channelId.value, m.userId, target.id)
  } catch (e: unknown) {
    toast.error(errMessage(e, 'voice.moveFailed'))
  }
}

async function onTileStopBroadcast(tile: VoiceTileData) {
  const m = tile.member
  if (!m) return
  try {
    await voiceApi.stopBroadcast(channelId.value, m.userId)
  } catch (e: unknown) {
    toast.error(errMessage(e, 'voice.stopBroadcastFailed'))
  }
}

// Odadan çıkar — onaylı
const disconnectTarget = ref<RoomMember | null>(null)
function onTileDisconnect(tile: VoiceTileData) {
  if (tile.member) disconnectTarget.value = tile.member
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
  <div ref="roomRef" class="flex flex-col flex-1 min-h-0 overflow-hidden mr-4 rounded-[var(--kv-radius-lg)]" style="background-color: var(--kv-bg-content);">
    <!-- Üst başlık: ses kanalı adı -->
    <div class="shrink-0 flex items-center gap-2 px-4 h-14 border-b" style="border-color: var(--kv-border-subtle);">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
      <span class="text-[16px] font-semibold truncate" style="color: var(--kv-text-primary);">{{ channelName }}</span>
      <span v-if="connectedHere" class="text-[13px] shrink-0" style="color: var(--kv-text-muted);">· {{ members.length }}</span>
    </div>

    <!-- Orta -->
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

      <!-- Bağlı: SAHNE düzeni (odak varsa) -->
      <div v-else-if="isStageMode" class="w-full h-full flex flex-col gap-3">
        <!-- Sahne (büyük odak kutucuğu) -->
        <div class="flex-1 min-h-0">
          <VoiceTile
            v-if="focusedTile"
            v-bind="tileProps(focusedTile, 'stage')"
            @focus="setFocus(focusedTile.key)"
            @server-mute="onTileServerMute(focusedTile)"
            @move="(target: ChannelDto) => onTileMove(focusedTile!, target)"
            @stop-broadcast="onTileStopBroadcast(focusedTile)"
            @disconnect="onTileDisconnect(focusedTile)"
          />
        </div>
        <!-- Şerit (diğerleri küçük + ızgaraya dön) -->
        <div class="shrink-0 flex items-center gap-2">
          <button
            v-if="showGridButton"
            class="shrink-0 flex items-center gap-1.5 px-3 h-[72px] rounded-[var(--kv-radius-md)] text-[12px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
            style="color: var(--kv-text-secondary); background-color: var(--kv-bg-elevated);"
            @click="clearFocus"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            {{ t('voice.gridView') }}
          </button>
          <div class="flex-1 min-w-0 flex gap-2 overflow-x-auto py-0.5">
            <div v-for="tile in tiles" :key="tile.key" class="shrink-0" style="width: 128px; height: 72px;">
              <VoiceTile
                v-bind="tileProps(tile, 'strip')"
                @focus="setFocus(tile.key)"
                @server-mute="onTileServerMute(tile)"
                @move="(target: ChannelDto) => onTileMove(tile, target)"
                @stop-broadcast="onTileStopBroadcast(tile)"
                @disconnect="onTileDisconnect(tile)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Bağlı: IZGARA düzeni (odak yok) -->
      <div v-else class="grid gap-3 w-full h-full" :style="gridStyle">
        <VoiceTile
          v-for="tile in tiles"
          :key="tile.key"
          v-bind="tileProps(tile, 'grid')"
          @focus="setFocus(tile.key)"
          @server-mute="onTileServerMute(tile)"
          @move="(target: ChannelDto) => onTileMove(tile, target)"
          @stop-broadcast="onTileStopBroadcast(tile)"
          @disconnect="onTileDisconnect(tile)"
        />
      </div>
    </div>

    <!-- Alt kontrol barı: kontroller ortada, tam ekran en sağda aynı hizada (Discord-tarzı) -->
    <div v-if="connectedHere" class="shrink-0 grid grid-cols-3 items-end px-4 py-4 border-t" style="border-color: var(--kv-border-subtle);">
      <div></div>
      <div class="justify-self-center">
        <VoiceControlBar />
      </div>
      <div class="justify-self-end">
        <button
          class="w-11 h-11 flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
          :title="isFullscreen ? t('voice.exitFullscreen') : t('voice.enterFullscreen')"
          :aria-label="isFullscreen ? t('voice.exitFullscreen') : t('voice.enterFullscreen')"
          @click="toggleRoomFullscreen"
        >
          <svg v-if="!isFullscreen" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
          </svg>
          <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 14h3a2 2 0 0 1 2 2v3"/><path d="M20 10h-3a2 2 0 0 1-2-2V5"/>
            <path d="M14 20v-3a2 2 0 0 1 2-2h3"/><path d="M10 4v3a2 2 0 0 1-2 2H5"/>
          </svg>
        </button>
      </div>
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
