<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button
    :type="type ?? 'button'"
    :disabled="disabled || loading"
    :class="[
      'inline-flex items-center justify-center font-medium transition-colors cursor-pointer select-none',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      size === 'sm'
        ? 'px-3 py-1.5 text-[13px] rounded-[var(--kv-radius-sm)]'
        : 'px-4 py-2 text-[14px] rounded-[var(--kv-radius-md)]',
      variant === 'danger'
        ? 'bg-[var(--kv-danger)] text-white hover:opacity-90'
        : variant === 'ghost'
          ? 'bg-transparent text-[var(--kv-text-secondary)] hover:bg-[var(--kv-bg-elevated)] hover:text-[var(--kv-text-primary)]'
          : 'bg-[var(--kv-accent-500)] text-white hover:bg-[var(--kv-accent-400)] active:bg-[var(--kv-accent-600)]',
    ]"
  >
    <span v-if="loading" class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
    <slot />
  </button>
</template>
