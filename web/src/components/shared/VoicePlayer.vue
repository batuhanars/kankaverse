<!-- M6b §2/§5.1: sesli mesaj oynatıcısı. Gizli <audio> + kendi düğme/çubuk/süre (tarayıcı
     `controls` görünümü temaya uymuyor). Aynı anda tek ses: useExclusivePlayback. -->
<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { attachmentsApi } from '@/api/attachments'
import { useExclusivePlayback } from '@/composables/useExclusivePlayback'
import { formatClock } from '@/utils/formatClock'
import { decodeWaveform, fallbackWaveform } from '@/utils/waveform'
import type { AttachmentDto } from '@/types'

const props = defineProps<{ attachment: AttachmentDto }>()

const { t } = useI18n()
const { claim, release } = useExclusivePlayback()

// Presigned adres 300 sn ömürlü (AttachmentView ile aynı); duraklatılıp bırakılmış mesajda
// ölü adrese basmamak için 240 sn'den eskiyse çalmadan önce tazelenir.
const URL_MAX_AGE_MS = 240_000

const audioEl = ref<HTMLAudioElement | null>(null)
const trackEl = ref<HTMLElement | null>(null)
const playing = ref(false)
const loading = ref(false)
const failed = ref(false)
const currentMs = ref(0)
const mediaDurationMs = ref(0)
const src = ref<string | undefined>(undefined)
let srcFetchedAt = 0

// MediaRecorder webm'i süre bilgisi taşımaz (duration = Infinity) → API'den gelen durationMs asıl kaynak.
const totalMs = computed(() => props.attachment.durationMs ?? mediaDurationMs.value)
const progress = computed(() =>
  totalMs.value > 0 ? Math.min(1, currentMs.value / totalMs.value) : 0,
)
// §7.2: waveform null/bozuksa id'den türetilen sabit desen (rastgele değil).
const bars = computed(
  () => decodeWaveform(props.attachment.waveform) ?? fallbackWaveform(props.attachment.id),
)
const playedBars = computed(() => Math.round(progress.value * bars.value.length))
function barHeight(v: number): number {
  return 3 + (v / 255) * 25 // en az 3px, en çok 28px
}
const timeLabel = computed(() =>
  formatClock(playing.value || currentMs.value > 0 ? currentMs.value : totalMs.value),
)

function pause() {
  audioEl.value?.pause()
}

async function ensureFreshSrc(): Promise<boolean> {
  if (src.value && Date.now() - srcFetchedAt < URL_MAX_AGE_MS) return true
  loading.value = true
  try {
    const res = await attachmentsApi.getUrl(props.attachment.id)
    const keep = currentMs.value
    src.value = res.data.url
    srcFetchedAt = Date.now()
    // src değişince <audio> kendiliğinden yüklenir (preload=metadata); konumu metadata gelince geri koy.
    await nextTick()
    await new Promise<void>((resolve) => {
      const el = audioEl.value
      if (!el) return resolve()
      const done = () => {
        clearTimeout(guard)
        el.removeEventListener('loadedmetadata', done)
        el.removeEventListener('error', done)
        if (keep > 0) el.currentTime = keep / 1000
        resolve()
      }
      const guard = setTimeout(done, 8000)
      el.addEventListener('loadedmetadata', done)
      el.addEventListener('error', done)
    })
    failed.value = false
    return true
  } catch {
    failed.value = true
    return false
  } finally {
    loading.value = false
  }
}

async function toggle() {
  const el = audioEl.value
  if (!el || loading.value) return
  if (playing.value) {
    el.pause()
    return
  }
  if (!(await ensureFreshSrc())) return
  claim(pause)
  try {
    await el.play()
  } catch {
    failed.value = true
  }
}

