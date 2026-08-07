<script setup lang="ts">
const model = defineModel<boolean>({ required: true })

defineProps<{
  disabled?: boolean
}>()
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50"
    :style="model ? 'background-color: var(--kv-accent-500);' : 'background-color: var(--kv-bg-rail);'"
    @click="model = !model"
  >
    <span
      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200"
      :class="model ? 'translate-x-5' : 'translate-x-0'"
    />
  </button>
</template>
