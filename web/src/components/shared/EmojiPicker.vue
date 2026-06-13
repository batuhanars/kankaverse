<script setup lang="ts">
import EmojiPickerLib, { type EmojiExt } from 'vue3-emoji-picker'
// @ts-ignore — CSS side-effect import; no type declarations needed
import 'vue3-emoji-picker/css'

defineOptions({ name: 'EmojiPicker' })

const emit = defineEmits<{ select: [emoji: string] }>()

function onSelect(emoji: EmojiExt) {
  // emoji.i is the native unicode character
  emit('select', emoji.i)
}
</script>

<template>
  <div class="kv-emoji-picker">
    <EmojiPickerLib
      :native="true"
      theme="dark"
      @select="onSelect"
    />
  </div>
</template>

<style scoped>
/*
  library'nin --v3-picker-* CSS değişkenlerini --kv-* token'larımıza yaklaştır.
  theme="dark" sınıfı .v3-color-theme-dark ekler; o temadan bağımsız override yapıyoruz.
  Gölge yok (box-shadow: none).
*/
.kv-emoji-picker :deep(.v3-emoji-picker) {
  --v3-picker-bg: var(--kv-bg-elevated);
  --v3-picker-fg: var(--kv-text-body);
  --v3-picker-border: var(--kv-border-subtle);
  --v3-picker-input-bg: var(--kv-bg-sidebar);
  --v3-picker-input-border: var(--kv-border-subtle);
  --v3-picker-input-focus-border: var(--kv-accent-500);
  --v3-picker-emoji-hover: var(--kv-bg-sidebar);
  --v3-group-image-filter: none;
  box-shadow: none;
  border: 1px solid var(--kv-border-subtle);
  border-radius: var(--kv-radius-md);
  /* makul boyut + iç scroll */
  height: 360px;
  width: 300px;
}
</style>
