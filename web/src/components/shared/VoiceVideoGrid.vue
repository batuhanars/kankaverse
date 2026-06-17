<script setup lang="ts">
/**
 * VoiceVideoGrid — C4 video render (§D2).
 * Paylaşan-öncelikli yarı-ekran: aktif video yayını (kamera/ekran) büyük alanda,
 * diğer katılımcılar alt avatar/küçük-video şeridinde. Tam-ekran toggle.
 * Kamera/ekran track yokken gösterilmez (v-if üst bileşende).
 */
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVoiceStore, type VideoTrackEntry } from '@/stores/voice'

const { t } = useI18n()
const voiceStore = useVoiceStore()

// Aktif video track'leri (kamera ve ekran ayrı satırlar)
const tracks = computed<VideoTrackEntry[]>(() => voiceStore.videoTracks)

// Odak: büyük alanda gösterilecek track (varsayılan: ekran varsa ekran, yoksa ilk kamera)
const focusedId = ref<string | null>(null)

// focusedId geçerliliğini izle; track düşünce sıfırla
watch(tracks, (list) => {
  if (!list.length) { focusedId.value = null; return }
  const stillValid = list.some((e) => trackKey(e) === focusedId.value)
  if (!stillValid) {
    // Ekranı tercih et, yoksa ilk kamerayı al
    const screen = list.find((e) => e.trackKind === 'screen')
    focusedId.value = screen ? trackKey(screen) : trackKey(list[0])
  } else if (!focusedId.value) {
    const screen = list.find((e) => e.trackKind === 'screen')
    focusedId.value = screen ? trackKey(screen) : trackKey(list[0])
  }
})

function trackKey(e: VideoTrackEntry): string {
  return `${e.participantId}:${e.trackKind}`
}

const focusedTrack = computed<VideoTrackEntry | null>(() =>
  tracks.value.find((e) => trackKey(e) === focusedId.value) ?? tracks.value[0] ?? null,
)

const stripTracks = computed<VideoTrackEntry[]>(() =>
  tracks.value.filter((e) => trackKey(e) !== focusedId.value),
)

// Tam-ekran
const isFullscreen = ref(false)
const containerRef = ref<HTMLElement | null>(null)

async function toggleFullscreen() {
  if (!containerRef.value) return
  if (!document.fullscreenElement) {
    await containerRef.value.requestFullscreen()
    isFullscreen.value = true
  } else {
    await document.exitFullscreen()
    isFullscreen.value = false
  }
}
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}
document.addEventListener('fullscreenchange', onFullscreenChange)
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

// Video track → HTMLVideoElement bağlaması
function attachVideo(el: Element | null, entry: VideoTrackEntry | null) {
  if (!el || !entry) return
  const video = el as HTMLVideoElement
  try {
    entry.track.attach(video)
  } catch { /* yoksay — track zaten detach edilmiş olabilir */ }
}

function detachVideo(el: Element | null, entry: VideoTrackEntry | null) {
  if (!el || !entry) return
  try {
    entry.track.detach(el as HTMLVideoElement)
  } catch { /* yoksay */ }
}
</script>

<template>
  <div
    v-if="tracks.length"
    ref="containerRef"
    class="relative flex flex-col overflow-hidden rounded-[var(--kv-radius-lg)]"
    :class="isFullscreen ? 'w-full h-full' : 'mx-auto w-full max-w-[960px]'"
    style="background-color: #000;"
  >
    <!-- Büyük alan: odak track (Discord: sınırlı 16:9, full-bleed DEĞİL; tam-ekranda doldur) -->
    <div
      class="relative flex items-center justify-center overflow-hidden"
      :class="isFullscreen ? 'flex-1 min-h-0' : 'aspect-video'"
    >
      <video
        v-if="focusedTrack"
        :key="trackKey(focusedTrack)"
        :ref="(el) => attachVideo(el as Element, focusedTrack)"
        autoplay
        playsinline
        class="w-full h-full object-contain"
        style="max-height: 100%;"
        :aria-label="focusedTrack.trackKind === 'screen' ? t('voice.screenShareActive') : t('voice.cameraActive')"
      />

      <!-- Tam-ekran düğmesi (sağ-alt: video oynatıcı konvansiyonu — kullanıcının baktığı yer) -->
      <button
        class="absolute bottom-2 right-2 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
        style="width: 32px; height: 32px; background-color: rgba(0,0,0,0.55); color: #fff;"
        :title="isFullscreen ? t('voice.exitFullscreen') : t('voice.enterFullscreen')"
        @click="toggleFullscreen"
      >
        <!-- Tam-ekrandan çık -->
        <svg v-if="isFullscreen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
          <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
        </svg>
        <!-- Tam-ekrana gir -->
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
          <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
        </svg>
      </button>

      <!-- Odak track etiketi -->
      <div
        class="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px]"
        style="background-color: rgba(0,0,0,0.55); color: #fff;"
      >
        <svg v-if="focusedTrack && focusedTrack.trackKind === 'screen'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
        <span>{{ focusedTrack?.username }}</span>
      </div>
    </div>

    <!-- Alt şerit: odak dışı katılımcılar (video tile veya avatar) -->
    <div
      v-if="stripTracks.length || voiceStore.roomParticipants.length > 1"
      class="shrink-0 flex items-center gap-2 px-3 py-2 overflow-x-auto"
      style="background-color: rgba(0,0,0,0.7);"
    >
      <!-- Video track'i olan katılımcı → küçük video tile -->
      <div
        v-for="entry in stripTracks"
        :key="trackKey(entry)"
        class="relative shrink-0 w-24 h-16 rounded-[var(--kv-radius-sm)] overflow-hidden cursor-pointer"
        style="background-color: #111;"
        :title="entry.username"
        @click="focusedId = trackKey(entry)"
      >
        <video
          :ref="(el) => attachVideo(el as Element, entry)"
          autoplay
          playsinline
          class="w-full h-full object-cover"
        />
        <span
          class="absolute bottom-0 left-0 right-0 text-center text-[10px] truncate px-1 pb-0.5"
          style="background-color: rgba(0,0,0,0.55); color: #fff;"
        >{{ entry.username }}</span>
      </div>
      <!-- Video track'i olmayan katılımcılar → avatar -->
      <template v-for="m in voiceStore.roomParticipants" :key="m.userId">
        <div
          v-if="!tracks.some((e) => e.participantId === m.userId)"
          class="shrink-0 flex flex-col items-center gap-1"
          :title="m.username"
        >
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold text-white overflow-hidden"
            :class="{ 'kv-speaking': voiceStore.speakingUserIds.has(m.userId) }"
            style="background-color: var(--kv-accent-500);"
          >
            <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.username" class="w-full h-full object-cover" />
            <span v-else>{{ m.username[0]?.toUpperCase() }}</span>
          </div>
          <span class="text-[10px] truncate max-w-[48px]" style="color: rgba(255,255,255,0.7);">{{ m.username }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
