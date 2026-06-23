<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppShellNav } from '@/composables/useAppShellNav'
import { isMobile } from '@/composables/useResponsive'
import GlobalSearch from '@/components/shared/GlobalSearch.vue'
import NotificationBell from '@/components/shared/NotificationBell.vue'

const emit = defineEmits<{ selectDm: [channelId: string] }>()
const { t } = useI18n()
const { toggleLeftDrawer } = useAppShellNav()

const showSearch = ref(false)

function onSelectDm(channelId: string) {
  showSearch.value = false
  emit('selectDm', channelId)
}
</script>

<template>
  <div class="h-14 shrink-0 flex items-center px-4">
    <!-- Hamburger: yalnız <768 -->
    <button
      v-if="isMobile"
      class="w-9 h-9 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer shrink-0 mr-2"
      style="color: var(--kv-text-muted);"
      :aria-label="t('nav.openMenu')"
      @click="toggleLeftDrawer"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>

    <!-- Sol eşit alan — sağ (bildirim çanı) ile aynı flex payı → buton gerçek ortada -->
    <div class="flex-1" />

    <!-- Arama butonu — yatay ortalanmış, kompakt buton görünümü -->
    <div class="shrink-0">
      <button
        class="flex items-center gap-2 h-8 px-3 rounded-[var(--kv-radius-md)] text-[13px] cursor-pointer transition-colors shrink-0"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted); border: 1px solid var(--kv-border-subtle);"
        @mouseenter="(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--kv-border-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--kv-text-secondary)' }"
        @mouseleave="(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--kv-border-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)' }"
        @click="showSearch = true"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="truncate">{{ t('search.topbarPlaceholder') }}</span>
        <kbd
          class="hidden sm:block text-[11px] font-mono px-1.5 py-0.5 rounded shrink-0 ml-1"
          style="background-color: var(--kv-bg-content); color: var(--kv-text-muted);"
        >Ctrl K</kbd>
      </button>
    </div>

    <!-- Sağ alan: çan sağ uçta + panel kadar rezerv (basis) → arama dashboard ortasına hizalanır.
         Kankalar paneli (var(--kv-panel-width)) + gap-4 + mr-4 = panel-width + 2rem. -->
    <div class="flex justify-end items-center" style="flex: 1 1 calc(var(--kv-panel-width) + 2rem);">
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
