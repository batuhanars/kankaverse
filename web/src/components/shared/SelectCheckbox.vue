<script setup lang="ts">
/** C82: seçim modunda satırın solundaki onay kutusu (yalnız görsel; tıklamayı satırın üst katmanı alır). Yerel mesajda boşluk korunur, kutu çizilmez. */
defineProps<{ checked: boolean; disabled?: boolean }>()
</script>

<template>
  <div class="w-5 shrink-0 flex items-start pt-2.5" aria-hidden="true">
    <span
      v-if="!disabled"
      class="w-[18px] h-[18px] rounded-[var(--kv-radius-sm)] border flex items-center justify-center"
      :style="checked
        ? 'background-color: var(--kv-accent-500); border-color: var(--kv-accent-500);'
        : 'border-color: var(--kv-text-muted);'"
    >
      <svg v-if="checked" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>
  </div>
</template>
