<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import EmojiPicker from './EmojiPicker.vue'

defineOptions({ name: 'MessageActionsMenu' })

const props = defineProps<{
  messageId: string
  isMine: boolean
  hasContent: boolean
  isPinned: boolean
  canPin: boolean
}>()

const emit = defineEmits<{
  reply: []
  edit: []
  delete: []
  report: []
  addReaction: [emoji: string]
  pin: []
  unpin: []
}>()

const { t } = useI18n()

// Hızlı reaksiyon seti (hover toolbar'da gösterilecek 3 emoji)
const QUICK_EMOJIS = ['👍', '❤️', '😂']

// ⋯ daha-fazla açılır
const showMore = ref(false)
// 🙂 tam emoji picker
const showEmojiPicker = ref(false)
// hızlı emoji seti (⋯ içinde)
const showQuickEmoji = ref(false)

const moreEl = ref<HTMLElement | null>(null)
const emojiEl = ref<HTMLElement | null>(null)

function closeAll() {
  showMore.value = false
  showEmojiPicker.value = false
  showQuickEmoji.value = false
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

function onPin() {
  closeAll()
  emit('pin')
}

function onUnpin() {
  closeAll()
  emit('unpin')
}

function toggleMore(e: MouseEvent) {
  e.stopPropagation()
  showEmojiPicker.value = false
  showQuickEmoji.value = false
  showMore.value = !showMore.value
}

function toggleEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  showMore.value = false
  showEmojiPicker.value = !showEmojiPicker.value
}

function pickEmoji(emoji: string) {
  closeAll()
  emit('addReaction', emoji)
}

function onDocClick(e: MouseEvent) {
  const moreOpen = moreEl.value && moreEl.value.contains(e.target as Node)
  const emojiOpen = emojiEl.value && emojiEl.value.contains(e.target as Node)
  if (!moreOpen && !emojiOpen) {
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
  <!--
    Yatay hover araç çubuğu (Discord stili).
    Konum: üst bileşen tarafından absolute -top-3 right-4 ile konumlandırılır.
    Kap: kv-bg-elevated + 1px kv-border-subtle kenarlık + kv-radius-md, gölge yok.
  -->
  <div
    class="flex items-center rounded-[var(--kv-radius-md)] border"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
    @click.stop
  >
    <!-- Hızlı reaksiyon emoji'leri -->
    <button
      v-for="emoji in QUICK_EMOJIS"
      :key="emoji"
      class="w-8 h-8 flex items-center justify-center text-[16px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      :title="emoji"
      @click="pickEmoji(emoji)"
    >
      {{ emoji }}
    </button>

    <!-- 🙂 Reaksiyon ekle (tam picker) -->
    <div ref="emojiEl" class="relative">
      <button
        class="w-8 h-8 flex items-center justify-center text-[15px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
        :class="showEmojiPicker ? 'bg-[var(--kv-bg-sidebar)]' : ''"
        :title="t('reaction.addReaction')"
        @click="toggleEmojiPicker"
      >
        🙂
      </button>
      <!-- Tam emoji picker -->
      <div
        v-if="showEmojiPicker"
        class="absolute bottom-full right-0 mb-2 z-50"
        @click.stop
      >
        <EmojiPicker @select="pickEmoji" />
      </div>
    </div>

    <!-- ↩ Yanıtla -->
    <button
      class="w-8 h-8 flex items-center justify-center text-[15px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      :title="t('reply.button')"
      @click="onReply"
    >
      ↩
    </button>

    <!-- ⋯ Daha fazla -->
    <div ref="moreEl" class="relative">
      <button
        class="w-8 h-8 flex items-center justify-center text-[16px] font-bold cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
        :class="showMore ? 'bg-[var(--kv-bg-sidebar)]' : ''"
        style="color: var(--kv-text-secondary); line-height: 1;"
        :title="t('message.actions')"
        @click="toggleMore"
      >
        ⋯
      </button>

      <!-- Daha fazla açılır menüsü -->
      <div
        v-if="showMore"
        class="absolute top-full right-0 mt-1 z-50 rounded-[var(--kv-radius-md)] py-1 min-w-[160px]"
        style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
      >
        <!-- Düzenle (yalnız kendi + içerik varsa) -->
        <button
          v-if="isMine && hasContent"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-text-primary);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
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
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'rgba(242,59,75,0.1)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onDelete"
        >
          <span class="text-[15px] shrink-0">🗑</span>
          <span>{{ t('message.delete') }}</span>
        </button>

        <!-- Sabitle / Sabitlemeyi kaldır (yetkiye göre) -->
        <button
          v-if="canPin && !isPinned"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-text-primary);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onPin"
        >
          <span class="text-[15px] shrink-0">📌</span>
          <span>{{ t('message.pin') }}</span>
        </button>
        <button
          v-if="canPin && isPinned"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-text-primary);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onUnpin"
        >
          <span class="text-[15px] shrink-0">📌</span>
          <span>{{ t('message.unpin') }}</span>
        </button>

        <!-- Şikâyet (yalnız başkasının mesajı) -->
        <button
          v-if="!isMine"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer transition-colors text-left"
          style="color: var(--kv-danger);"
          @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'rgba(242,59,75,0.1)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = ''"
          @click="onReport"
        >
          <span class="text-[15px] shrink-0">🚩</span>
          <span>{{ t('report.reportMessage') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
