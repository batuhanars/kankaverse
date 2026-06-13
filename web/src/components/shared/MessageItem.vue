<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import UserAvatar from './UserAvatar.vue'
import UserCardPopover from './UserCardPopover.vue'
import AttachmentView from './AttachmentView.vue'
import type { MessageDto } from '@/types'

const props = defineProps<{ message: MessageDto }>()

const timeStr = computed(() => {
  const d = new Date(props.message.createdAt)
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
})

const showCard = ref(false)
const cardX = ref(0)
const cardY = ref(0)

function closeCard() {
  showCard.value = false
}

function onAuthorClick(e: MouseEvent) {
  window.dispatchEvent(new CustomEvent('kv:close-user-cards'))
  cardX.value = e.clientX
  cardY.value = e.clientY
  showCard.value = true
}

onMounted(() => window.addEventListener('kv:close-user-cards', closeCard))
onUnmounted(() => window.removeEventListener('kv:close-user-cards', closeCard))
</script>

<template>
  <div class="flex gap-3 px-4 py-1 hover:bg-[var(--kv-bg-elevated)] rounded group">
    <button class="shrink-0 cursor-pointer" @click="onAuthorClick">
      <UserAvatar :username="message.author.username" :avatar-url="message.author.avatarUrl" />
    </button>
    <div class="flex flex-col min-w-0">
      <div class="flex items-baseline gap-2">
        <button
          class="text-[14px] font-semibold hover:underline cursor-pointer text-left"
          style="color:var(--kv-text-primary);"
          @click="onAuthorClick"
        >
          {{ message.author.username }}
        </button>
        <span class="text-[11px] text-[var(--kv-text-muted)]">{{ timeStr }}</span>
      </div>
      <p
        v-if="message.content"
        class="text-[14px] text-[var(--kv-text-body)] break-words whitespace-pre-wrap"
      >
        {{ message.content }}
      </p>
      <!-- Sprint 5 §7: Attachment'lar -->
      <AttachmentView
        v-for="att in message.attachments"
        :key="att.id"
        :attachment="att"
      />
    </div>
  </div>

  <UserCardPopover
    v-if="showCard"
    :user-id="message.author.id"
    :x="cardX"
    :y="cardY"
    @close="showCard = false"
  />
</template>
