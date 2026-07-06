<script setup lang="ts">
/**
 * HomeSidebar — home/dm ekranlarının sol sidebar'ı (named router-view: sidebar).
 * Aktif DM'i route'tan okur, seçimde kendi navigasyonunu yapar (parent prop/emit yok).
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useDmStore } from '@/stores/dm'
import DmList from './DmList.vue'
import StartChatModal from './StartChatModal.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const dmStore = useDmStore()
const showStartChat = ref(false)

// Aktif DM = /dm/:channelId route'undaki param
const activeDmChannelId = computed(() => (route.name === 'dm' ? (route.params.channelId as string) : null))

// C9 — Mesaj İstekleri (arkadaş-olmayan DM onay süzgeci). Kanka isteğinden AYRIDIR.
const requestCount = computed(() => dmStore.requestCount)
const requestsActive = computed(() => route.name === 'dm-requests')

function selectDm(channelId: string) {
  router.push({ name: 'dm', params: { channelId } })
}

function openRequests() {
  router.push({ name: 'dm-requests' })
}

function onChatCreated(channelId: string) {
  showStartChat.value = false
  selectDm(channelId)
}
</script>

<template>
  <aside
    class="flex flex-col shrink-0 overflow-hidden rounded-none mt-0 md:rounded-[var(--kv-radius-lg)] md:mt-4"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
  >
    <!-- C9 — Mesaj İstekleri satırı (DM başlığının ÜSTÜNDE; kanka isteğinden ayrı) -->
    <div class="px-2 pt-3 shrink-0">
      <button
        class="w-full flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-sm)] text-[14px] font-medium text-left cursor-pointer transition-colors"
        :class="requestsActive
          ? 'bg-[var(--kv-bg-elevated)] text-[var(--kv-accent-400)]'
          : 'text-[var(--kv-text-secondary)] hover:bg-[var(--kv-bg-elevated)] hover:text-[var(--kv-text-primary)]'"
        @click="openRequests"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span class="flex-1 min-w-0 truncate">{{ t('messageRequests.title') }}</span>
        <span
          v-if="requestCount > 0"
          class="shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[11px] font-bold text-white"
          style="background-color: var(--kv-accent-500);"
        >{{ requestCount }}</span>
      </button>
    </div>

    <!-- DM bölüm başlığı + Sohbet Başlat -->
    <div class="flex items-center justify-between px-4 pt-4 pb-1 shrink-0">
      <p
        class="text-[11px] font-semibold uppercase tracking-widest"
        style="color: var(--kv-text-muted);"
      >{{ t('sidebar.dmSection') }}</p>
      <button
        class="flex items-center justify-center rounded-[var(--kv-radius-sm)] text-[18px] font-semibold leading-none cursor-pointer transition-colors"
        style="width: var(--kv-control); height: var(--kv-control); color: var(--kv-text-secondary); background-color: transparent;"
        :title="t('startChat.openChatButton')"
        @mouseenter="($event.target as HTMLElement).style.backgroundColor = 'var(--kv-accent-subtle)'; ($event.target as HTMLElement).style.color = 'var(--kv-accent-500)'"
        @mouseleave="($event.target as HTMLElement).style.backgroundColor = 'transparent'; ($event.target as HTMLElement).style.color = 'var(--kv-text-secondary)'"
        @click="showStartChat = true"
      >
        +
      </button>
    </div>

    <!-- DM listesi -->
    <DmList
      :active-channel-id="activeDmChannelId"
      @select="selectDm"
    />
  </aside>

  <!-- Sohbet başlat modal (1-1 DM veya grup) -->
  <StartChatModal
    v-if="showStartChat"
    @close="showStartChat = false"
    @created="onChatCreated"
  />
</template>
