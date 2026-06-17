<script setup lang="ts">
/**
 * KvNumberInput — estetik sayısal giriş (native spinner gizli + özel ▲▼ stepper).
 * Tasarım token'larıyla temalı; ses kanalı kullanıcı limiti + davet maks/süre gibi
 * sayaçlı alanlarda kullanılır (Rule of Three: 2+ yer → ortak primitive).
 *
 * v-model: number | null  → null = boş (placeholder gösterilir, örn. ∞); 0 geçerli değerdir.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label?: string
    placeholder?: string
    min?: number
    max?: number
    step?: number
  }>(),
  { min: 0, max: 999, step: 1 },
)

const model = defineModel<number | null>()

const display = computed(() => (model.value === null || model.value === undefined ? '' : String(model.value)))

function clamp(n: number): number {
  return Math.min(props.max, Math.max(props.min, n))
}

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  if (raw === '') {
    model.value = null
    return
  }
  const n = parseInt(raw, 10)
  model.value = Number.isNaN(n) ? null : clamp(n)
}

function bump(dir: 1 | -1) {
  const base = model.value === null || model.value === undefined ? props.min : model.value
  model.value = clamp(base + dir * props.step)
}
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
    <div class="kv-num relative flex items-center">
      <input
        :value="display"
        type="number"
        inputmode="numeric"
        :min="min"
        :max="max"
        :step="step"
        :placeholder="placeholder"
        class="kv-num__input w-full pl-3 pr-9 py-2 text-[14px] rounded-[var(--kv-radius-md)] border outline-none transition-colors"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border-color: var(--kv-border-strong);"
        @input="onInput"
      />
      <!-- Özel stepper (▲▼) — sağda dikey -->
      <div class="kv-num__stepper absolute right-1 top-1 bottom-1 flex flex-col">
        <button
          type="button"
          class="kv-num__btn"
          tabindex="-1"
          aria-label="+"
          @click="bump(1)"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <button
          type="button"
          class="kv-num__btn"
          tabindex="-1"
          aria-label="−"
          @click="bump(-1)"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kv-num__input:focus {
  border-color: var(--kv-accent-500);
}
/* Native spinner gizle (özel stepper var) */
.kv-num__input::-webkit-outer-spin-button,
.kv-num__input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.kv-num__input {
  -moz-appearance: textfield;
  appearance: textfield;
}
.kv-num__btn {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  padding: 0;
  border: none;
  border-radius: var(--kv-radius-sm);
  background: transparent;
  color: var(--kv-text-muted);
  cursor: pointer;
  transition: background-color 0.12s, color 0.12s;
}
.kv-num__btn:hover {
  background-color: var(--kv-accent-subtle);
  color: var(--kv-text-primary);
}
.kv-num__btn:active {
  color: var(--kv-accent-500);
}
</style>
