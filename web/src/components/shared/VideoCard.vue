<!-- M6c §2/§4.2-4.3: video kartı. Küçük resim + ▶ + süre; tıklayınca kartın yerinde
     <video controls autoplay>. Aynı anda tek medya: useExclusivePlayback (sesli mesajla karşılıklı). -->
<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { attachmentsApi } from '@/api/attachments'
import { useExclusivePlayback } from '@/composables/useExclusivePlayback'
import { downloadAttachment } from '@/utils/downloadAttachment'
import { formatClock } from '@/utils/formatClock'
import type { AttachmentDto } from '@/types'

const props = defineProps<{ attachment: AttachmentDto }>()

const { t } = useI18n()
const { currentId, play, stop } = useExclusivePlayback()
const myId = props.attachment.id

const videoEl = ref<HTMLVideoElement | null>(null)
const src = ref<string | null>(null)
const opened = ref(false)
const loading = ref(false)
const failed = ref(false)

const ratio = computed(() => {
  const { width, height } = props.attachment
  return width && height ? `${width} / ${height}` : '16 / 9'
})
const durationLabel = computed(() =>
  props.attachment.durationMs ? formatClock(props.attachment.durationMs) : '',
)
const thumbSrc = computed(() =>
  props.attachment.thumbnail ? `data:image/jpeg;base64,${props.attachment.thumbnail}` : null,
)

async function open() {
  if (loading.value) return
  loading.value = true
  failed.value = false
  try {
    const res = await attachmentsApi.getUrl(props.attachment.id)
    src.value = res.data.url
    opened.value = true
    play(myId) // çalan sesli mesaj ya da başka video durur
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

// C15: kartın köşesinde indirme (kart yalnız CLEAN iken render edilir; işleniyor/kaldırıldı'da görünmez)
const downloading = ref(false)
async function download() {
  if (downloading.value) return
  downloading.value = true
  try {
    await downloadAttachment(props.attachment.id)
  } catch {
    failed.value = true
  } finally {
    downloading.value = false
  }
}

// Başka medya başladıysa kendimi duraklat (efekt tabanlı, M6b §8.3 modeli)
watch(currentId, (id) => {
  if (opened.value && id !== myId) videoEl.value?.pause()
})

function onPlay() {
  play(myId)
}
function onPause() {
  stop(myId)
}

onBeforeUnmount(() => stop(myId))
</script>

<template>
  <div
    class="mt-1.5 relative rounded-[var(--kv-radius-sm)] overflow-hidden"
    style="width: 100%; max-width: 360px; background-color: var(--kv-bg-elevated);"
    :style="{ aspectRatio: ratio }"
  >
    <video
      v-if="opened && src"
      ref="videoEl"
      :src="src"
      controls
      autoplay
      playsinline
      class="w-full h-full object-contain bg-black"
      @play="onPlay"
      @pause="onPause"
    />
    <button
      v-else
      type="button"
      class="absolute inset-0 w-full h-full cursor-pointer"
      :aria-label="t('video.play')"
      :title="t('video.play')"
      @click="open"
    >
      <img
        v-if="thumbSrc"
        :src="thumbSrc"
        :alt="attachment.filename"
        class="absolute inset-0 w-full h-full object-cover"
      />
      <span
        class="absolute inset-0 m-auto w-12 h-12 rounded-full flex items-center justify-center"
        :class="loading ? 'opacity-60' : ''"
        style="background-color: rgba(0, 0, 0, 0.55); color: #fff;"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
        </svg>
      </span>
      <span
        v-if="durationLabel"
        class="absolute right-2 bottom-2 px-1.5 py-0.5 rounded text-[11px] tabular-nums"
        style="background-color: rgba(0, 0, 0, 0.6); color: #fff;"
      >
        {{ durationLabel }}
      </span>
      <span
        v-if="failed"
        class="absolute left-2 bottom-2 px-1.5 py-0.5 rounded text-[11px]"
        style="background-color: rgba(0, 0, 0, 0.6); color: var(--kv-danger);"
      >
        {{ t('attachment.notReady') }}
      </span>
    </button>
    <!-- İndir: sol üst köşe (oynatıcı kontrolleri altta, süre sağ altta; çakışmaz) -->
    <button
      type="button"
      class="absolute left-2 top-2 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-opacity hover:opacity-80"
      :class="downloading ? 'opacity-50 pointer-events-none' : ''"
      style="background-color: rgba(0, 0, 0, 0.6); color: #fff;"
      :aria-label="t('attachment.downloadVideo')"
      :title="t('attachment.downloadVideo')"
      @click.stop="download"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
      </svg>
    </button>
  </div>
</template>
