<script setup lang="ts">
import { computed } from 'vue'
import UserAvatar from './UserAvatar.vue'
import type { MessageDto } from '@/types'

const props = defineProps<{ message: MessageDto }>()

const timeStr = computed(() => {
  const d = new Date(props.message.createdAt)
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
})
</script>

<template>
  <div class="flex gap-3 px-4 py-1 hover:bg-[var(--kv-bg-elevated)] rounded group">
    <UserAvatar :username="message.author.username" :avatar-url="message.author.avatarUrl" />
    <div class="flex flex-col min-w-0">
      <div class="flex items-baseline gap-2">
        <span class="text-[14px] font-semibold text-[var(--kv-text-primary)]">
          {{ message.author.username }}
        </span>
        <span class="text-[11px] text-[var(--kv-text-muted)]">{{ timeStr }}</span>
      </div>
      <p class="text-[14px] text-[var(--kv-text-body)] break-words whitespace-pre-wrap">
        {{ message.content }}
      </p>
    </div>
  </div>
</template>
