<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useChannelsStore } from '@/stores/channels'
import { useGuildSearchPanel } from '@/composables/useGuildSearchPanel'
import NotificationBell from '@/components/shared/NotificationBell.vue'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const channelsStore = useChannelsStore()
const { isOpen: searchOpen, toggle: toggleSearch } = useGuildSearchPanel()

const isVoice = computed(() => channelsStore.activeChannel()?.type === 'GUILD_VOICE')
const channelName = computed(() => channelsStore.activeChannel()?.name ?? '')
const guildName = computed(() => guildsStore.activeGuild()?.name ?? '')
</script>

<template>
  <div
    class="shrink-0 flex items-center px-4 gap-3"
    style="height: var(--kv-header-height); background-color: var(--kv-bg-content);"
  >
    <!-- SOL: kanal-tür ikonu + kanal adı + ortam adı (bağlam) -->
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <!-- Ses kanalı — hoparlör ikonu -->
      <svg
        v-if="isVoice"
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="shrink-0" style="color: var(--kv-text-muted);"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
      <!-- Metin kanalı — # -->
      <span
        v-else
        class="shrink-0 text-[16px] font-semibold leading-none"
        style="color: var(--kv-text-muted);"
      >#</span>

      <!-- Kanal adı (öne çıkan) -->
      <span
        class="text-[16px] font-semibold truncate"
        style="color: var(--kv-text-primary);"
      >{{ channelName }}</span>

      <!-- Ortam adı — bağlam, soluk -->
      <span
        v-if="guildName"
        class="text-[12px] truncate hidden sm:block"
        style="color: var(--kv-text-muted);"
      >· {{ guildName }}</span>
    </div>

    <!-- SAĞ: kompakt arama + bildirim çanı -->
    <div class="flex items-center gap-1 shrink-0">
      <!-- Sunucu-geneli arama → sağ sidebar panelini aç/kapa -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
        :class="searchOpen ? 'bg-[var(--kv-accent-subtle)]' : ''"
        :style="searchOpen ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
        :title="t('guildSearch.title')"
        @click="toggleSearch"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </button>

      <!-- Bildirim çanı -->
      <NotificationBell />
    </div>
  </div>
</template>
