<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'

defineProps<{ activeChannelId: string | null }>()
const emit = defineEmits<{ select: [channelId: string] }>()

const { t } = useI18n()
const dmStore = useDmStore()

function truncate(text: string, max = 40) {
  return text.length > max ? text.slice(0, max) + '…' : text
}
</script>

<template>
  <div class="flex-1 overflow-y-auto px-2 pt-3">
    <p class="px-2 mb-1 text-[11px] font-semibold uppercase tracking-wider" style="color: var(--kv-text-muted);">
      {{ t('dm.sectionHeader') }}
    </p>

    <p v-if="!dmStore.channels.length" class="px-2 py-3 text-[13px]" style="color: var(--kv-text-muted);">
      {{ t('dm.noDms') }}
    </p>

    <button
      v-for="ch in dmStore.channels"
      :key="ch.id"
      class="w-full flex items-center gap-3 px-2 py-2 rounded-[var(--kv-radius-md)] transition-colors cursor-pointer text-left"
      :style="activeChannelId === ch.id
        ? 'background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);'
        : 'color: var(--kv-text-secondary);'"
      @click="emit('select', ch.id)"
    >
      <div class="relative shrink-0">
        <div class="w-8 h-8 rounded-full overflow-hidden" style="background-color: var(--kv-bg-content);">
          <img
            v-if="ch.otherUser.avatarUrl"
            :src="ch.otherUser.avatarUrl"
            :alt="ch.otherUser.username"
            class="w-full h-full object-cover"
          />
          <span v-else class="w-full h-full flex items-center justify-center text-[12px] font-semibold" style="color: var(--kv-text-secondary);">
            {{ ch.otherUser.username[0].toUpperCase() }}
          </span>
        </div>
        <span
          v-if="ch.unread"
          class="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
          style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-sidebar);"
        />
      </div>

      <div class="flex-1 min-w-0">
        <p
          class="text-[13px] font-medium truncate"
          :style="ch.unread ? 'color: var(--kv-text-primary); font-weight: 600;' : ''"
        >
          {{ ch.otherUser.username }}
        </p>
        <p v-if="ch.lastMessage" class="text-[12px] truncate" style="color: var(--kv-text-muted);">
          {{ truncate(ch.lastMessage.content) }}
        </p>
      </div>
    </button>
  </div>
</template>
