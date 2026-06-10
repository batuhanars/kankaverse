<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  username: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}>()

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'w-6 h-6 text-[11px]'
  if (props.size === 'lg') return 'w-10 h-10 text-[16px]'
  return 'w-8 h-8 text-[13px]'
})

const initial = computed(() => props.username.charAt(0).toUpperCase())
</script>

<template>
  <div
    :class="[
      sizeClass,
      'rounded-full flex items-center justify-center shrink-0 bg-[var(--kv-bg-elevated)] text-[var(--kv-text-secondary)] font-semibold overflow-hidden',
    ]"
  >
    <img v-if="avatarUrl" :src="avatarUrl" :alt="username" class="w-full h-full object-cover" />
    <span v-else>{{ initial }}</span>
  </div>
</template>
