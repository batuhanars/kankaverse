<script setup lang="ts">
/**
 * DmCallPanel — DM (1-1/grup) sesli aramasında sohbetin ÜSTÜNDE duran ses paneli.
 * Düzen korunur: üstte ses alanı, altta sohbet (panel shrink-0; mesaj listesi altta akar).
 *
 * Ortam ses kanalı (VoiceRoomView) ile AYNI kutucuk sistemini kullanır (VoiceTile):
 *  - IZGARA: ekran paylaşımı/odak yok → eşit ızgara (her katılımcı eşit kutu).
 *  - SAHNE : biri ekran paylaşıyor VEYA bir kutuya tıklandı → büyük "sahne" + altta "şerit".
 * Tam ekran: panel-seviyesi (kutucuk-başına değil), alt aksiyon barının EN SAĞINDA (ses kanalı gibi).
 * Moderasyon YOK (DM).
 */
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore, type RoomMember, type VoiceTileData } from '@/stores/voice'
import VoiceControlBar from '@/components/shared/VoiceControlBar.vue'
import VoiceTile from '@/components/shared/VoiceTile.vue'

const props = defineProps<{ channelId: string }>()
const { t } = useI18n()
const voiceStore = useVoiceStore()

const connected = computed(() => voiceStore.isConnectedTo(props.channelId))
const members = computed<RoomMember[]>(() => (connected.value ? voiceStore.roomParticipants : []))

function isSpeaking(m: RoomMember): boolean {
  return voiceStore.speakingUserIds.has(m.userId) && !isMutedFor(m)
}
function isMutedFor(m: RoomMember): boolean {
  return m.isLocal ? voiceStore.isMuted : voiceStore.mutedUserIds.has(m.userId)
}

// ── Kutucuklar (VoiceRoomView ile aynı mantık, moderasyonsuz) ────────────────────
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
  const avatarTiles: VoiceTileData[] = members.value
    .filter((m) => !withVideo.has(m.userId))
    .map((m) => ({ key: m.userId, kind: 'avatar', member: m }))
  return [...videoTiles, ...avatarTiles]
})

// Video var mı? Yoksa kompakt avatar şeridi; varsa sahne (büyük odak + şerit).
const hasVideo = computed(() => tiles.value.some((tl) => tl.kind === 'video'))

// ── Odak (sahne) ─────────────────────────────────────────────────────────────────
const focusedKey = ref<string | null>(null)
const screenFocusKey = computed<string | null>(() => {
  const s = tiles.value.find((tl) => tl.kind === 'video' && tl.entry.trackKind === 'screen')
  return s?.key ?? null
})
// Kendi video kutucuğum (kamera/ekran) — açtığımda varsayılan odak BEN olurum.
const localVideoKey = computed<string | null>(() => {
  const mine = tiles.value.find((tl) => tl.kind === 'video' && tl.entry.isLocal)
  return mine?.key ?? null
})
const firstVideoKey = computed<string | null>(() => {
  const v = tiles.value.find((tl) => tl.kind === 'video')
  return v?.key ?? null
})
// Öncelik: kullanıcı tıkladıysa o; yoksa kendi videom; yoksa ekran paylaşımı; yoksa ilk video.
const effectiveFocusKey = computed<string | null>(() => {
  if (focusedKey.value && tiles.value.some((tl) => tl.key === focusedKey.value)) return focusedKey.value
  return localVideoKey.value ?? screenFocusKey.value ?? firstVideoKey.value
})
const isStageMode = computed(() => effectiveFocusKey.value !== null)
const focusedTile = computed<VoiceTileData | null>(
  () => tiles.value.find((tl) => tl.key === effectiveFocusKey.value) ?? null,
)
function setFocus(key: string) { focusedKey.value = key }

// Sığdır/doldur: ekran paylaşımı varsayılan 'contain', kamera 'cover'.
const tileFit = ref<Record<string, 'cover' | 'contain'>>({})
function defaultFit(tile: VoiceTileData): 'cover' | 'contain' {
  return tile.kind === 'video' && tile.entry.trackKind === 'screen' ? 'contain' : 'cover'
}
function fitOf(tile: VoiceTileData): 'cover' | 'contain' {
  return tileFit.value[tile.key] ?? defaultFit(tile)
}
function toggleFit(tile: VoiceTileData) {
  tileFit.value = { ...tileFit.value, [tile.key]: fitOf(tile) === 'cover' ? 'contain' : 'cover' }
}

// VoiceTile prop demeti (DM: moderasyon kapalı).
function tileProps(tile: VoiceTileData, variant: 'grid' | 'stage' | 'strip') {
  const m = tile.member
  return {
    tile,
    variant,
    speaking: m ? isSpeaking(m) : false,
    muted: m ? isMutedFor(m) : false,
    serverMuted: false,
    fit: fitOf(tile),
    canModerate: false,
    canMute: false,
    canMove: false,
    moveTargets: [],
    broadcasting: false,
    focused: variant === 'stage' ? true : variant === 'strip' && tile.key === effectiveFocusKey.value,
  }
}

// ── Panel tam ekranı (kutucuk-başına değil) ──────────────────────────────────────
const rootRef = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
function onFsChange() {
  isFullscreen.value = !!document.fullscreenElement
}
onMounted(() => document.addEventListener('fullscreenchange', onFsChange))
onUnmounted(() => document.removeEventListener('fullscreenchange', onFsChange))
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (rootRef.value) await rootRef.value.requestFullscreen()
  } catch {
    /* yoksay */
  }
}
</script>