function onPlay() {
  playing.value = true
}
function onPause() {
  playing.value = false
  release(pause)
}
function onEnded() {
  // Bitince başa sar, düğme ▶'ya dönsün.
  playing.value = false
  currentMs.value = 0
  if (audioEl.value) audioEl.value.currentTime = 0
  release(pause)
}
function onTimeUpdate() {
  if (audioEl.value) currentMs.value = audioEl.value.currentTime * 1000
}
function onMeta() {
  const d = audioEl.value?.duration
  if (d && Number.isFinite(d)) mediaDurationMs.value = d * 1000
}

// Çubuk: dokun/sürükle ile konum
let dragging = false

function seekFromEvent(e: PointerEvent) {
  const track = trackEl.value
  if (!track || totalMs.value <= 0) return
  const rect = track.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  currentMs.value = ratio * totalMs.value
  if (audioEl.value && src.value) audioEl.value.currentTime = currentMs.value / 1000
}

function onPointerDown(e: PointerEvent) {
  if (loading.value) return
  dragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  seekFromEvent(e)
}
function onPointerMove(e: PointerEvent) {
  if (dragging) seekFromEvent(e)
}
async function onPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  // Henüz hiç çalınmamışsa adres yoktur: seek'i adresi alıp uygula (currentMs korunur).
  if (!src.value) await ensureFreshSrc()
  seekFromEvent(e)
}

function onKeydown(e: KeyboardEvent) {
  if (totalMs.value <= 0) return
  const step = e.key === 'ArrowRight' ? 5000 : e.key === 'ArrowLeft' ? -5000 : 0
  if (!step) return
  e.preventDefault()
  currentMs.value = Math.min(totalMs.value, Math.max(0, currentMs.value + step))
  if (audioEl.value && src.value) audioEl.value.currentTime = currentMs.value / 1000
}

onBeforeUnmount(() => {
  audioEl.value?.pause()
  release(pause)
})
</script>

<template>
  <div
    class="mt-1.5 inline-flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-md)] w-full"
    style="background-color: var(--kv-bg-elevated); max-width: 340px;"
    role="group"
    :aria-label="t('voiceMessage.label')"
  >
    <audio
      ref="audioEl"
      :src="src"
      preload="metadata"
      class="hidden"
      @play="onPlay"
      @pause="onPause"
      @ended="onEnded"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onMeta"
    />

    <button
      type="button"
      class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-opacity hover:opacity-90"
      :class="loading ? 'opacity-60' : ''"
      style="background-color: var(--kv-accent-500); color: #fff;"
      :aria-label="playing ? t('voiceMessage.pause') : t('voiceMessage.play')"
      :title="playing ? t('voiceMessage.pause') : t('voiceMessage.play')"
      @click="toggle"
    >
      <svg v-if="playing" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
      </svg>
    </button>

    <!-- Dalga: dokun/sürükle/ok tuşları = konum. Çalınan çubuklar griden Kor'a boyanır. -->
    <div class="flex-1 min-w-0 flex flex-col gap-0.5">
      <div
        ref="trackEl"
        class="flex items-center justify-between h-8 cursor-pointer touch-none"
        role="slider"
        tabindex="0"
        :aria-label="t('voiceMessage.seek')"
        aria-valuemin="0"
        :aria-valuemax="Math.round(totalMs / 1000)"
        :aria-valuenow="Math.round(currentMs / 1000)"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="dragging = false"
        @keydown="onKeydown"
      >
        <span
          v-for="(v, i) in bars"
          :key="i"
          class="block rounded-full shrink-0"
          :style="{
            width: '2.5px',
            height: `${barHeight(v)}px`,
            backgroundColor: i < playedBars ? 'var(--kv-accent-500)' : 'var(--kv-text-muted)',
          }"
        />
      </div>
      <span
        class="text-[12px] tabular-nums"
        :style="{ color: failed ? 'var(--kv-danger)' : 'var(--kv-text-muted)' }"
      >
        {{ failed ? t('attachment.notReady') : timeLabel }}
      </span>
    </div>
  </div>
</template>
