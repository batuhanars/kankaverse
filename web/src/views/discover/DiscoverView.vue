<script setup lang="ts">
/**
 * DiscoverView — Keşfet (Sunucu Keşfi). Arama + etiket filtre + renk-afişli sunucu kartları + Katıl.
 * adultsOnly süzme + join gate'leri BACKEND'de (frontend ekstra süzme yapmaz). Sözleşme C6 §5.
 */
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useAuthStore } from '@/stores/auth'
import { discoveryApi } from '@/api/discovery'
import DiscoverGuildCard from './components/DiscoverGuildCard.vue'
import type { DiscoveryGuildDto, DiscoveryTagDto } from '@/types'

const { t } = useI18n()
const router = useRouter()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const authStore = useAuthStore()

const search = ref('')
const activeTag = ref<string | null>(null)
const tags = ref<DiscoveryTagDto[]>([])
const items = ref<DiscoveryGuildDto[]>([])
const nextCursor = ref<string | null>(null)

const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref('')
const joiningId = ref<string | null>(null)

async function loadTags() {
  try {
    const res = await discoveryApi.popularTags()
    tags.value = res.data
  } catch {
    // etiketler kritik değil — sessizce geç
  }
}

/** Listeyi sıfırdan yükle (arama/etiket değişiminde). */
async function loadGuilds() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await discoveryApi.listGuilds({
      search: search.value.trim() || undefined,
      tag: activeTag.value ?? undefined,
    })
    items.value = res.data.items
    nextCursor.value = res.data.nextCursor
  } catch {
    loadError.value = t('discover.loadError')
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const res = await discoveryApi.listGuilds({
      search: search.value.trim() || undefined,
      tag: activeTag.value ?? undefined,
      cursor: nextCursor.value,
    })
    items.value.push(...res.data.items)
    nextCursor.value = res.data.nextCursor
  } catch {
    // sayfalama hatası — sessizce geç, buton kalır
  } finally {
    loadingMore.value = false
  }
}

const debouncedSearch = useDebounceFn(() => loadGuilds(), 350)

function onSearchInput() {
  debouncedSearch()
}

function toggleTag(tag: string) {
  activeTag.value = activeTag.value === tag ? null : tag
  loadGuilds()
}

/** Bir ortama git (kanalları yükle, ilk kanala yönlendir) — join sonrası / zaten üye. */
async function goToGuild(guildId: string) {
  if (!channelsStore.channelsForGuild(guildId).length) {
    await channelsStore.fetchChannelsAndCategories(guildId, authStore.user?.id)
  }
  const channels = channelsStore.channelsForGuild(guildId)
  if (channels.length > 0) {
    router.push({ name: 'channel', params: { guildId, channelId: channels[0].id } })
  } else {
    guildsStore.setActiveGuild(guildId)
    channelsStore.setActiveChannel(null)
    router.push({ name: 'app' })
  }
}

async function joinGuild(guild: DiscoveryGuildDto) {
  joiningId.value = guild.id
  loadError.value = ''
  try {
    await guildsStore.joinDiscovery(guild.id)
    await goToGuild(guild.id)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    // Zaten üye → hata değil; o ortama git.
    if (err.response?.data?.error === 'ALREADY_MEMBER') {
      await goToGuild(guild.id)
      return
    }
    loadError.value = err.response?.data?.message ?? t('discover.joinError')
  } finally {
    joiningId.value = null
  }
}

onMounted(() => {
  loadTags()
  loadGuilds()
})
</script>

