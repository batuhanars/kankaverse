<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'
import DmList from './DmList.vue'

defineProps<{ activeView: 'friends' | 'dm'; activeDmChannelId: string | null }>()
const emit = defineEmits<{ selectFriends: []; selectDm: [channelId: string] }>()

const { t } = useI18n()
const dmStore = useDmStore()

onMounted(() => dmStore.fetchChannels())
</script>

<template>
  <aside
    class="w-[280px] flex flex-col shrink-0 border-r"
    style="background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
  >
    <!-- Arkadaşlar nav düğmesi -->
    <div class="p-3 border-b shrink-0" style="border-color: var(--kv-border-subtle);">
      <button
        class="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] font-medium transition-colors cursor-pointer"
        :style="activeView === 'friends'
          ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);'
          : 'color: var(--kv-text-secondary);'"
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

    <!-- DM listesi -->
    <DmList
      :active-channel-id="activeDmChannelId"
      @select="(id) => emit('selectDm', id)"
    />
  </aside>
</template>
