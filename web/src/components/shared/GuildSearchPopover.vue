<script setup lang="ts">
/**
 * GuildSearchPopover — sunucu-geneli mesaj arama paneli.
 * GET /guilds/:id/messages/search → erişilebilir kanallarda, kanal-gruplu sonuç.
 * Sonuca tıkla → o kanala git + mesaja zıpla. Eşleşen kelime highlight.
 */
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { messagesApi, type GuildSearchGroup } from '@/api/messages'
import { useMessageJump } from '@/composables/useMessageJump'
import { formatMentionsPlain } from '@/utils/mentions'

defineOptions({ name: 'GuildSearchPopover' })

const props = defineProps<{ guildId: string; open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const router = useRouter()
const { requestJump } = useMessageJump()

const query = ref('')
const groups = ref<GuildSearchGroup[]>([])
const loading = ref(false)
const error = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const popoverEl = ref<HTMLElement | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function highlight(content: string): string {
  const safe = escapeHtml(formatMentionsPlain(content, () => undefined, t('mention.unknown')))
  const term = query.value.trim()
  if (!term) return safe
  const re = new RegExp(`(${escapeRegex(escapeHtml(term))})`, 'gi')
  return safe.replace(re, '<mark class="kv-hl">$1</mark>')
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) +
    ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
}

async function doSearch(q: string) {
  if (q.trim().length < 2) return
  loading.value = true
  error.value = ''
  try {
    const res = await messagesApi.searchGuildMessages(props.guildId, { q: q.trim() })
    groups.value = res.data
  } catch {
    error.value = t('messageSearch.error')
  } finally {
    loading.value = false
  }
}

function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  const q = query.value.trim()
  if (q.length < 2) { groups.value = []; loading.value = false; error.value = ''; return }
  debounceTimer = setTimeout(() => doSearch(query.value), 300)
}

function onResult(channelId: string, messageId: string) {
  emit('close')
  router.push({ name: 'channel', params: { guildId: props.guildId, channelId } })
  // Navigasyon sonrası hedef kanal MessageArea'sı zıplama isteğini tüketir
  requestJump(channelId, messageId)
}

const totalResults = () => groups.value.reduce((s, g) => s + g.messages.length, 0)

watch(() => props.open, (val) => {
  if (val) {
    query.value = ''; groups.value = []; loading.value = false; error.value = ''
    nextTick(() => inputEl.value?.focus())
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onDocKeydown)
  } else {
    if (debounceTimer) clearTimeout(debounceTimer)
    document.removeEventListener('click', onDocClick)
    document.removeEventListener('keydown', onDocKeydown)
  }
})

function onDocClick(e: MouseEvent) {
  if (popoverEl.value && !popoverEl.value.contains(e.target as Node)) emit('close')
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <div
    v-if="open"
    ref="popoverEl"
    class="absolute top-full right-0 mt-2 z-50 w-[420px] max-h-[560px] flex flex-col overflow-hidden rounded-[var(--kv-radius-md)]"
    style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
    @click.stop
  >
    <div class="flex items-center justify-between px-4 py-3 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
      <span class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">{{ t('guildSearch.title') }}</span>
      <button class="w-6 h-6 flex items-center justify-center rounded text-[14px] cursor-pointer" style="color: var(--kv-text-muted);" :title="t('common.close')" @click="emit('close')">✕</button>
    </div>

    <div class="px-4 py-2 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] outline-none border"
        style="background-color: var(--kv-bg-content); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui);"
        :placeholder="t('guildSearch.placeholder')"
        @input="onInput"
      />
    </div>

    <div class="flex-1 overflow-y-auto py-2">
      <p v-if="query.length > 0 && query.trim().length < 2" class="px-4 py-3 text-[13px]" style="color: var(--kv-text-muted);">{{ t('messageSearch.minChars') }}</p>
      <p v-else-if="loading" class="px-4 py-3 text-[13px]" style="color: var(--kv-text-muted);">{{ t('messageSearch.loading') }}</p>
      <p v-else-if="error" class="px-4 py-3 text-[13px]" style="color: var(--kv-danger);">{{ error }}</p>
      <p v-else-if="query.trim().length >= 2 && totalResults() === 0" class="px-4 py-3 text-[13px]" style="color: var(--kv-text-muted);">{{ t('messageSearch.empty') }}</p>

      <template v-else>
        <div v-for="g in groups" :key="g.channelId" class="mb-1">
          <p class="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            # {{ g.channelName }}
          </p>
          <div
            v-for="msg in g.messages"
            :key="msg.id"
            class="flex gap-3 px-4 py-2 cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
            role="button"
            :title="t('message.jumpToMessage')"
            @click="onResult(g.channelId, msg.id)"
          >
            <div class="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[11px] font-semibold text-white" style="background-color: var(--kv-accent-500);">
              <img v-if="msg.author.avatarUrl" :src="msg.author.avatarUrl" :alt="msg.author.username" class="w-full h-full object-cover" />
              <span v-else>{{ msg.author.username[0].toUpperCase() }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 mb-0.5">
                <span class="text-[13px] font-semibold truncate" style="color: var(--kv-text-primary);">{{ msg.author.username }}</span>
                <span class="text-[11px] shrink-0" style="color: var(--kv-text-muted);">{{ formatTime(msg.createdAt) }}</span>
              </div>
              <p v-if="msg.content" class="text-[13px] break-words line-clamp-2" style="color: var(--kv-text-body);" v-html="highlight(msg.content)" />
              <p v-else-if="msg.attachments?.length" class="text-[13px] italic" style="color: var(--kv-text-muted);">{{ msg.attachments[0].filename }}</p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
:deep(.kv-hl) {
  background-color: rgba(255, 107, 61, 0.28);
  color: var(--kv-text-primary);
  border-radius: 3px;
  padding: 0 1px;
  font-weight: 600;
}
</style>
