<script setup lang="ts">
import GamepadIcon from '@/components/shared/GamepadIcon.vue'

// Oyunun sunucudaki logosu (kendi cdn adresimiz); yoksa genel oyun kolu simgesi.
withDefaults(defineProps<{ iconUrl?: string | null; size?: number }>(), {
  iconUrl: null,
  size: 28,
})
</script>

<template>
  <img
    v-if="iconUrl"
    :src="iconUrl"
    alt=""
    :width="size"
    :height="size"
    class="shrink-0 rounded-[6px] object-cover"
    :style="{ width: size + 'px', height: size + 'px' }"
  />
  <span
    v-else
    class="shrink-0 flex items-center justify-center rounded-[6px]"
    :style="{ width: size + 'px', height: size + 'px', backgroundColor: 'var(--kv-bg-content)', color: 'var(--kv-text-muted)' }"
  >
    <GamepadIcon :size="Math.round(size * 0.6)" />
  </span>
</template>