<template>
  <div class="flex flex-1 min-w-0 h-full overflow-hidden">
    <!-- Keşfet nav sidebar — ortam ızgarası tutarlılığı (rail | sidebar | içerik) -->
    <aside
      class="flex flex-col shrink-0 rounded-[var(--kv-radius-lg)] overflow-hidden mt-4 ml-4"
      style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
    >
      <div class="flex items-center px-4 shrink-0 border-b" style="height: 64px; border-color: var(--kv-border-subtle);">
        <h2 class="text-[18px] font-bold" style="color: var(--kv-text-primary);">{{ t('discover.navTitle') }}</h2>
      </div>
      <nav class="flex-1 overflow-y-auto p-2">
        <!-- Tek gerçek bölüm: Sunucular (aktif). Uygulamalar/Görevler henüz yok → eklenmez. -->
        <span
          class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--kv-radius-md)] text-[14px] font-semibold"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="7" rx="1.5" />
            <rect x="3" y="13" width="18" height="7" rx="1.5" />
          </svg>
          {{ t('discover.navServers') }}
        </span>
      </nav>
    </aside>

    <!-- İçerik -->
    <div class="flex flex-col flex-1 min-w-0 h-full overflow-hidden" style="background-color: var(--kv-bg-content);">
      <div class="flex-1 overflow-y-auto">
      <div class="mx-auto w-full px-8 py-8" style="max-width: 1100px;">
        <!-- Başlık -->
        <header class="mb-6">
          <h1 class="text-[22px] font-bold" style="color: var(--kv-text-primary);">
            {{ t('discover.title') }}
          </h1>
          <p class="text-[14px] mt-1" style="color: var(--kv-text-muted);">
            {{ t('discover.subtitle') }}
          </p>
        </header>

        <!-- Arama -->
        <div class="relative mb-4">
          <span class="absolute left-3 top-1/2 -translate-y-1/2" style="color: var(--kv-text-muted);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            v-model="search"
            type="text"
            :placeholder="t('discover.search')"
            class="w-full pl-10 pr-3 py-2.5 text-[14px] rounded-[var(--kv-radius-md)] border outline-none transition-colors"
            style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border-color: var(--kv-border-strong);"
            @input="onSearchInput"
          />
        </div>

        <!-- Etiket çipleri -->
        <div v-if="tags.length" class="flex flex-wrap gap-2 mb-8">
          <button
            v-for="tg in tags"
            :key="tg.tag"
            type="button"
            class="text-[13px] font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer"
            :style="activeTag === tg.tag
              ? 'background-color: var(--kv-accent-500); color: #ffffff; border-color: var(--kv-accent-500);'
              : 'background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary); border-color: var(--kv-border-subtle);'"
            @click="toggleTag(tg.tag)"
          >
            {{ tg.tag }}
            <span class="ml-1 opacity-70">{{ tg.count }}</span>
          </button>
        </div>

        <!-- Hata -->
        <p v-if="loadError" class="text-[13px] mb-4" style="color: var(--kv-danger);">{{ loadError }}</p>

        <!-- Yükleniyor -->
        <p v-if="loading" class="text-[14px]" style="color: var(--kv-text-muted);">
          {{ t('common.loading') }}
        </p>

        <!-- Boş durum -->
        <div
          v-else-if="items.length === 0"
          class="flex flex-col items-center justify-center text-center py-16"
        >
          <p class="text-[15px] font-medium" style="color: var(--kv-text-secondary);">
            {{ t('discover.empty') }}
          </p>
          <p class="text-[13px] mt-1" style="color: var(--kv-text-muted);">
            {{ t('discover.emptyHint') }}
          </p>
        </div>

        <!-- Kart grid -->
        <template v-else>
          <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));">
            <DiscoverGuildCard
              v-for="g in items"
              :key="g.id"
              :guild="g"
              :joining="joiningId === g.id"
              @join="joinGuild(g)"
            />
          </div>

          <!-- Daha fazla -->
          <div v-if="nextCursor" class="flex justify-center mt-8">
            <button
              type="button"
              class="text-[14px] font-medium px-5 py-2 rounded-[var(--kv-radius-md)] border transition-colors cursor-pointer"
              style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary); border-color: var(--kv-border-subtle);"
              :disabled="loadingMore"
              @click="loadMore"
            >
              {{ loadingMore ? t('common.loading') : t('discover.loadMore') }}
            </button>
          </div>
        </template>
        </div>
      </div>
    </div>
  </div>
</template>
