<script setup lang="ts">
/**
 * AiGrantUserPicker — aramalı açılır kullanıcı seçici (reka Combobox). Yalnız AiGrantFormModal kullanır.
 * Süzme kullanıcı adı + e-posta üzerinde, TR küçük harf. Liste Portal'da açılır; modal taşmasında kesilmez.
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxPortal,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  ComboboxItemIndicator,
} from 'reka-ui'
import { cn } from '@/lib/utils'

export interface PickerUser {
  id: string
  username: string
  email?: string
}

const props = defineProps<{
  users: PickerUser[]
  modelValue: string
  disabled?: boolean
  error?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()
const { t } = useI18n()

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLocaleLowerCase('tr')
  if (!q) return props.users
  return props.users.filter(
    (u) =>
      u.username.toLocaleLowerCase('tr').includes(q) ||
      (u.email ?? '').toLocaleLowerCase('tr').includes(q),
  )
})

function display(id: string): string {
  return props.users.find((u) => u.id === id)?.username ?? ''
}
function onSelect(id: unknown) {
  if (typeof id === 'string') emit('update:modelValue', id)
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
      {{ t('admin.aiAccess.form.user') }}
    </label>
    <ComboboxRoot
      v-model:search-term="search"
      :model-value="modelValue"
      :disabled="disabled"
      ignore-filter
      open-on-focus
      open-on-click
      @update:model-value="onSelect"
    >
      <ComboboxAnchor
        :class="cn(
          'flex w-full items-center rounded-[var(--kv-radius-md)] border transition-colors',
          error ? 'border-[var(--kv-danger)]' : 'border-[var(--kv-border-strong)] focus-within:border-[var(--kv-accent-500)]',
          disabled && 'opacity-50',
        )"
        style="background-color: var(--kv-bg-elevated); min-height: 38px;"
      >
        <ComboboxInput
          :display-value="(v: unknown) => display(String(v ?? ''))"
          :placeholder="t('admin.aiAccess.form.userPlaceholder')"
          class="flex-1 min-w-0 bg-transparent px-3 py-2 text-[14px] outline-none disabled:cursor-not-allowed"
          style="color: var(--kv-text-primary);"
        />
        <ComboboxTrigger class="px-3 cursor-pointer" style="color: var(--kv-text-muted);" :disabled="disabled">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </ComboboxTrigger>
      </ComboboxAnchor>

      <ComboboxPortal>
        <ComboboxContent
          position="popper"
          :side-offset="4"
          class="z-[100] overflow-hidden rounded-[var(--kv-radius-md)] border"
          style="
            background-color: var(--kv-bg-sidebar);
            border-color: var(--kv-border-strong);
            width: var(--reka-combobox-trigger-width);
          "
        >
          <ComboboxViewport class="p-1" style="max-height: 240px; overflow-y: auto;">
            <p v-if="!filtered.length" class="px-3 py-2 text-[12px]" style="color: var(--kv-text-muted);">
              {{ t('admin.aiAccess.form.noMatch') }}
            </p>
            <ComboboxItem
              v-for="u in filtered"
              :key="u.id"
              :value="u.id"
              class="picker-item flex items-center gap-2 px-3 py-1.5 text-[14px] rounded-[var(--kv-radius-sm)] cursor-pointer outline-none select-none"
              style="color: var(--kv-text-body);"
            >
              <span class="truncate">{{ u.username }}</span>
              <span v-if="u.email" class="truncate text-[12px]" style="color: var(--kv-text-muted);">{{ u.email }}</span>
              <ComboboxItemIndicator class="ml-auto shrink-0" style="color: var(--kv-accent-500);">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
    <span v-if="error" class="text-[12px]" style="color: var(--kv-danger);">{{ error }}</span>
  </div>
</template>

<style scoped>
.picker-item[data-highlighted] {
  background-color: var(--kv-accent-subtle);
  color: var(--kv-text-primary);
}
</style>
