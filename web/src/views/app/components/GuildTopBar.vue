<script setup lang="ts">
import { useGuildsStore } from '@/stores/guilds'
import NotificationBell from '@/components/shared/NotificationBell.vue'

const guildsStore = useGuildsStore()
</script>

<template>
  <div class="h-20 shrink-0 flex items-center">
    <!-- Sunucu adı — flex-1, ortada -->
    <div class="flex-1 flex items-center justify-center px-6">
      <span
        class="text-[16px] font-semibold truncate"
        style="color: var(--kv-text-primary);"
      >{{ guildsStore.activeGuild()?.name ?? '' }}</span>
    </div>

    <!-- Bildirim çanı -->
    <div class="mr-4">
      <NotificationBell />
    </div>
  </div>
</template>
