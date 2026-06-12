<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useChannelsStore } from '@/stores/channels'

defineProps<{ showMemberPanel: boolean }>()
const emit = defineEmits<{ toggleMembers: [] }>()

const { t } = useI18n()
const channelsStore = useChannelsStore()
</script>

<template>
  <header
    class="h-12 flex items-center px-4 gap-3 shrink-0 border-b"
    style="background-color: var(--kv-bg-content); border-color: var(--kv-border-subtle);"
  >
    <span class="text-[var(--kv-text-muted)] font-medium">#</span>
    <span class="text-[15px] font-semibold text-[var(--kv-text-primary)]">
      {{ channelsStore.activeChannel()?.name ?? '' }}
    </span>

    <div class="ml-auto flex items-center gap-1">
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
