<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGuildsStore } from '@/stores/guilds'
import NotificationBell from '@/components/shared/NotificationBell.vue'
import GuildSearchPopover from '@/components/shared/GuildSearchPopover.vue'

const { t } = useI18n()
const guildsStore = useGuildsStore()
const showSearch = ref(false)
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

    <!-- Sunucu-geneli arama -->
    <div class="relative mr-2">
      <button
        class="w-9 h-9 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
        :class="showSearch ? 'bg-[var(--kv-accent-subtle)]' : ''"
        :style="showSearch ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
        :title="t('guildSearch.title')"
        @click.stop="showSearch = !showSearch"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </button>
      <GuildSearchPopover
        v-if="guildsStore.activeGuildId"
        :guild-id="guildsStore.activeGuildId"
        :open="showSearch"
        @close="showSearch = false"
      />
    </div>

    <!-- Bildirim çanı -->
    <div class="mr-4">
      <NotificationBell />
    </div>
  </div>
</template>
