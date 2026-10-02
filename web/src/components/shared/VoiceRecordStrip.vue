<!-- M6b §3: kayıt şeridi. [🗑 iptal] [● süre] [gönder]. Esc iptal, Enter gönder. -->
<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatClock } from '@/utils/formatClock'
import { LIVE_BARS, type RecorderState } from '@/composables/useVoiceRecorder'

const props = defineProps<{ state: RecorderState; elapsedMs: number; levels: number[] }>()
const emit = defineEmits<{ cancel: []; send: [] }>()

const { t } = useI18n()

function onKeydown(e: KeyboardEvent) {
  if (props.state === 'uploading') return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  } else if (e.key === 'Enter' && !(e.target as HTMLElement | null)?.closest('button')) {
    e.preventDefault()
    emit('send')
  }
}

// Kayıt sırasında odak mesaj kutusunda olmayabilir; klavye kısayolları belge düzeyinde dinlenir.
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex items-center gap-3 flex-1 min-w-0 py-1.5" role="group" :aria-label="t('voiceMessage.record')">
    <button
      type="button"
      class="shrink-0 w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer hover:opacity-80 transition-opacity"
      :class="state === 'uploading' ? 'opacity-40 pointer-events-none' : ''"
      style="color: var(--kv-danger);"
      :aria-label="t('voiceMessage.cancel')"
      :title="t('voiceMessage.cancel')"
      @click="emit('cancel')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>

    <div class="flex-1 min-w-0 flex items-center gap-2 text-[14px]" style="color: var(--kv-text-primary);">
      <template v-if="state === 'uploading'">
        <span style="color: var(--kv-text-muted);">{{ t('voiceMessage.sending') }}</span>
      </template>
      <template v-else>
        <span
          class="shrink-0 w-2.5 h-2.5 rounded-full"
          :class="state === 'recording' ? 'animate-pulse' : ''"
          style="background-color: var(--kv-danger);"
          aria-hidden="true"
        />
        <span class="tabular-nums">{{ formatClock(elapsedMs) }}</span>
        <!-- Canlı dalga: son örnekler sağa doğru akar -->
        <div v-if="state === 'recording'" class="flex-1 min-w-0 flex items-center justify-end gap-[1.5px] h-7 overflow-hidden" aria-hidden="true">
          <span
            v-for="(v, i) in levels.slice(-LIVE_BARS)"
            :key="i"
            class="block rounded-full shrink-0"
            :style="{ width: '2.5px', height: `${3 + (v / 255) * 25}px`, backgroundColor: 'var(--kv-accent-500)' }"
          />
        </div>
        <span v-if="state === 'limit'" class="text-[12px] truncate" style="color: var(--kv-text-muted);">
          {{ t('voiceMessage.limitReached') }}
        </span>
        <span v-else class="sr-only">{{ t('voiceMessage.recording') }}</span>
      </template>
    </div>

    <button
      type="button"
      class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
      :class="state === 'uploading' ? 'opacity-40 pointer-events-none' : ''"
      style="background-color: var(--kv-accent-500); color: #fff;"
      :aria-label="t('voiceMessage.send')"
      :title="t('voiceMessage.send')"
      @click="emit('send')"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
      </svg>
    </button>
  </div>
</template>
