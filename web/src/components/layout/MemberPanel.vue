<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <aside
    class="flex flex-col shrink-0 mb-4 mr-4 rounded-[var(--kv-radius-lg)] overflow-hidden"
    style="width: 248px; background-color: var(--kv-bg-sidebar);"
  >
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b text-[13px] font-semibold uppercase tracking-widest"
      style="border-color: var(--kv-border-subtle); color: var(--kv-text-muted);"
    >
      {{ t('member.panel') }}
    </div>
    <div class="flex-1 flex items-center justify-center">
      <p class="text-[13px] text-center px-4" style="color: var(--kv-text-muted);">
        {{ t('member.comingSoon') }}
      </p>
    </div>
  </aside>
</template>
