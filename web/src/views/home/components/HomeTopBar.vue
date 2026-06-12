<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { onClickOutside } from '@vueuse/core'
import GlobalSearch from '@/components/shared/GlobalSearch.vue'

const emit = defineEmits<{ selectDm: [channelId: string] }>()
const { t } = useI18n()

const showSearch = ref(false)
const showNotifications = ref(false)
const bellRef = ref<HTMLElement | null>(null)

onClickOutside(bellRef, () => { showNotifications.value = false })

function onSelectDm(channelId: string) {
  showSearch.value = false
  emit('selectDm', channelId)
}
</script>

<template>
  <div class="h-16 shrink-0 flex items-center">
    <!-- Rail spacer (aligns search with sidebar area) -->

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

    <!-- Notification bell -->
    <div ref="bellRef" class="relative mr-4 shrink-0">
      <button
        class="w-9 h-9 rounded-[var(--kv-radius-md)] flex items-center justify-center cursor-pointer transition-colors"
        :style="showNotifications
          ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);'
          : 'color: var(--kv-text-muted);'"
        :class="!showNotifications ? 'hover:bg-[var(--kv-bg-elevated)] hover:text-[var(--kv-text-primary)]' : ''"
        @click="showNotifications = !showNotifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </button>

      <!-- Stub notification panel -->
      <div
        v-if="showNotifications"
        class="absolute top-full right-0 mt-2 w-[300px] rounded-[var(--kv-radius-lg)]"
        style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 50;"
      >
        <div class="px-4 py-3 border-b" style="border-color: var(--kv-border-subtle);">
          <p class="text-[14px] font-bold" style="color: var(--kv-text-primary);">
            {{ t('notifications.title') }}
          </p>
        </div>
        <div class="py-10 text-center">
          <p class="text-[13px]" style="color: var(--kv-text-muted);">{{ t('notifications.empty') }}</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Global search modal -->
  <GlobalSearch
    v-if="showSearch"
    @close="showSearch = false"
    @select-dm="onSelectDm"
  />
</template>
