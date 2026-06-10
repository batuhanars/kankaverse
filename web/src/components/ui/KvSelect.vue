<script setup lang="ts">
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from 'reka-ui'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

defineProps<{
  placeholder?: string
  disabled?: boolean
  label?: string
  error?: string
  options: SelectOption[]
}>()

const model = defineModel<string>()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      v-if="label"
      class="text-[11px] font-semibold uppercase tracking-wide"
      style="color: var(--kv-text-secondary);"
    >
      {{ label }}
    </label>
    <SelectRoot v-model="model" :disabled="disabled">
      <SelectTrigger
        :class="cn(
          'flex w-full items-center justify-between px-3 py-2 text-[14px] outline-none transition-colors cursor-pointer',
          'rounded-[var(--kv-radius-md)] border',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error
            ? 'border-[var(--kv-danger)]'
            : 'border-[var(--kv-border-strong)] focus:border-[var(--kv-accent-500)]',
        )"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); min-height: 38px;"
      >
        <SelectValue
          :placeholder="placeholder"
          :style="!model ? 'color: var(--kv-text-muted);' : ''"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="color: var(--kv-text-muted); flex-shrink: 0;"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          :side-offset="4"
          position="popper"
          class="z-50 overflow-hidden rounded-[var(--kv-radius-md)] border select-content"
          style="
            background-color: var(--kv-bg-sidebar);
            border-color: var(--kv-border-strong);
            min-width: var(--reka-select-trigger-width);
            max-height: 280px;
          "
        >
          <SelectScrollUpButton
            class="flex items-center justify-center py-1 cursor-default"
            style="color: var(--kv-text-muted);"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </SelectScrollUpButton>

          <SelectViewport class="p-1">
            <SelectItem
              v-for="opt in options"
              :key="opt.value"
              :value="opt.value"
              :disabled="opt.disabled"
              class="select-item relative flex items-center px-3 py-1.5 text-[14px] rounded-[var(--kv-radius-sm)] cursor-pointer outline-none select-none transition-colors"
              style="color: var(--kv-text-body);"
            >
              <SelectItemIndicator class="absolute left-1 flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </SelectItemIndicator>
              <SelectItemText class="pl-4">{{ opt.label }}</SelectItemText>
            </SelectItem>
          </SelectViewport>

          <SelectScrollDownButton
            class="flex items-center justify-center py-1 cursor-default"
            style="color: var(--kv-text-muted);"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </SelectScrollDownButton>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
    <span v-if="error" class="text-[12px]" style="color: var(--kv-danger);">{{ error }}</span>
  </div>
</template>

<style scoped>
.select-item[data-highlighted] {
  background-color: var(--kv-accent-subtle);
  color: var(--kv-text-primary);
}
.select-item[data-disabled] {
  opacity: 0.4;
  pointer-events: none;
}
.select-content {
  overflow-y: auto;
}
</style>
