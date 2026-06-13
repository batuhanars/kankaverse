<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GlobalSearch from '@/components/shared/GlobalSearch.vue'
import NotificationBell from '@/components/shared/NotificationBell.vue'

const emit = defineEmits<{ selectDm: [channelId: string] }>()
const { t } = useI18n()

const showSearch = ref(false)

function onSelectDm(channelId: string) {
  showSearch.value = false
  emit('selectDm', channelId)
}
</script>

<template>
  <div class="h-20 shrink-0 flex items-center">
    <!-- Search pill — flex-1, centered -->
    <div class="flex-1 flex items-center px-6">
      <button
        class="flex items-center gap-2.5 h-9 px-4 rounded-full text-[13px] cursor-pointer w-full transition-all"
        style="max-width: 440px; background-color: var(--kv-bg-elevated); color: var(--kv-text-muted); border: 1px solid var(--kv-border-subtle);"
        @mouseenter="($event.currentTarget as HTMLElement).style.borderColor = 'var(--kv-border-strong)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.borderColor = 'var(--kv-border-subtle)'"
        @click="showSearch = true"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="flex-1 text-left truncate">{{ t('search.topbarPlaceholder') }}</span>
        <kbd
          class="hidden sm:block text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0"
          style="background-color: var(--kv-bg-content); color: var(--kv-text-muted);"
        >Ctrl K</kbd>
      </button>
    </div>

    <!-- Bildirim çanı -->
    <div class="mr-4">
      <NotificationBell />
    </div>
  </div>

  <!-- Global search modal -->
  <GlobalSearch
    v-if="showSearch"
    @close="showSearch = false"
    @select-dm="onSelectDm"
  />
</template>
