<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useChannelsStore } from '@/stores/channels'

defineProps<{ showMemberPanel: boolean }>()
const emit = defineEmits<{ toggleMembers: []; logout: [] }>()

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
      <!-- Güvenlik Ayarları -->
      <RouterLink
        :to="{ name: 'settings-security' }"
        class="w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] transition-colors"
        style="color: var(--kv-text-secondary);"
        :title="t('settings.security')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </RouterLink>
      <button
        class="px-3 py-1 text-[13px] text-[var(--kv-text-secondary)] hover:text-[var(--kv-danger)] transition-colors cursor-pointer rounded-[var(--kv-radius-sm)]"
        @click="emit('logout')"
      >
        {{ t('auth.logout') }}
      </button>
    </div>
  </header>
</template>
