<script setup lang="ts">
/**
 * MediaSourceDialog (Sprint C22): "Değiştir" düğmesinin açtığı seçim penceresi.
 * İki ayrı gizli dosya girişi tutar (yalnız statik / yalnız GIF+video); seçilen dosyayı `file` ile verir.
 * Girişler pencere kapansa da DOM'da kalır, yoksa seçici kapanınca `change` olayı kaybolur.
 * Kapı (`animatedAllowed`) yalnız arayüzdür; sunucu yine otoritedir.
 */
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import KvModal from '@/components/ui/KvModal.vue'
import AiVideoDialog from '@/components/shared/AiVideoDialog.vue'
import AiVideoActiveDot from '@/components/shared/AiVideoActiveDot.vue'
import { useAuthStore } from '@/stores/auth'
import { ANIMATED_ACCEPT, STATIC_ACCEPT, showAnimatedNewBadge } from '@/utils/animatedMedia'

defineProps<{ open: boolean; title: string; animatedAllowed: boolean }>()
const emit = defineEmits<{ close: []; file: [file: File] }>()

const { t } = useI18n()
// C14/C33: izinli ya da pasif tanıtım (aiVideoPreview); ikisi de yoksa (minör, bayrak kapalı) seçenek HİÇ görünmez
const aiVideoAllowed = computed(() => {
  const u = useAuthStore().user
  return u?.aiVideoAllowed === true || u?.aiVideoPreview === true
})
const aiOpen = ref(false)
const staticInput = ref<HTMLInputElement | null>(null)
const animatedInput = ref<HTMLInputElement | null>(null)

function choose(kind: 'static' | 'animated') {
  emit('close')
  ;(kind === 'static' ? staticInput : animatedInput).value?.click()
}

function chooseAi() {
  emit('close')
  aiOpen.value = true
}

function onAiUse(file: File) {
  aiOpen.value = false
  emit('file', file)
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('file', file)
}

const optionClass =
  'w-full flex items-center gap-3 rounded-[var(--kv-radius-md)] px-3 py-3 text-left transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent'
</script>

<template>
  <KvModal v-if="open" :title="title" @close="emit('close')">
    <div class="flex flex-col gap-1">
      <button type="button" :class="optionClass" @click="choose('static')">
        <svg class="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-secondary);" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        <span class="min-w-0">
          <span class="block text-[15px] font-medium" style="color: var(--kv-text-primary);">{{ t('media.source.image') }}</span>
          <span class="block text-[12px]" style="color: var(--kv-text-muted);">{{ t('media.source.imageHint') }}</span>
        </span>
      </button>

      <button type="button" :class="optionClass" :disabled="!animatedAllowed" @click="choose('animated')">
        <svg class="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-secondary);" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
        </svg>
        <span class="min-w-0">
          <span class="flex items-center gap-2 text-[15px] font-medium" style="color: var(--kv-text-primary);">
            {{ t('media.source.animated') }}
            <span
              v-if="animatedAllowed && showAnimatedNewBadge()"
              class="rounded-full px-2 py-px text-[11px] font-semibold"
              style="background-color: var(--kv-accent-500); color: #fff;"
            >{{ t('media.source.newBadge') }}</span>
          </span>
          <span class="block text-[12px]" style="color: var(--kv-text-muted);">
            {{ animatedAllowed ? t('media.source.animatedHint') : t('media.source.animatedOff') }}
          </span>
        </span>
      </button>

      <button v-if="aiVideoAllowed" type="button" :class="optionClass" @click="chooseAi">
        <svg class="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-secondary);" aria-hidden="true">
          <path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
          <path d="M19 15v4M17 17h4" />
        </svg>
        <span class="min-w-0">
          <span class="flex items-center gap-2 text-[15px] font-medium" style="color: var(--kv-text-primary);">{{ t('media.source.aiVideo') }}<AiVideoActiveDot /></span>
          <span class="block text-[12px]" style="color: var(--kv-text-muted);">{{ t('media.source.aiVideoHint') }}</span>
        </span>
      </button>
    </div>
  </KvModal>
  <AiVideoDialog v-if="aiOpen" mode="media" @close="aiOpen = false" @use="onAiUse" />

  <input ref="staticInput" type="file" :accept="STATIC_ACCEPT" class="hidden" @change="onChange" />
  <input ref="animatedInput" type="file" :accept="ANIMATED_ACCEPT" class="hidden" @change="onChange" />
</template>
