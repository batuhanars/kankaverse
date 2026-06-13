<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import EmojiPicker from './EmojiPicker.vue'

defineOptions({ name: 'MessageActionsMenu' })

const props = defineProps<{
  messageId: string
  isMine: boolean
  hasContent: boolean
}>()

const emit = defineEmits<{
  reply: []
  edit: []
  delete: []
  report: []
  addReaction: [emoji: string]
}>()

const { t } = useI18n()

const open = ref(false)
const showEmojiPicker = ref(false)
const showFullEmojiPicker = ref(false)
const menuEl = ref<HTMLElement | null>(null)

const EMOJI_SET = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']

function toggleMenu(e: MouseEvent) {
  e.stopPropagation()
  open.value = !open.value
  if (!open.value) {
    showEmojiPicker.value = false
    showFullEmojiPicker.value = false
  }
}

function closeAll() {
  open.value = false
  showEmojiPicker.value = false
  showFullEmojiPicker.value = false
}

function onReply() {
  closeAll()
  emit('reply')
}

function onEdit() {
  closeAll()
  emit('edit')
}

function onDelete() {
  closeAll()
  emit('delete')
}

function onReport() {
  closeAll()
  emit('report')
}

function openEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  showFullEmojiPicker.value = false
  showEmojiPicker.value = !showEmojiPicker.value
}

function openFullEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  showEmojiPicker.value = false
  showFullEmojiPicker.value = !showFullEmojiPicker.value
}

function pickEmoji(emoji: string) {
  closeAll()
  emit('addReaction', emoji)
}

function onDocClick(e: MouseEvent) {
  if (menuEl.value && !menuEl.value.contains(e.target as Node)) {
    closeAll()
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeAll()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKeydown)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKeydown)
})
</script>

<template>
  <div ref="menuEl" class="relative" @click.stop>
    <!-- ⋯ Kebab butonu -->
    <button
      class="w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors text-[16px] font-bold leading-none hover:text-[var(--kv-text-primary)]"
      style="color: var(--kv-text-secondary);"
      :class="open ? 'bg-[var(--kv-bg-sidebar)]' : 'hover:bg-[var(--kv-bg-sidebar)]'"
      :title="t('message.actions')"
      @click="toggleMenu"
    >
      ⋯
    </button>

    <!-- Dropdown menü -->
    <div
      v-if="open"
      class="absolute top-full right-0 mt-1 z-50 rounded-[var(--kv-radius-md)] py-1 min-w-[168px]"
      style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
    >
      <!-- Yanıtla -->
      <button
        class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
        style="color: var(--kv-text-primary);"
        @mouseenter="($event.target as HTMLElement).closest('button')!.style.backgroundColor = 'var(--kv-accent-subtle)'"
        @mouseleave="($event.target as HTMLElement).closest('button')!.style.backgroundColor = ''"
        @click="onReply"
      >
        <span class="text-[15px] shrink-0">↩</span>
        <span>{{ t('reply.button') }}</span>
      </button>

      <!-- Reaksiyon ekle -->
      <div class="relative">
        <button
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-text-primary);"
          @mouseenter="($event.target as HTMLElement).closest('button')!.style.backgroundColor = 'var(--kv-accent-subtle)'"
          @mouseleave="($event.target as HTMLElement).closest('button')!.style.backgroundColor = ''"
          @click="openEmojiPicker"
        >
          <span class="text-[15px] shrink-0">🙂</span>
          <span>{{ t('reaction.addReaction') }}</span>
        </button>

        <!-- Hızlı emoji seti (quick picker) -->
        <div
          v-if="showEmojiPicker"
          class="absolute left-full top-0 ml-1 z-50 flex flex-wrap gap-1 p-1.5 rounded-[var(--kv-radius-md)]"
          style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); width: 188px;"
          @click.stop
        >
          <button
            v-for="emoji in EMOJI_SET"
            :key="emoji"
            class="text-[18px] w-8 h-8 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--kv-bg-sidebar)]"
            @click="pickEmoji(emoji)"
          >
            {{ emoji }}
          </button>
          <!-- Daha fazla: tam picker -->
          <button
            class="text-[12px] w-8 h-8 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--kv-bg-sidebar)] font-bold"
            style="color: var(--kv-text-muted);"
            :title="t('reaction.morePicker')"
            @click.stop="openFullEmojiPicker"
          >
            ⋯
          </button>
          <!-- Tam emoji picker -->
          <div
            v-if="showFullEmojiPicker"
            class="absolute left-full top-0 ml-1 z-50"
            @click.stop
          >
            <EmojiPicker @select="pickEmoji" />
          </div>
        </div>
      </div>

      <!-- Divider (kendi mesajı için aksiyon varsa) -->
      <div
        v-if="isMine"
        class="my-1 mx-2"
        style="height: 1px; background-color: var(--kv-border-subtle);"
      />

      <!-- Düzenle (yalnız kendi + içerik varsa) -->
      <button
        v-if="isMine && hasContent"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
        style="color: var(--kv-text-primary);"
        @mouseenter="($event.target as HTMLElement).closest('button')!.style.backgroundColor = 'var(--kv-accent-subtle)'"
        @mouseleave="($event.target as HTMLElement).closest('button')!.style.backgroundColor = ''"
        @click="onEdit"
      >
        <span class="text-[15px] shrink-0">✏️</span>
        <span>{{ t('message.edit') }}</span>
      </button>

      <!-- Sil (yalnız kendi mesajı) -->
      <button
        v-if="isMine"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
        style="color: var(--kv-danger);"
        @mouseenter="($event.target as HTMLElement).closest('button')!.style.backgroundColor = 'rgba(242,59,75,0.1)'"
        @mouseleave="($event.target as HTMLElement).closest('button')!.style.backgroundColor = ''"
        @click="onDelete"
      >
        <span class="text-[15px] shrink-0">🗑</span>
        <span>{{ t('message.delete') }}</span>
      </button>

      <!-- Şikâyet (yalnız başkasının mesajı) -->
      <button
        v-if="!isMine"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
        style="color: var(--kv-danger);"
        @mouseenter="($event.target as HTMLElement).closest('button')!.style.backgroundColor = 'rgba(242,59,75,0.1)'"
        @mouseleave="($event.target as HTMLElement).closest('button')!.style.backgroundColor = ''"
        @click="onReport"
      >
        <span class="text-[15px] shrink-0">🚩</span>
        <span>{{ t('report.reportMessage') }}</span>
      </button>
    </div>
  </div>
</template>
