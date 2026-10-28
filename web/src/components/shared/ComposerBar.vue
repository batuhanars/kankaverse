<script setup lang="ts">
/**
 * ComposerBar — mesaj kutusu giriş satırı (kanal + DM ortak).
 * Kenarlıklı satır kabı, ataç, @bahsetme listesi, textarea, ✨, GIF ve emoji düğmeleri.
 * Gönderme/yazıyor/bahsetme mantığı, yanıt şeridi ve gizli dosya input'ları ebeveyninde kalır.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'
import EmojiPicker from '@/components/shared/EmojiPicker.vue'
import EmojiFaceIcon from '@/components/shared/EmojiFaceIcon.vue'
import GifIcon from '@/components/shared/GifIcon.vue'
import AiVideoButton from '@/components/shared/AiVideoButton.vue'

defineProps<{
  placeholder: string
  mention: ReturnType<typeof useMentionAutocomplete>
  // Yanıt şeridi açıkken yalnız alt köşeler yuvarlak (üstte şerit var)
  roundedBottomOnly?: boolean
}>()

const emit = defineEmits<{
  keydown: [e: KeyboardEvent]
  input: [e: Event]
  blur: []
  'pick-file': []
  'pick-gif': []
  emoji: [emoji: string]
  'ai-attachment': [id: string]
}>()

const content = defineModel<string>({ required: true })

const { t } = useI18n()

const textarea = ref<HTMLTextAreaElement | null>(null)
const showEmojiPicker = ref(false)
// Compose emoji picker tetikleyici butonu (Teleport konumlandırması için)
const emojiTriggerEl = ref<HTMLElement | null>(null)

function toggleEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  showEmojiPicker.value = !showEmojiPicker.value
}

function onEmojiSelect(emoji: string) {
  showEmojiPicker.value = false
  emit('emoji', emoji)
}

// Compose emoji picker dışı tıklamada kapat
// Picker body'e Teleport edildiği için DOM'da .v3-emoji-picker sınıfından tanıyoruz.
function onPickerDocClick(e: MouseEvent) {
  if (emojiTriggerEl.value?.contains(e.target as Node)) return
  const pickerInDom = (e.target as Element)?.closest?.('.v3-emoji-picker')
  if (!pickerInDom) {
    showEmojiPicker.value = false
  }
}

onMounted(() => document.addEventListener('click', onPickerDocClick))
onUnmounted(() => document.removeEventListener('click', onPickerDocClick))

defineExpose({ textarea })
</script>

<template>
  <div
    class="flex items-center gap-2 px-4 border"
    :class="roundedBottomOnly ? 'rounded-b-[var(--kv-radius-md)]' : 'rounded-[var(--kv-radius-md)]'"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); min-height: 44px;"
  >
    <!-- Ek (ataç) butonu -->
    <button
      type="button"
      class="shrink-0 w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:opacity-100"
      style="color: var(--kv-text-secondary); align-self: center;"
      :aria-label="t('attachment.addFile')"
      :title="t('attachment.addFile')"
      @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)'"
      @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-secondary)'"
      @click="emit('pick-file')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
      </svg>
    </button>
    <!-- Sprint V2: mention autocomplete — relative sarmalayıcı popover için -->
    <div class="relative flex-1 min-w-0">
      <div
        v-if="mention.showPopover.value"
        class="absolute bottom-full left-0 mb-1 z-50 min-w-[200px] max-w-[320px] overflow-hidden rounded-[var(--kv-radius-md)] border"
        style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
        @mousedown.prevent
      >
        <div
          v-for="(member, idx) in mention.suggestions.value"
          :key="member.id"
          class="flex items-center gap-2 px-3 py-2 cursor-pointer text-[14px]"
          :style="idx === mention.activeIndex.value
            ? 'background-color: var(--kv-accent-subtle); color: var(--kv-text-primary);'
            : 'color: var(--kv-text-secondary);'"
          @click="mention.selectSuggestion(member)"
        >
          <!-- @everyone → grup ikonu + açıklama -->
          <template v-if="member.isEveryone">
            <div class="w-6 h-6 rounded-full shrink-0 flex items-center justify-center" style="background-color: var(--kv-bg-content);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-secondary);"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <span class="font-semibold">@everyone</span>
            <span class="text-[12px] truncate" style="color: var(--kv-text-muted);">{{ t('mention.everyoneHint') }}</span>
          </template>
          <!-- R15 — rol önerisi: rolün KENDİ rengiyle, altıgen değil yuvarlak nokta.
               Aynı adı taşıyan bir üyeyle karışmasın diye ikon ve renk ayrı tutuldu. -->
          <template v-else-if="member.isRole">
            <div class="w-6 h-6 rounded-full shrink-0 flex items-center justify-center" style="background-color: var(--kv-bg-content);">
              <span
                class="w-2.5 h-2.5 rounded-full"
                :style="{ backgroundColor: member.color || 'var(--kv-text-muted)' }"
              />
            </div>
            <span class="font-semibold" :style="{ color: member.color || undefined }">@{{ member.username }}</span>
            <span class="text-[12px] truncate" style="color: var(--kv-text-muted);">{{ t('mention.roleHint') }}</span>
          </template>
          <!-- Gerçek üye → daire avatar -->
          <template v-else>
            <div
              class="w-6 h-6 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white"
              style="background-color: var(--kv-accent-500);"
            >
              <img v-if="member.avatarUrl" :src="member.avatarUrl" :alt="member.username" class="w-full h-full object-cover" />
              <span v-else>{{ member.username[0].toUpperCase() }}</span>
            </div>
            <span class="font-medium">@{{ member.username }}</span>
          </template>
        </div>
      </div>
      <textarea
        ref="textarea"
        v-model="content"
        rows="1"
        :placeholder="placeholder"
        class="w-full bg-transparent text-[15px] resize-none outline-none"
        style="max-height: 50vh; font-family: var(--kv-font-ui); color: var(--kv-text-primary); line-height: 1.5; padding-top: 10px; padding-bottom: 10px;"
        @keydown="emit('keydown', $event)"
        @input="emit('input', $event)"
        @blur="emit('blur')"
      />
    </div>
    <AiVideoButton @attachment="(id) => emit('ai-attachment', id)" />
    <!-- GIF butonu -->
    <button
      type="button"
      class="emoji-btn shrink-0 self-center py-1 px-1 cursor-pointer flex items-center"
      :aria-label="t('message.gifButton')"
      :title="t('message.gifButton')"
      @click="emit('pick-gif')"
    >
      <GifIcon :size="20" />
    </button>
    <!-- Emoji (😊) butonu -->
    <div class="relative shrink-0 self-center">
      <button
        ref="emojiTriggerEl"
        type="button"
        class="emoji-btn py-1 px-1 cursor-pointer flex items-center"
        :aria-label="t('message.emojiButton')"
        @click.stop="toggleEmojiPicker"
      >
        <EmojiFaceIcon :size="20" />
      </button>
      <!-- Teleport to body ile viewport-farkındalıklı konumlandırma -->
      <EmojiPicker
        v-if="showEmojiPicker"
        :anchor-el="emojiTriggerEl"
        @select="onEmojiSelect"
      />
    </div>
  </div>
</template>
