<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<!-- Sprint 1: statik stub — üye listesi Sprint 6 presence ile -->
<template>
  <aside
    class="flex flex-col shrink-0 border-l"
    style="width: 248px; background-color: var(--kv-bg-sidebar); border-color: var(--kv-border-subtle);"
  >
    <div
      class="h-16 flex items-center px-4 border-b text-[13px] font-semibold uppercase tracking-widest text-[var(--kv-text-muted)]"
      style="border-color: var(--kv-border-subtle);"
    >
      {{ t('member.panel') }}
    </div>
    <div class="flex-1 flex items-center justify-center">
      <p class="text-[13px] text-[var(--kv-text-muted)] text-center px-4">
        Üye listesi çok yakında.
      </p>
    </div>
  </aside>
</template>
