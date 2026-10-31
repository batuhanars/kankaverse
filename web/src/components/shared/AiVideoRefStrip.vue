<script setup lang="ts">
/**
 * AiVideoRefStrip (Sprint C42 §3.1-2, 4, 7): "Dosya ekle" düğmesi, yatay ek şeridi (küçük resim / ilk kare / simge,
 * etiket adı, süre, kaldır), sayaç, kip açıklaması ve kural notu. Durum `useAiVideoRefs`te; burası yalnız görünüm.
 * Dar ekranda şerit yatay kayar (overflow-x-auto), kartlar küçülmez.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KvButton from '@/components/ui/KvButton.vue'
import type { AiVideoRefKind, AiVideoReferencesOption } from '@/api/aiVideo'
import { TAG_COLOR } from '@/utils/aiVideoTags'

export interface AiVideoRefItem {
  uid: number
  kind: AiVideoRefKind
  previewUrl: string
  durationS: number | null
  status: 'uploading' | 'ready' | 'error'
  error: string
  label: string
}

defineProps<{
  items: AiVideoRefItem[]
  counts: Record<AiVideoRefKind, number>
  limits: AiVideoReferencesOption
  accept: string
  singleImage: boolean
  locked?: boolean
}>()
const emit = defineEmits<{ add: [files: File[]]; remove: [uid: number] }>()

const { t } = useI18n()
const input = ref<HTMLInputElement | null>(null)

function onPick(e: Event) {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = ''
  if (files.length) emit('add', files)
}
const sec = (v: number) => t('aiVideo.durationOption', { sec: Math.round(v) })
</script>

<template>
  <div class="w-full flex flex-col gap-2 min-w-0">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <KvButton size="sm" variant="ghost" class="border border-[var(--kv-border-subtle)]" :disabled="locked" @click="input?.click()">
        {{ t('aiVideo.refs.add') }}
      </KvButton>
      <span class="text-[12px] min-w-0" style="color: var(--kv-text-muted);">
        {{ t('aiVideo.refs.counter', {
          image: counts.image, imageMax: limits.max.image,
          video: counts.video, videoMax: limits.max.video,
          audio: counts.audio, audioMax: limits.max.audio,
        }) }}
      </span>
      <input ref="input" type="file" multiple :accept="accept" class="hidden" @change="onPick" />
    </div>

    <ul v-if="items.length" class="flex gap-2 overflow-x-auto pb-1 min-w-0 list-none p-0 m-0">
      <li
        v-for="it in items"
        :key="it.uid"
        class="relative shrink-0 w-24 rounded-[var(--kv-radius-sm)] border border-[var(--kv-border-subtle)] overflow-hidden bg-[var(--kv-bg-content)]"
      >
        <div class="h-16 w-full flex items-center justify-center bg-[var(--kv-bg-elevated)]">
          <img v-if="it.kind === 'image'" :src="it.previewUrl" alt="" class="h-full w-full object-cover" />
          <video v-else-if="it.kind === 'video'" :src="`${it.previewUrl}#t=0.1`" preload="metadata" muted playsinline class="h-full w-full object-cover" />
          <svg v-else viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="color: var(--kv-text-muted);" aria-hidden="true">
            <path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" />
          </svg>
          <span v-if="it.durationS !== null" class="absolute right-1 bottom-6 rounded px-1 text-[10px] bg-black/70 text-white">{{ sec(it.durationS) }}</span>
          <span v-if="it.status === 'uploading'" class="absolute inset-x-0 top-0 h-16 flex items-center justify-center text-[11px] bg-black/55 text-white">{{ t('aiVideo.refs.uploading') }}</span>
        </div>
        <div class="flex items-center justify-between gap-1 px-1.5 py-1">
          <span class="truncate text-[12px] font-medium" :style="{ color: TAG_COLOR[it.kind] }">{{ it.label }}</span>
          <button
            type="button"
            class="shrink-0 text-[14px] leading-none cursor-pointer px-1"
            style="color: var(--kv-text-muted);"
            :aria-label="`${t('aiVideo.refs.remove')}: ${it.label}`"
            :title="t('aiVideo.refs.remove')"
            @click="emit('remove', it.uid)"
          >
            &times;
          </button>
        </div>
        <p v-if="it.status === 'error'" class="px-1.5 pb-1 text-[11px] break-words" style="color: var(--kv-danger);">{{ it.error }}</p>
      </li>
    </ul>

    <template v-if="items.length">
      <p class="text-[12px]" style="color: var(--kv-text-secondary);">
        {{ singleImage ? t('aiVideo.refs.modeSingle') : t('aiVideo.refs.modeReference') }}
      </p>
      <p class="text-[12px]" style="color: var(--kv-text-muted);">{{ t('aiVideo.refs.rule') }}</p>
    </template>
  </div>
</template>
