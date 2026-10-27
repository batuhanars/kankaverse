<script setup lang="ts">
/**
 * Emoji düğmelerinin ortak simgesi: gri çizgi gülen yüz (mesaj tepki düğmesinin standardı).
 * Renk `currentColor`; düğme `--kv-text-muted` verir, hover'da `--kv-text-secondary`.
 * Sahip kararı 2026-10-27: web'de hiçbir emoji düğmesi renkli 😊 kullanmaz (mobil `happy-outline` ile aynı dil).
 */
withDefaults(defineProps<{ size?: number }>(), { size: 16 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" stroke-width="2.5" stroke-linecap="round" />
    <line x1="15" y1="9" x2="15.01" y2="9" stroke-width="2.5" stroke-linecap="round" />
  </svg>
</template>
