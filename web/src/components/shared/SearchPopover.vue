<script setup lang="ts">
/**
 * SearchPopover — "Mesajlarda Ara" popover/panel (Sprint V2 §3 contract).
 * TopBar veya DM başlığındaki büyüteç butonuna tıklanınca açılır.
 * GET /channels/:id/messages/search?q= ile liste çeker.
 * Gölge yok, --kv-bg-elevated + ince kenarlık + --kv-radius-md.
 * Dışına tıkla / Esc kapat.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { messagesApi } from '@/api/messages'
import { useMessageJump } from '@/composables/useMessageJump'
import { formatMentionsPlain } from '@/utils/mentions'
import type { MessageDto } from '@/types'

defineOptions({ name: 'SearchPopover' })

const props = defineProps<{
  channelId: string
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { requestJump } = useMessageJump()

// Arama sonucuna tıkla → listede o mesaja zıpla, popover'ı kapat
function onJump(messageId: string) {
  requestJump(props.channelId, messageId)
  emit('close')
}

const query = ref('')
const results = ref<MessageDto[]>([])
const loading = ref(false)
const error = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const popoverEl = ref<HTMLElement | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
}

function contentPlain(content: string): string {
  return formatMentionsPlain(content, () => undefined, t('mention.unknown'))
}

async function doSearch(q: string) {
  if (!props.channelId || q.trim().length < 2) return
  loading.value = true
  error.value = ''
  try {
    const res = await messagesApi.searchMessages(props.channelId, q.trim())
    results.value = res.data
  } catch {
    error.value = t('messageSearch.error')
  } finally {
    loading.value = false
  }
}

function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  const q = query.value.trim()
  if (q.length < 2) {
    results.value = []
    loading.value = false
    error.value = ''
    return
  }
  debounceTimer = setTimeout(() => {
    doSearch(query.value)
  }, 300)
}

// Açılınca input'a odaklan; kapanınca sıfırla
watch(
  () => props.open,
  (val) => {
    if (val) {
      query.value = ''
      results.value = []
      loading.value = false
      error.value = ''
      nextTick(() => inputEl.value?.focus())
      document.addEventListener('click', onDocClick)
      document.addEventListener('keydown', onDocKeydown)
    } else {
      if (debounceTimer) clearTimeout(debounceTimer)
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onDocKeydown)
    }
  },
)

// Dışına tıkla / Esc kapat
function onDocClick(e: MouseEvent) {
  if (popoverEl.value && !popoverEl.value.contains(e.target as Node)) {
    emit('close')
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <div
    v-if="open"
    ref="popoverEl"
    class="absolute top-full right-0 mt-2 z-50 w-[380px] max-h-[520px] flex flex-col overflow-hidden rounded-[var(--kv-radius-md)]"
    style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
    @click.stop
  >
    <!-- Başlık -->
    <div
      class="flex items-center justify-between px-4 py-3 shrink-0 border-b"
      style="border-color: var(--kv-border-subtle);"
    >
      <span class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">
        {{ t('messageSearch.panelTitle') }}
      </span>
      <button
        class="w-6 h-6 flex items-center justify-center rounded text-[14px] cursor-pointer transition-colors"
        style="color: var(--kv-text-muted);"
        :title="t('common.close')"
        @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)'"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- Arama input'u -->
    <div class="px-4 py-2 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] outline-none border"
        style="background-color: var(--kv-bg-content); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui);"
        :placeholder="t('messageSearch.inputPlaceholder')"
        @input="onInput"
      />
    </div>

    <!-- İçerik -->
    <div class="flex-1 overflow-y-auto py-2">
      <!-- <2 karakter ipucu -->
      <p
        v-if="query.length > 0 && query.trim().length < 2"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('messageSearch.minChars') }}
      </p>

      <!-- Yükleniyor -->
      <p
        v-else-if="loading"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('messageSearch.loading') }}
      </p>

      <!-- Hata -->
      <p
        v-else-if="error"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-danger);"
      >
        {{ error }}
      </p>

      <!-- Boş durum (arama yapıldı, sonuç yok) -->
      <p
        v-else-if="query.trim().length >= 2 && !loading && results.length === 0"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('messageSearch.empty') }}
      </p>

      <!-- Sonuçlar -->
      <template v-else>
        <div
          v-for="msg in results"
          :key="msg.id"
          class="flex gap-3 px-4 py-2.5 border-b last:border-b-0 cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
          style="border-color: var(--kv-border-subtle);"
          role="button"
          :title="t('message.jumpToMessage')"
          @click="onJump(msg.id)"
        >
          <!-- Yazar avatarı (daire) -->
          <div
            class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold text-white"
            style="background-color: var(--kv-accent-500);"
          >
            <img
              v-if="msg.author.avatarUrl"
              :src="msg.author.avatarUrl"
              :alt="msg.author.username"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ msg.author.username[0].toUpperCase() }}</span>
          </div>

          <!-- İçerik -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 mb-0.5">
              <span class="text-[13px] font-semibold truncate" style="color: var(--kv-text-primary);">
                {{ msg.author.username }}
              </span>
              <span class="text-[11px] shrink-0" style="color: var(--kv-text-muted);">
                {{ formatTime(msg.createdAt) }}
              </span>
            </div>
            <p
              v-if="msg.content"
              class="text-[13px] break-words line-clamp-3"
              style="color: var(--kv-text-body);"
            >
              {{ contentPlain(msg.content) }}
            </p>
            <p
              v-else-if="msg.attachments?.length"
              class="text-[13px] italic"
              style="color: var(--kv-text-muted);"
            >
              {{ msg.attachments[0].filename }}
            </p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
