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
        class="w-full max-w-md rounded-[var(--kv-radius-lg)] bg-[var(--kv-bg-sidebar)] border border-[var(--kv-border-subtle)] p-6"
        role="dialog"
        aria-modal="true"
      >
        <div v-if="title" class="mb-5">
          <h2 class="text-[22px] font-semibold text-[var(--kv-text-primary)]">{{ title }}</h2>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
