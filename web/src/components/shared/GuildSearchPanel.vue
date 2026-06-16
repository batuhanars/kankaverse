<script setup lang="ts">
/**
 * GuildSearchPanel — sağ-sütun ortam-geneli mesaj arama paneli (R13).
 * GET /guilds/:id/messages/search?q=&from=&mentions= → erişilebilir kanallarda, kanal-gruplu sonuç.
 * Filtreler: Gönderen (from=authorId) + Bahsedilen (mentions=userId), ortam üyesi seçici.
 * Sonuca tıkla → o kanala git + mesaja zıpla. Eşleşen kelime highlight (v-html YOK — güvenli).
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { messagesApi, type GuildSearchGroup } from '@/api/messages'
import { useMembersStore } from '@/stores/members'
import { useMessageJump } from '@/composables/useMessageJump'
import { useGuildSearchPanel } from '@/composables/useGuildSearchPanel'
import { formatMentionsPlain } from '@/utils/mentions'
import GuildMemberSelect from './GuildMemberSelect.vue'
import type { GuildMemberDto } from '@/types'

defineOptions({ name: 'GuildSearchPanel' })

const props = defineProps<{ guildId: string }>()

const { t } = useI18n()
const router = useRouter()
const membersStore = useMembersStore()
const { requestJump } = useMessageJump()
const { close } = useGuildSearchPanel()

const query = ref('')
const fromMember = ref<GuildMemberDto | null>(null)
const mentionsMember = ref<GuildMemberDto | null>(null)
const showFilters = ref(false)

const groups = ref<GuildSearchGroup[]>([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

const members = computed(() => membersStore.membersFor(props.guildId))

// En az biri (q≥2 | from | mentions) dolu olmalı
const canSearch = computed(
  () => query.value.trim().length >= 2 || !!fromMember.value || !!mentionsMember.value,
)

// ── Güvenli highlight: parça parça, v-html YOK ───────────────────────────
interface Part { text: string; mark: boolean }
function highlightParts(content: string): Part[] {
  const plain = formatMentionsPlain(content, () => undefined, t('mention.unknown'))
  const term = query.value.trim()
  if (!term) return [{ text: plain, mark: false }]
  const lower = plain.toLowerCase()
  const needle = term.toLowerCase()
  const parts: Part[] = []
  let i = 0
  while (i < plain.length) {
    const idx = lower.indexOf(needle, i)
    if (idx === -1) {
      parts.push({ text: plain.slice(i), mark: false })
      break
    }
    if (idx > i) parts.push({ text: plain.slice(i, idx), mark: false })
    parts.push({ text: plain.slice(idx, idx + needle.length), mark: true })
    i = idx + needle.length
  }
  return parts
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  )
}

async function doSearch() {
  if (!canSearch.value) return
  loading.value = true
  error.value = ''
  searched.value = true
  try {
    const res = await messagesApi.searchGuildMessages(props.guildId, {
      q: query.value.trim() || undefined,
      from: fromMember.value?.userId,
      mentions: mentionsMember.value?.userId,
    })
    groups.value = res.data
  } catch {
    error.value = t('messageSearch.error')
    groups.value = []
  } finally {
    loading.value = false
  }
}

function onResult(channelId: string, messageId: string) {
  router.push({ name: 'channel', params: { guildId: props.guildId, channelId } })
  // Navigasyon sonrası hedef kanal MessageArea'sı zıplama isteğini tüketir
  requestJump(channelId, messageId)
}

const totalResults = () => groups.value.reduce((s, g) => s + g.messages.length, 0)

function clearFrom() {
  fromMember.value = null
}
function clearMentions() {
  mentionsMember.value = null
}

// Filtre değişince mevcut sonuçlar bayatlar → yeniden ara (q en az 2 ise ya da filtre varsa)
watch([fromMember, mentionsMember], () => {
  if (searched.value || canSearch.value) doSearch()
})

onMounted(async () => {
  nextTick(() => inputEl.value?.focus())
  if (!members.value.length) {
    try {
      await membersStore.fetchMembers(props.guildId)
    } catch {
      /* üye seçici boş kalır, arama yine de q ile çalışır */
    }
  }
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
</script>

