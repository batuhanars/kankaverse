<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import DmList from './DmList.vue'
import StartChatModal from './StartChatModal.vue'

defineProps<{ activeView: 'friends' | 'message-requests' | 'dm'; activeDmChannelId: string | null }>()
const emit = defineEmits<{
  selectFriends: []
  selectMessageRequests: []
  selectDm: [channelId: string]
}>()

const { t } = useI18n()
const showStartChat = ref(false)

function onChatCreated(channelId: string) {
  showStartChat.value = false
  emit('selectDm', channelId)
}
</script>

<template>
  <aside
    class="flex flex-col shrink-0 rounded-[var(--kv-radius-lg)] overflow-hidden mt-4"
    style="width: var(--kv-panel-width); background-color: var(--kv-bg-sidebar);"
  >
    <!-- Nav öğeleri -->
    <div class="px-2 pt-4 pb-2 shrink-0 space-y-1 border-b" style="border-color: var(--kv-border-subtle);">
      <!-- Arkadaşlar -->
      <button
        class="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--kv-radius-md)] text-[14px] font-medium transition-colors cursor-pointer hover:bg-[var(--kv-accent-subtle)]"
        :class="activeView === 'friends'
          ? 'text-[var(--kv-text-primary)]'
          : 'text-[var(--kv-text-secondary)] hover:text-[var(--kv-text-primary)]'"
        :style="activeView === 'friends' ? 'background-color: var(--kv-accent-subtle);' : ''"
        @click="emit('selectFriends')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        {{ t('friends.title') }}
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
      @select="(id) => emit('selectDm', id)"
    />
  </aside>

  <!-- Sohbet başlat modal (1-1 DM veya grup) -->
  <StartChatModal
    v-if="showStartChat"
    @close="showStartChat = false"
    @created="onChatCreated"
  />
</template>
