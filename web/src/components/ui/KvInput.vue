<script setup lang="ts">
defineProps<{
  label?: string
  error?: string
  type?: string
  placeholder?: string
  required?: boolean
}>()

const model = defineModel<string>()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" class="text-[11px] font-semibold uppercase tracking-wide text-[var(--kv-text-secondary)]">
      {{ label }}<span v-if="required" class="ml-0.5 text-[var(--kv-danger)]">*</span>
    </label>
    <input
      v-model="model"
      :type="type ?? 'text'"
      :placeholder="placeholder"
      :class="[
        'w-full px-3 py-2 text-[14px] bg-[var(--kv-bg-elevated)] text-[var(--kv-text-primary)]',
        'rounded-[var(--kv-radius-md)] border outline-none transition-colors',
        'placeholder:text-[var(--kv-text-muted)]',
        error
          ? 'border-[var(--kv-danger)] focus:border-[var(--kv-danger)]'
          : 'border-[var(--kv-border-strong)] focus:border-[var(--kv-accent-500)]',
      ]"
    />
    <span v-if="error" class="text-[12px] text-[var(--kv-danger)]">{{ error }}</span>
  </div>
</template>