<template>
  <aside
    class="w-[248px] shrink-0 flex flex-col min-h-0 overflow-hidden rounded-[var(--kv-radius-lg)] border"
    style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
  >
    <!-- Başlık -->
    <div
      class="flex items-center justify-between px-4 shrink-0 border-b"
      style="height: var(--kv-header-height); border-color: var(--kv-border-subtle);"
    >
      <span class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">
        {{ t('guildSearch.title') }}
      </span>
      <button
        class="w-6 h-6 flex items-center justify-center rounded text-[14px] cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
        style="color: var(--kv-text-muted);"
        :title="t('common.close')"
        @click="close"
      >
        ✕
      </button>
    </div>

    <!-- Arama girişi + filtreler -->
    <div class="px-3 py-3 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] outline-none border"
        style="background-color: var(--kv-bg-content); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui);"
        :placeholder="t('guildSearch.placeholder')"
        @keydown.enter="doSearch"
      />

      <button
        class="mt-2 flex items-center gap-1 text-[12px] cursor-pointer transition-colors"
        :style="showFilters ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
        @click="showFilters = !showFilters"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="7" y1="12" x2="17" y2="12" />
          <line x1="10" y1="18" x2="14" y2="18" />
        </svg>
        {{ t('guildSearch.filters') }}
      </button>

      <div v-if="showFilters" class="mt-2 flex flex-col gap-2">
        <!-- Gönderen -->
        <div>
          <p class="text-[11px] mb-1" style="color: var(--kv-text-muted);">
            {{ t('guildSearch.fromLabel') }}
          </p>
          <div v-if="fromMember" class="flex items-center gap-1.5 px-2 py-1 rounded-[var(--kv-radius-sm)]" style="background-color: var(--kv-accent-subtle);">
            <span class="text-[12px] truncate flex-1" style="color: var(--kv-accent-500);">{{ fromMember.username }}</span>
            <button class="text-[12px] cursor-pointer" style="color: var(--kv-accent-500);" :title="t('common.clear')" @click="clearFrom">✕</button>
          </div>
          <GuildMemberSelect
            v-else
            :members="members"
            :placeholder="t('guildSearch.selectMember')"
            @select="fromMember = $event"
          />
        </div>

        <!-- Bahsedilen -->
        <div>
          <p class="text-[11px] mb-1" style="color: var(--kv-text-muted);">
            {{ t('guildSearch.mentionsLabel') }}
          </p>
          <div v-if="mentionsMember" class="flex items-center gap-1.5 px-2 py-1 rounded-[var(--kv-radius-sm)]" style="background-color: var(--kv-accent-subtle);">
            <span class="text-[12px] truncate flex-1" style="color: var(--kv-accent-500);">{{ mentionsMember.username }}</span>
            <button class="text-[12px] cursor-pointer" style="color: var(--kv-accent-500);" :title="t('common.clear')" @click="clearMentions">✕</button>
          </div>
          <GuildMemberSelect
            v-else
            :members="members"
            :placeholder="t('guildSearch.selectMember')"
            @select="mentionsMember = $event"
          />
        </div>
      </div>
    </div>

    <!-- Sonuç sayacı -->
    <div
      v-if="searched && !loading && !error"
      class="px-4 py-2 shrink-0 text-[11px] font-semibold uppercase tracking-widest border-b"
      style="color: var(--kv-text-muted); border-color: var(--kv-border-subtle);"
    >
      {{ t('guildSearch.resultCount', { n: totalResults() }) }}
    </div>

    <!-- Sonuç listesi -->
    <div class="flex-1 overflow-y-auto py-2">
      <p
        v-if="!searched"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('guildSearch.hint') }}
      </p>
      <p v-else-if="loading" class="px-4 py-3 text-[13px]" style="color: var(--kv-text-muted);">
        {{ t('messageSearch.loading') }}
      </p>
      <p v-else-if="error" class="px-4 py-3 text-[13px]" style="color: var(--kv-danger);">
        {{ error }}
      </p>
      <p
        v-else-if="totalResults() === 0"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('messageSearch.empty') }}
      </p>

      <template v-else>
        <div v-for="g in groups" :key="g.channelId" class="mb-1">
          <p
            class="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-widest truncate"
            style="color: var(--kv-text-muted);"
          >
            # {{ g.channelName }}
          </p>
          <div
            v-for="msg in g.messages"
            :key="msg.id"
            class="flex gap-2.5 px-4 py-2 cursor-pointer transition-colors hover:bg-[var(--kv-bg-content)]"
            role="button"
            :title="t('message.jumpToMessage')"
            @click="onResult(g.channelId, msg.id)"
          >
            <div
              class="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[11px] font-semibold text-white"
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
              ><template v-for="(part, i) in highlightParts(msg.content)" :key="i"><mark
                  v-if="part.mark"
                  class="kv-hl"
                >{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></p>
              <p
                v-else-if="msg.attachments?.length"
                class="text-[13px] italic"
                style="color: var(--kv-text-muted);"
              >
                {{ msg.attachments[0].filename }}
              </p>
            </div>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.kv-hl {
  background-color: rgba(255, 107, 61, 0.28);
  color: var(--kv-text-primary);
  border-radius: 3px;
  padding: 0 1px;
  font-weight: 600;
}
</style>
