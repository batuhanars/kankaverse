<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import EmojiPicker from './EmojiPicker.vue'
import EmojiFaceIcon from './EmojiFaceIcon.vue'

defineOptions({ name: 'EmojiInsertButton' })

/** C21: ad alanlarına emoji ekleme düğmesi (mevcut vue3-emoji-picker). Seçileni `pick` ile bildirir. */
defineProps<{ label?: string }>()
const emit = defineEmits<{ pick: [emoji: string] }>()

const { t } = useI18n()
const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)

function onPick(emoji: string) {
  open.value = false
  emit('pick', emoji)
}

function onDocClick(e: MouseEvent) {
  if (!open.value) return
  // Picker body'e Teleport edildiği için .v3-emoji-picker ile tanınır.
  if (triggerEl.value?.contains(e.target as Node)) return
  if ((e.target as Element)?.closest?.('.v3-emoji-picker')) return
  open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="relative shrink-0">
    <button
      ref="triggerEl"
      type="button"
      class="emoji-btn px-1.5 py-1 cursor-pointer flex items-center"
      :aria-label="label ?? t('message.emojiButton')"
      @click.stop="open = !open"
    >
      <EmojiFaceIcon :size="18" />
    </button>
    <EmojiPicker v-if="open" :anchor-el="triggerEl" @select="onPick" />
  </div>
</template>
