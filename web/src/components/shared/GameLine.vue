<script setup lang="ts">
import GamepadIcon from '@/components/shared/GamepadIcon.vue'
import MarqueeText from '@/components/shared/MarqueeText.vue'

// Liste satırlarındaki oyun satırı: küçük oyun kolu simgesi + oyun adı, normal yazı rengi
// (C31c §0: "X oynuyor" tam cümlesi yalnız profil kartında). Taşan ad hover'da kayar.
defineProps<{ name: string }>()
</script>

<template>
  <span class="flex items-center gap-1 min-w-0 max-w-full" style="color: var(--kv-text-secondary);">
    <GamepadIcon :size="12" />
    <MarqueeText class="flex-1" :text="name" />
  </span>
</template>
