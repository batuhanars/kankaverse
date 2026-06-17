<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import { useGuildSearchPanel } from '@/composables/useGuildSearchPanel'
import NotificationBell from '@/components/shared/NotificationBell.vue'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const { isOpen: searchOpen, toggle: toggleSearch } = useGuildSearchPanel()
</script>

<template>
  <div class="h-20 shrink-0 flex items-center">
    <!-- Sunucu adı — flex-1, ortada -->
    <div class="flex-1 flex items-center justify-center px-6">
      <span
        class="text-[16px] font-semibold truncate"
        style="color: var(--kv-text-primary);"
      >{{ guildsStore.activeGuild()?.name ?? '' }}</span>
    </div>

    <!-- Sunucu-geneli arama → sağ sidebar panelini aç/kapa -->
    <div class="mr-2">
      <button
        class="w-9 h-9 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
        :class="searchOpen ? 'bg-[var(--kv-accent-subtle)]' : ''"
        :style="searchOpen ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
        :title="t('guildSearch.title')"
        @click="toggleSearch"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </button>
    </div>

    <!-- Bildirim çanı -->
    <div class="mr-4">
      <NotificationBell />
    </div>
  </div>
</template>
