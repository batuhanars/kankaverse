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
    <!-- Sol boşluk eşiti — bildirim çanı ile simetri -->
    <div class="w-14 shrink-0" />

    <!-- Arama butonu — yatay ortalanmış, kompakt buton görünümü -->
    <div class="flex-1 flex justify-center">
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

    <!-- Bildirim çanı -->
    <div class="mr-4 shrink-0">
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
