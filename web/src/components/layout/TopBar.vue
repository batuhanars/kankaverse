<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChannelsStore } from '@/stores/channels'
import PinsPopover from '@/components/shared/PinsPopover.vue'

defineProps<{ showMemberPanel: boolean }>()
const emit = defineEmits<{ toggleMembers: [] }>()

const { t } = useI18n()
const channelsStore = useChannelsStore()

const showPins = ref(false)

function togglePins(e: MouseEvent) {
  e.stopPropagation()
  showPins.value = !showPins.value
}
</script>

<template>
  <header
    class="flex items-center px-4 gap-3 shrink-0 border-b"
    style="height: var(--kv-header-height); background-color: var(--kv-bg-content); border-color: var(--kv-border-subtle);"
  >
    <span class="text-[var(--kv-text-muted)] font-medium">#</span>
    <span class="text-[15px] font-semibold text-[var(--kv-text-primary)]">
      {{ channelsStore.activeChannel()?.name ?? '' }}
    </span>

    <div class="ml-auto flex items-center gap-1">
      <!-- Sabitlenen Mesajlar butonu -->
      <div class="relative">
        <button
          class="w-8 h-8 flex items-center justify-center text-[16px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
          :class="showPins ? 'bg-[var(--kv-accent-subtle)]' : ''"
          :style="showPins ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
          :title="t('message.pinnedMessages')"
          @mouseenter="!showPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)')"
          @mouseleave="!showPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)')"
          @click="togglePins"
        >
          📌
        </button>
        <PinsPopover
          v-if="channelsStore.activeChannel()"
          :channel-id="channelsStore.activeChannel()!.id"
          :open="showPins"
          @close="showPins = false"
        />
      </div>

      <button
        :class="[
          'px-3 py-1 text-[13px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer',
          showMemberPanel
            ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-accent-500)]'
            : 'text-[var(--kv-text-secondary)] hover:text-[var(--kv-text-body)]',
        ]"
        @click="emit('toggleMembers')"
      >
        {{ t('member.panel') }}
      </button>

    </div>
  </header>
</template>
