<script setup lang="ts">
/**
 * DmCallPanel — DM sohbetinin üstünde aktif sesli/görüntülü arama kartı (kabul edilince çıkar).
 * Yalnız bu DM kanalına bağlıyken görünür.
 *
 * Video varsa: Discord-tarzı birleşik kart ızgarası — her katılımcı TEK kart (kamera/ekran
 * yayınlıyorsa video, yoksa avatar). Izgara yüksekliği sınırlı → kontrol barı HER ZAMAN görünür.
 * Video yoksa: kompakt avatar satırı (ses-only çağrı).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore, type RoomMember, type VideoTrackEntry } from '@/stores/voice'
import VoiceControlBar from '@/components/shared/VoiceControlBar.vue'

const props = defineProps<{ channelId: string }>()
const { t } = useI18n()
const voiceStore = useVoiceStore()

const members = computed<RoomMember[]>(() => voiceStore.roomParticipants)

function isSpeaking(m: RoomMember): boolean {
  return voiceStore.speakingUserIds.has(m.userId) && !isMutedFor(m)
}
function isMutedFor(m: RoomMember): boolean {
  return m.isLocal ? voiceStore.isMuted : voiceStore.mutedUserIds.has(m.userId)
}

// ── Kart ızgarası (video varken) ─────────────────────────────────────────────
// Her katılımcı bir kart. Video track'i (kamera/ekran) olan tile video; olmayan avatar.
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
  const avatarTiles: VoiceTile[] = members.value
    .filter((m) => !withVideo.has(m.userId))
    .map((m) => ({ key: m.userId, kind: 'avatar', member: m }))
  return [...videoTiles, ...avatarTiles]
})

// Kolon sayısı: 1→1, 2-4→2, 5-9→3, 10+→4. grid-auto-rows 1fr → satırlar eşit böler.
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

function attachVideo(el: Element | null, entry?: VideoTrackEntry) {
  if (!el || !entry) return
  try {
    entry.track.attach(el as HTMLVideoElement)
  } catch {
    /* track zaten detach edilmiş olabilir — yoksay */
  }
}

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
</script>

<template>
  <!-- REV-8: kabul sonrası bağlanırken anında "bağlanıyor" kartı (ses ekranı geç gelmiş hissi yerine) -->
  <div
    v-if="voiceStore.connectingChannelId === channelId && !voiceStore.isConnectedTo(channelId)"
    class="shrink-0 mx-4 mt-3 rounded-[var(--kv-radius-lg)] overflow-hidden flex items-center gap-2 px-4 py-3"
    style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle);"
  >
    <span class="w-2 h-2 rounded-full shrink-0 animate-pulse" style="background-color: var(--kv-accent-500);" />
    <span class="text-[13px]" style="color: var(--kv-text-secondary);">{{ t('voice.joining') }}</span>
  </div>

  <div
    v-else-if="voiceStore.isConnectedTo(channelId)"
    class="shrink-0 mx-4 mt-3 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="background-color: var(--kv-bg-content); border: 1px solid var(--kv-border-subtle);"
  >
    <!-- Üst etiket -->
    <div class="flex items-center gap-2 px-4 pt-3">
      <span class="w-2 h-2 rounded-full shrink-0" style="background-color: var(--kv-online, #3DB46E);" />
      <span class="text-[12px] font-semibold uppercase tracking-widest" style="color: var(--kv-online, #3DB46E);">
        {{ t('voice.connected') }}
      </span>
      <span class="text-[12px]" style="color: var(--kv-text-muted);">· {{ members.length }}</span>
    </div>

    <!-- Video varsa: birleşik kart ızgarası (yükseklik sınırlı → kontrol barı görünür kalır) -->
    <div
      v-if="voiceStore.videoTracks.length"
      class="grid gap-2 px-4 pt-3"
      :style="{ ...gridStyle, height: '48vh', maxHeight: '460px' }"
    >
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
          class="w-full h-full object-cover"
          :aria-label="tile.entry.trackKind === 'screen' ? t('voice.screenShareActive') : t('voice.cameraActive')"
        />
        <!-- Avatar (video yok) -->
        <div
          v-else
          class="w-16 h-16 rounded-full flex items-center justify-center text-[24px] font-bold text-white overflow-hidden"
          :class="{ 'kv-speaking': isSpeaking(tile.member) }"
          style="background-color: var(--kv-accent-500);"
        >
          <img v-if="tile.member.avatarUrl" :src="tile.member.avatarUrl" :alt="tile.member.username" class="w-full h-full object-cover" />
          <span v-else>{{ tile.member.username[0]?.toUpperCase() }}</span>
        </div>

        <!-- Tam-ekran (yalnız video tile): sağ-alt, belirgin boyut, yarı-opak (hover'da tam) -->
        <button
          v-if="tile.kind === 'video'"
          class="absolute bottom-2 right-2 flex items-center justify-center rounded-full cursor-pointer transition-opacity hover:opacity-90"
          style="width: 40px; height: 40px; background-color: rgba(0,0,0,0.65); color: #fff;"
          :title="t('voice.enterFullscreen')"
          @click.stop="toggleTileFullscreen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
          </svg>
        </button>

        <!-- Alt etiket: ad + mute/yayın göstergesi -->
        <div
          class="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full pointer-events-none"
          style="background-color: rgba(0,0,0,0.5); max-width: calc(100% - 16px);"
        >
          <svg v-if="tile.member && isMutedFor(tile.member)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          <svg v-else-if="tile.kind === 'video' && tile.entry.trackKind === 'screen'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #fff;" class="shrink-0">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span class="text-[12px] truncate" style="color: #fff;">
            {{ tileName(tile) }}<template v-if="tileIsLocal(tile)"> ({{ t('voice.you') }})</template>
          </span>
        </div>
      </div>
    </div>

    <!-- Video yok: kompakt avatar satırı (ses-only çağrı) -->
    <div v-else class="flex flex-wrap items-start justify-center gap-6 px-4 py-5">
      <div v-for="m in members" :key="m.userId" class="flex flex-col items-center gap-2 w-[88px]">
        <div
          class="w-14 h-14 rounded-full flex items-center justify-center text-[20px] font-bold text-white overflow-hidden"
          :class="{ 'kv-speaking': isSpeaking(m) }"
          style="background-color: var(--kv-accent-500);"
        >
          <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.username" class="w-full h-full object-cover" />
          <span v-else>{{ m.username[0]?.toUpperCase() }}</span>
        </div>
        <div class="flex items-center gap-1 max-w-full">
          <svg v-if="isMutedFor(m)" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-danger);" class="shrink-0">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
          </svg>
          <span class="text-[12px] truncate" style="color: var(--kv-text-primary);">
            {{ m.username }}<template v-if="m.isLocal"> ({{ t('voice.you') }})</template>
          </span>
        </div>
      </div>
    </div>

    <!-- Kontrol barı (kartlarla araya boşluk: butonlar ekranlara yapışmasın) -->
    <div class="pt-4 pb-4">
      <VoiceControlBar />
    </div>
  </div>
</template>

<style scoped>
/* Kart ızgarasında video kartı doldurur (object-cover); tam-ekranda her şeyi göster (contain). */
.kv-video-tile:fullscreen video {
  object-fit: contain;
  background-color: #000;
}
</style>