<template>
  <!-- REV-8: kabul sonrası bağlanırken anında "bağlanıyor" kartı -->
  <div
    v-if="voiceStore.connectingChannelId === channelId && !connected"
    class="shrink-0 mx-4 mt-3 rounded-[var(--kv-radius-lg)] overflow-hidden flex items-center gap-2 px-4 py-3"
    style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle);"
  >
    <span class="w-2 h-2 rounded-full shrink-0 animate-pulse" style="background-color: var(--kv-accent-500);" />
    <span class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('voice.joining') }}</span>
  </div>

  <!-- Bağlı: ses paneli (üstte; sohbet altta akar) -->
  <div
    v-else-if="connected"
    ref="rootRef"
    class="kv-dm-voice shrink-0 mx-4 mt-3 rounded-[var(--kv-radius-lg)] overflow-hidden flex flex-col"
    style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle);"
  >
    <!-- Üst etiket -->
    <div class="flex items-center gap-2 px-4 pt-3 shrink-0">
      <span class="w-2 h-2 rounded-full shrink-0" style="background-color: var(--kv-online, #3DB46E);" />
      <span class="text-[12px] font-semibold uppercase tracking-widest" style="color: var(--kv-online, #3DB46E);">
        {{ t('voice.connected') }}
      </span>
      <span class="text-[12px]" style="color: var(--kv-text-muted);">· {{ members.length }}</span>
    </div>

    <!-- Orta: video varsa sahne (ortada, dar) + altta şerit · yoksa kompakt avatar şeridi -->
    <div class="px-4 pt-3 overflow-hidden" :class="hasVideo ? 'kv-dm-voice-stage' : 'kv-dm-voice-avatars'">
      <!-- VIDEO: büyük odak ortada (yatayda paneli kaplamaz) + altta küçük şerit -->
      <div v-if="isStageMode" class="w-full h-full flex flex-col gap-3">
        <div class="flex-1 min-h-0 flex items-center justify-center">
          <div class="kv-dm-stage-frame h-full">
            <VoiceTile
              v-if="focusedTile"
              v-bind="tileProps(focusedTile, 'stage')"
              @toggle-fit="toggleFit(focusedTile)"
              @focus="setFocus(focusedTile.key)"
            />
          </div>
        </div>
        <!-- Şerit: tüm kutucuklar — tıklanan öne (sahneye) çıkar. Taşınca güvenli-ortalama
             (az kutucukta ortalı, çok kutucukta baştan kaydırılabilir). -->
        <div class="shrink-0 flex items-center gap-2 overflow-x-auto py-0.5" style="justify-content: safe center;">
          <div v-for="tile in tiles" :key="tile.key" class="shrink-0" style="width: 128px; height: 72px;">
            <VoiceTile
              v-bind="tileProps(tile, 'strip')"
              @toggle-fit="toggleFit(tile)"
              @focus="setFocus(tile.key)"
            />
          </div>
        </div>
      </div>

      <!-- AVATAR: video yok → kart yapısı yerine yan yana avatarlar (kompakt) -->
      <div v-else class="flex items-center justify-center gap-6 flex-wrap py-4">
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="flex flex-col items-center gap-2"
          style="width: 92px;"
        >
          <div class="relative shrink-0">
            <div
              class="w-16 h-16 rounded-full flex items-center justify-center font-bold text-white overflow-hidden"
              :class="tile.member && isSpeaking(tile.member) ? 'kv-speaking' : ''"
              style="background-color: var(--kv-accent-500);"
            >
              <img
                v-if="tile.member?.avatarUrl"
                :src="tile.member.avatarUrl"
                :alt="tile.member.username"
                class="w-full h-full object-cover"
              />
              <span v-else class="text-[24px]">{{ tile.member?.username[0]?.toUpperCase() }}</span>
            </div>
            <!-- Mute rozeti (sağ-alt) -->
            <div
              v-if="tile.member && isMutedFor(tile.member)"
              class="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center"
              style="background-color: var(--kv-bg-content);"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
              </svg>
            </div>
          </div>
          <span class="text-[12px] truncate max-w-full text-center" style="color: var(--kv-text-secondary);">
            {{ tile.member?.username }}<template v-if="tile.member?.isLocal"> ({{ t('voice.you') }})</template>
          </span>
        </div>
      </div>
    </div>

    <!-- Alt aksiyon barı: kontroller ortada · tam ekran en sağda (ses kanalındaki gibi) -->
    <div class="shrink-0 grid grid-cols-3 items-end px-4 py-4">
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
          @click="toggleFullscreen"
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
</template>

<style scoped>
/* Video sahne yüksekliği — eskisinden alçak; alttaki sohbete nefes alanı bırakır. */
.kv-dm-voice-stage {
  height: clamp(220px, 38vh, 440px);
}
/* Sahne çerçevesi: 16:9 orana oturur, yatayda paneli kaplamaz (yükseklikten genişlik türetilir,
   en fazla %100). Parent justify-center ile ortalanır → video panelin ortasında durur. */
.kv-dm-stage-frame {
  aspect-ratio: 16 / 9;
  max-width: 100%;
  border-radius: var(--kv-radius-lg);
  overflow: hidden;
}
/* Avatar şeridi (video yok): kompakt — kart yok, yalnız yan yana avatarlar. */
.kv-dm-voice-avatars {
  min-height: 120px;
}
/* Panel tam ekranı: tüm ekranı kapla, orta alan esnesin (kutucuklar büyük). */
.kv-dm-voice:fullscreen {
  height: 100vh;
  background-color: var(--kv-bg-content);
}
.kv-dm-voice:fullscreen .kv-dm-voice-stage {
  height: auto;
  flex: 1 1 0%;
  min-height: 0;
}
</style>
