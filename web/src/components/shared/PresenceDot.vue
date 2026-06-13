<script setup lang="ts">
import type { PresenceStatus } from '@/stores/presence'

defineProps<{
  status: PresenceStatus
  /** Kenarlık için arka plan rengi (avatar üzerine konumlandırıldığında) */
  borderColor?: string
}>()
</script>

<template>
  <span
    class="block rounded-full shrink-0"
    :style="{
      backgroundColor:
        status === 'online'  ? 'var(--kv-online)'  :
        status === 'away'    ? 'var(--kv-idle)'     :
        status === 'dnd'     ? 'var(--kv-dnd)'      :
                               'var(--kv-offline)',
      borderWidth: borderColor ? '2px' : '0',
      borderStyle: borderColor ? 'solid' : 'none',
      borderColor: borderColor ?? 'transparent',
    }"
  />
</template>
