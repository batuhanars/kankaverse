<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  label?: string
  error?: string
  type?: string
  placeholder?: string
  required?: boolean
}>()

const model = defineModel<string>()

const showPassword = ref(false)
const isPassword = computed(() => props.type === 'password')
const resolvedType = computed(() => {
  if (isPassword.value) return showPassword.value ? 'text' : 'password'
  return props.type ?? 'text'
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" class="text-[11px] font-semibold uppercase tracking-wide text-[var(--kv-text-secondary)]">
      {{ label }}<span v-if="required" class="ml-0.5 text-[var(--kv-danger)]">*</span>
    </label>
    <div class="relative">
      <input
        v-model="model"
        :type="resolvedType"
        :placeholder="placeholder"
        :class="[
          'w-full px-3 py-2 text-[14px] bg-[var(--kv-bg-elevated)] text-[var(--kv-text-primary)]',
          'rounded-[var(--kv-radius-md)] border outline-none transition-colors',
          'placeholder:text-[var(--kv-text-muted)]',
          isPassword ? 'pr-9' : '',
          error
            ? 'border-[var(--kv-danger)] focus:border-[var(--kv-danger)]'
            : 'border-[var(--kv-border-strong)] focus:border-[var(--kv-accent-500)]',
        ]"
      />
      <button
        v-if="isPassword"
        type="button"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
        style="color: var(--kv-text-muted);"
        :aria-label="showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'"
        @click="showPassword = !showPassword"
      >
        <!-- Göz açık -->
        <svg v-if="!showPassword" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <!-- Göz kapalı -->
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
          <line x1="2" y1="2" x2="22" y2="22"/>
        </svg>
      </button>
    </div>
    <span v-if="error" class="text-[12px] text-[var(--kv-danger)]">{{ error }}</span>
  </div>
</template>

<style scoped>
/* Native sayı spinner'ını gizle — tarayıcının gri yukarı/aşağı okları tasarım diline yabancı,
   yuvarlak köşeyle çakışıp bozuk görünüyor. Değer elle yazılır (boş = sınırsız). */
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
