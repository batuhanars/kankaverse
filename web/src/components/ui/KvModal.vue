<script setup lang="ts">
defineProps<{ title?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-[var(--kv-bg-overlay)]"
      @click.self="emit('close')"
    >
      <div
        class="relative w-full max-w-md max-h-[85vh] flex flex-col rounded-[var(--kv-radius-lg)] bg-[var(--kv-bg-sidebar)] border border-[var(--kv-border-subtle)] p-6"
        role="dialog"
        aria-modal="true"
      >
        <!-- Kapat (X) — tüm modallarda üst-sağ -->
        <button
          type="button"
          class="absolute top-4 right-4 z-10 flex items-center justify-center rounded-full transition-colors cursor-pointer hover:bg-[var(--kv-bg-elevated)]"
          style="width: 28px; height: 28px; color: var(--kv-text-muted);"
          aria-label="Kapat"
          @click="emit('close')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div v-if="title" class="mb-5 shrink-0 pr-8">
          <h2 class="text-[22px] font-semibold text-[var(--kv-text-primary)]">{{ title }}</h2>
        </div>
        <div class="overflow-y-auto flex-1 min-h-0">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
