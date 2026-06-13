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
