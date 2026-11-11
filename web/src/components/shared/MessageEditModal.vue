<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MessageDto } from '@/types'
import { renderMessageHtml } from '@/utils/markdown'
import EmojiInsertButton from './EmojiInsertButton.vue'

defineOptions({ name: 'MessageEditModal' })

/**
 * D96: mesaj düzenleme katmanı (ortam kanalı + DM ortak). Yalnız arayüz: kaydetme/e2ee mantığı
 * çağıran tarafta kalır. Emoji seçici yazma kutusundakiyle aynı EmojiPicker (EmojiInsertButton).
 */
const props = defineProps<{
  message: MessageDto
  loading?: boolean
  error?: string
  mentionResolver?: (userId: string) => string | undefined
  roleResolver?: (roleId: string) => { name: string; color?: string | null } | undefined
}>()
const emit = defineEmits<{ save: []; cancel: [] }>()
const content = defineModel<string>({ required: true })

const { t } = useI18n()
const textareaEl = ref<HTMLTextAreaElement | null>(null)

const previewHtml = computed(() =>
  props.message.content
    ? renderMessageHtml(
        props.message.content,
        (id) => props.mentionResolver?.(id),
        t('mention.unknown'),
        (roleId) => props.roleResolver?.(roleId),
      )
    : '',
)
const canSave = computed(() => !!content.value.trim() && !props.loading)

function autosize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

onMounted(() => {
  const el = textareaEl.value
  if (!el) return
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
  autosize()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    if (canSave.value) emit('save')
  }
}

function insertEmoji(emoji: string) {
  const el = textareaEl.value
  const text = content.value
  const start = el?.selectionStart ?? text.length
  const end = el?.selectionEnd ?? text.length
  content.value = text.slice(0, start) + emoji + text.slice(end)
  void nextTick(() => {
    autosize()
    if (!el) return
    el.focus()
    const pos = start + emoji.length
    el.setSelectionRange(pos, pos)
  })
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-end justify-center md:items-center bg-[var(--kv-bg-overlay)]"
      @click.self="emit('cancel')"
      @keydown.esc.stop="emit('cancel')"
    >
      <div
        class="relative w-full max-w-[560px] flex flex-col gap-4 p-4 md:p-6 rounded-t-[var(--kv-radius-lg)] md:rounded-[var(--kv-radius-lg)] bg-[var(--kv-bg-sidebar)] border border-[var(--kv-border-subtle)] max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        :aria-label="t('message.editTitle')"
      >
        <div class="flex items-center justify-between shrink-0">
          <h2 class="text-[18px] font-semibold text-[var(--kv-text-primary)]">{{ t('message.editTitle') }}</h2>
          <button
            type="button"
            class="flex items-center justify-center rounded-full cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
            style="width: 28px; height: 28px; color: var(--kv-text-muted);"
            :aria-label="t('common.close')"
            @click="emit('cancel')"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Düzenlenen mesajın önizlemesi (yalnız metin; v-html DOMPurify'dan geçer) -->
        <div
          class="px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] break-words max-h-[30vh] overflow-y-auto min-h-0"
          style="background-color: var(--kv-accent-500); color: #fff;"
        >
          <div class="kv-md kv-edit-preview" v-html="previewHtml" />
        </div>

        <p v-if="error" class="text-[12px] shrink-0" style="color: var(--kv-danger);">{{ error }}</p>

        <div
          class="flex items-end gap-1 shrink-0 px-2 py-1.5 rounded-[var(--kv-radius-md)] border"
          style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong);"
        >
          <textarea
            ref="textareaEl"
            v-model="content"
            rows="1"
            class="flex-1 min-w-0 px-2 py-1.5 text-[14px] resize-none outline-none bg-transparent"
            style="color: var(--kv-text-primary); font-family: var(--kv-font-ui); max-height: 160px;"
            :disabled="loading"
            :aria-label="t('message.editTitle')"
            @keydown="onKeydown"
            @input="autosize"
          />
          <EmojiInsertButton class="self-center" @pick="insertEmoji" />
          <button
            type="button"
            class="shrink-0 self-center flex items-center justify-center rounded-full cursor-pointer text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style="width: 34px; height: 34px; background-color: var(--kv-accent-500);"
            :disabled="!canSave"
            :aria-label="t('common.save')"
            @click="emit('save')"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
        <p class="text-[12px] shrink-0" style="color: var(--kv-text-muted);">{{ t('message.editHint') }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Önizleme kor zeminde: bahsetme ve bağlantılar da kor renkli olduğu için beyaza çekilir (okunurluk). */
.kv-edit-preview :deep(.kv-mention) {
  background-color: rgba(255, 255, 255, 0.22);
  color: #fff;
}
.kv-edit-preview :deep(a) {
  color: #fff;
  text-decoration: underline;
}
</style>
