<script setup lang="ts">
/**
 * GuildSearchPanel — sağ-sütun ortam-geneli mesaj arama paneli (R13 + item 2).
 * GET /guilds/:id/messages/search?q=&from=&mentions=&in=&has= → erişilebilir kanallarda,
 * kanal-gruplu sonuç. Discord-tarzı filtre seçici: "Filtre ekle" → kategori listesi
 * (Gönderen / Şu kanalda / İçeren tür / Bahsedilen) → değer seç → chip olarak uygulanır.
 * Sonuca tıkla → o kanala git + mesaja zıpla. Eşleşen kelime highlight (v-html YOK — güvenli).
 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { messagesApi, type GuildSearchGroup } from '@/api/messages'
import { useMembersStore } from '@/stores/members'
import { useChannelsStore } from '@/stores/channels'
import { useMessageJump } from '@/composables/useMessageJump'
import { useGuildSearchPanel } from '@/composables/useGuildSearchPanel'
import { formatMentionsPlain } from '@/utils/mentions'
import type { GuildMemberDto, ChannelDto } from '@/types'

defineOptions({ name: 'GuildSearchPanel' })

const props = defineProps<{ guildId: string }>()

const { t } = useI18n()
const router = useRouter()
const membersStore = useMembersStore()
const channelsStore = useChannelsStore()
const { requestJump } = useMessageJump()
const { close } = useGuildSearchPanel()

const query = ref('') // serbest metin araması
const fromMember = ref<GuildMemberDto | null>(null)
const mentionsMember = ref<GuildMemberDto | null>(null)
const inChannel = ref<ChannelDto | null>(null)
const hasType = ref<'link' | 'file' | null>(null)

// Inline filtre etkileşimi (arama çubuğuna bağlı — Görsel #17/#18):
//  - menuOpen: kategori menüsü görünür (odak + aktif kategori yok)
//  - activeCat: kullanıcı bir kategori seçti → çubukta prefix ("şu kullanıcıdan:") + değer listesi
//  - pickerQuery: activeCat aktifken değer listesini süzen metin (aynı çubuk)
type Cat = 'from' | 'mentions' | 'in' | 'has'
const activeCat = ref<Cat | null>(null)
const menuOpen = ref(false)
const pickerQuery = ref('')
const searchBox = ref<HTMLElement | null>(null)

const groups = ref<GuildSearchGroup[]>([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

// Tek çubuk iki mod: activeCat varsa değer-süzme (pickerQuery), yoksa serbest metin (query)
const inputModel = computed<string>({
  get: () => (activeCat.value ? pickerQuery.value : query.value),
  set: (v: string) => {
    if (activeCat.value) pickerQuery.value = v
    else query.value = v
  },
})

const members = computed(() => membersStore.membersFor(props.guildId))
const filteredMembers = computed(() => {
  const term = pickerQuery.value.trim().toLowerCase()
  return members.value.filter((m) => !term || m.username.toLowerCase().includes(term))
})
const filteredChannels = computed(() => {
  const term = pickerQuery.value.trim().toLowerCase()
  return channelsStore
    .channelsForGuild(props.guildId)
    .filter((c) => c.type === 'GUILD_TEXT' && !c.locked)
    .filter((c) => !term || (c.name ?? '').toLowerCase().includes(term))
})

// Discord-tarzı filtre kategorileri (Görsel #17)
const filterCategories = [
  { kind: 'from' as const, label: () => t('guildSearch.cat.from'), hint: () => t('guildSearch.cat.fromHint') },
  { kind: 'in' as const, label: () => t('guildSearch.cat.in'), hint: () => t('guildSearch.cat.inHint') },
  { kind: 'has' as const, label: () => t('guildSearch.cat.has'), hint: () => t('guildSearch.cat.hasHint') },
  { kind: 'mentions' as const, label: () => t('guildSearch.cat.mentions'), hint: () => t('guildSearch.cat.mentionsHint') },
]
const hasOptions = computed(() => [
  { value: 'link' as const, label: t('guildSearch.has.link') },
  { value: 'file' as const, label: t('guildSearch.has.file') },
])

// Çubuktaki prefix token etiketi (activeCat aktifken — "şu kullanıcıdan:" vb.)
const activeCatToken = computed(() => {
  switch (activeCat.value) {
    case 'from': return t('guildSearch.token.from')
    case 'mentions': return t('guildSearch.token.mentions')
    case 'in': return t('guildSearch.token.in')
    case 'has': return t('guildSearch.token.has')
    default: return ''
  }
})
const valuePlaceholder = computed(() =>
  activeCat.value === 'in' ? t('guildSearch.selectChannel') : t('guildSearch.selectMember'),
)

const hasAnyFilter = computed(
  () => !!fromMember.value || !!mentionsMember.value || !!inChannel.value || !!hasType.value,
)
// En az biri (q≥2 | herhangi bir filtre) dolu olmalı
const canSearch = computed(() => query.value.trim().length >= 2 || hasAnyFilter.value)

const hasLabel = computed(() =>
  hasType.value === 'link' ? t('guildSearch.has.link') : hasType.value === 'file' ? t('guildSearch.has.file') : '',
)

function onInputFocus() {
  if (!activeCat.value) menuOpen.value = true
}
function chooseCategory(kind: Cat) {
  activeCat.value = kind
  menuOpen.value = false
  pickerQuery.value = ''
  nextTick(() => inputEl.value?.focus())
}
function cancelCategory() {
  activeCat.value = null
  pickerQuery.value = ''
  nextTick(() => inputEl.value?.focus())
}
function closeDropdowns() {
  menuOpen.value = false
  activeCat.value = null
  pickerQuery.value = ''
}
// Değer seçildi → filtre uygulanır (watch doSearch tetikler) + menüler kapanır (refocus YOK,
// yoksa odak menüyü hemen yeniden açar). Kullanıcı tekrar tıklayınca menü yine açılır.
function setFrom(m: GuildMemberDto) { fromMember.value = m; closeDropdowns() }
function setMentions(m: GuildMemberDto) { mentionsMember.value = m; closeDropdowns() }
function setIn(c: ChannelDto) { inChannel.value = c; closeDropdowns() }
function setHas(v: 'link' | 'file') { hasType.value = v; closeDropdowns() }

// Enter: aktif kategori yokken serbest metin araması yap + menüyü kapat
function onEnter() {
  if (activeCat.value) return
  menuOpen.value = false
  doSearch()
}

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
      in: inChannel.value?.id,
      has: hasType.value ?? undefined,
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

// Filtre değişince mevcut sonuçlar bayatlar → yeniden ara (q en az 2 ise ya da filtre varsa)
watch([fromMember, mentionsMember, inChannel, hasType], () => {
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

// Çubuk + açılır menü dışına tık → menüleri kapat (yarım kalan kategori iptal)
onClickOutside(searchBox, () => closeDropdowns())

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (activeCat.value) cancelCategory()
    else if (menuOpen.value) menuOpen.value = false
    else close()
  }
}
</script>

<template>
  <aside
    class="w-[320px] shrink-0 flex flex-col min-h-0 overflow-hidden rounded-[var(--kv-radius-lg)] border"
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

    <!-- Arama girişi + inline filtreler (menü arama çubuğuna bağlı — Görsel #17/#18) -->
    <div class="px-3 py-3 shrink-0 border-b" style="border-color: var(--kv-border-subtle);">
      <div ref="searchBox" class="relative">
        <!-- Çubuk: aktif kategori varsa prefix token + değer-süzme; yoksa serbest metin -->
        <div
          class="flex items-center gap-1.5 px-2.5 py-2 rounded-[var(--kv-radius-sm)] border"
          style="background-color: var(--kv-bg-content); border-color: var(--kv-border-strong);"
        >
          <span v-if="activeCat" class="kv-token shrink-0">
            {{ activeCatToken }}
            <button class="kv-token__x" :title="t('common.clear')" @click.stop="cancelCategory">✕</button>
          </span>
          <input
            ref="inputEl"
            v-model="inputModel"
            type="text"
            class="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
            style="color: var(--kv-text-primary); font-family: var(--kv-font-ui);"
            :placeholder="activeCat ? valuePlaceholder : t('guildSearch.placeholder')"
            @focus="onInputFocus"
            @click="onInputFocus"
            @keydown.enter="onEnter"
          />
        </div>

        <!-- Açılır: kategori menüsü (odak + aktif kategori yok) -->
        <div
          v-if="menuOpen && !activeCat"
          class="kv-search-dropdown"
        >
          <p class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ t('guildSearch.filters') }}
          </p>
          <button
            v-for="cat in filterCategories"
            :key="cat.kind"
            class="w-full flex items-start gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
            @click="chooseCategory(cat.kind)"
          >
            <span class="mt-0.5 shrink-0" style="color: var(--kv-text-muted);">
              <svg v-if="cat.kind === 'from'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <svg v-else-if="cat.kind === 'in'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
              <svg v-else-if="cat.kind === 'has'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>
            </span>
            <span class="min-w-0">
              <span class="block text-[13px] font-semibold" style="color: var(--kv-text-primary);">{{ cat.label() }}</span>
              <span class="block text-[11px]" style="color: var(--kv-text-muted);">{{ cat.hint() }}</span>
            </span>
          </button>
        </div>

        <!-- Açılır: değer listesi (aktif kategori) -->
        <div v-else-if="activeCat" class="kv-search-dropdown">
          <p class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style="color: var(--kv-text-muted);">
            {{ activeCatToken }}
          </p>

          <!-- Gönderen / Bahsedilen → üye listesi -->
          <template v-if="activeCat === 'from' || activeCat === 'mentions'">
            <button
              v-for="m in filteredMembers"
              :key="m.userId"
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
              @click="activeCat === 'from' ? setFrom(m) : setMentions(m)"
            >
              <span class="w-6 h-6 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white" style="background-color: var(--kv-accent-500);">
                <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.username" class="w-full h-full object-cover" />
                <span v-else>{{ m.username[0]?.toUpperCase() }}</span>
              </span>
              <span class="truncate text-[13px]" style="color: var(--kv-text-primary);">{{ m.username }}</span>
            </button>
            <p v-if="!filteredMembers.length" class="px-3 py-2 text-[12px]" style="color: var(--kv-text-muted);">
              {{ t('guildSearch.noMembers') }}
            </p>
          </template>

          <!-- Şu kanalda → kanal listesi -->
          <template v-else-if="activeCat === 'in'">
            <button
              v-for="c in filteredChannels"
              :key="c.id"
              class="w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
              style="color: var(--kv-text-primary);"
              @click="setIn(c)"
            >
              <span style="color: var(--kv-text-muted);">#</span>
              <span class="truncate">{{ c.name }}</span>
            </button>
            <p v-if="!filteredChannels.length" class="px-3 py-2 text-[12px]" style="color: var(--kv-text-muted);">
              {{ t('guildSearch.noChannels') }}
            </p>
          </template>

          <!-- İçeren tür → bağlantı / dosya -->
          <template v-else-if="activeCat === 'has'">
            <button
              v-for="opt in hasOptions"
              :key="opt.value"
              class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-accent-subtle)]"
              style="color: var(--kv-text-primary);"
              @click="setHas(opt.value)"
            >
              <svg v-if="opt.value === 'link'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--kv-text-muted);"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
              {{ opt.label }}
            </button>
          </template>
        </div>
      </div>

      <!-- Uygulanmış filtre chip'leri -->
      <div v-if="hasAnyFilter" class="mt-2 flex flex-wrap gap-1.5">
        <span v-if="fromMember" class="kv-chip">{{ t('guildSearch.fromLabel') }}: {{ fromMember.username }}<button class="kv-chip__x" :title="t('common.clear')" @click="fromMember = null">✕</button></span>
        <span v-if="inChannel" class="kv-chip">{{ t('guildSearch.cat.in') }}: #{{ inChannel.name }}<button class="kv-chip__x" :title="t('common.clear')" @click="inChannel = null">✕</button></span>
        <span v-if="hasType" class="kv-chip">{{ t('guildSearch.cat.has') }}: {{ hasLabel }}<button class="kv-chip__x" :title="t('common.clear')" @click="hasType = null">✕</button></span>
        <span v-if="mentionsMember" class="kv-chip">{{ t('guildSearch.mentionsLabel') }}: {{ mentionsMember.username }}<button class="kv-chip__x" :title="t('common.clear')" @click="mentionsMember = null">✕</button></span>
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
                class="text-[13px] break-words whitespace-pre-wrap"
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

/* Arama çubuğuna bağlı açılır menü (kategori/değer listesi) */
.kv-search-dropdown {
  margin-top: 6px;
  max-height: 320px;
  overflow-y: auto;
  border-radius: var(--kv-radius-md);
  border: 1px solid var(--kv-border-subtle);
  background-color: var(--kv-bg-elevated);
  padding-bottom: 4px;
}

/* Çubuk içi aktif-kategori prefix token'ı ("şu kullanıcıdan:") */
.kv-token {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 4px 2px 8px;
  border-radius: var(--kv-radius-sm);
  font-size: 13px;
  white-space: nowrap;
  background-color: var(--kv-accent-subtle);
  color: var(--kv-accent-500);
}
.kv-token__x {
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  color: var(--kv-accent-500);
}
.kv-token__x:hover {
  color: var(--kv-text-primary);
}

/* Uygulanmış filtre chip'i */
.kv-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 2px 6px 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  background-color: var(--kv-accent-subtle);
  color: var(--kv-accent-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kv-chip__x {
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  color: var(--kv-accent-500);
  flex-shrink: 0;
}
.kv-chip__x:hover {
  color: var(--kv-text-primary);
}
</style>
