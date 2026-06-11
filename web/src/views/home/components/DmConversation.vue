<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useDmStore } from '@/stores/dm'
import { useSocket } from '@/composables/useSocket'
import { messagesApi } from '@/api/messages'
import MessageItem from '@/components/shared/MessageItem.vue'
import type { FriendCodeUserDto } from '@/types'

const props = defineProps<{
  channelId: string
  otherUser: FriendCodeUserDto
}>()

const { t } = useI18n()
const messagesStore = useMessagesStore()
const dmStore = useDmStore()
const { joinChannel, leaveChannel } = useSocket()

const content = ref('')
const sending = ref(false)
const listEl = ref<HTMLElement | null>(null)
const realtimeError = ref(false)

const messages = computed(() => messagesStore.messagesForChannel(props.channelId))
const hasMore = computed(() => messagesStore.hasMoreByChannel[props.channelId] ?? false)

watch(
  () => props.channelId,
  async (id, oldId) => {
    if (oldId) leaveChannel(oldId)
    if (!id) return
    const ack = await joinChannel(id)
    realtimeError.value = !ack.ok
    await messagesStore.fetchMessages(id)
    await dmStore.markRead(id)
    scrollToBottom()
  },
  { immediate: true },
)

watch(messages, async () => {
  await nextTick()
  scrollToBottom()
}, { flush: 'post' })

function scrollToBottom() {
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function loadMore() {
  if (!messages.value.length) return
  await messagesStore.fetchMessages(props.channelId, messages.value[0].id)
}

async function send() {
  if (!content.value.trim() || sending.value) return
  sending.value = true
  const text = content.value.trim()
  content.value = ''
  try {
    const { data } = await messagesApi.send(props.channelId, text)
    messagesStore.appendMessage(data)
  } catch {
    content.value = text
  } finally {
    sending.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 overflow-hidden" style="background-color: var(--kv-bg-content);">
    <!-- DM başlık çubuğu -->
    <div
      class="h-12 flex items-center px-4 gap-3 shrink-0 border-b"
      style="border-color: var(--kv-border-subtle);"
    >
      <div class="w-7 h-7 rounded-full shrink-0 overflow-hidden" style="background-color: var(--kv-bg-elevated);">
        <img
          v-if="otherUser.avatarUrl"
          :src="otherUser.avatarUrl"
          :alt="otherUser.username"
          class="w-full h-full object-cover"
        />
        <span v-else class="w-full h-full flex items-center justify-center text-[11px] font-semibold" style="color: var(--kv-text-secondary);">
          {{ otherUser.username[0].toUpperCase() }}
        </span>
      </div>
      <span class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
        {{ otherUser.username }}
      </span>
    </div>

    <div
      v-if="realtimeError"
      class="shrink-0 px-4 py-2 text-[13px] text-center"
      style="background-color: var(--kv-warning); color: var(--kv-bg-rail);"
    >
      {{ t('message.realtimeError') }}
    </div>

    <div ref="listEl" class="flex-1 overflow-y-auto py-4 flex flex-col gap-0.5">
      <div v-if="hasMore" class="flex justify-center py-2">
        <button
          class="text-[13px] hover:underline cursor-pointer"
          style="color: var(--kv-info);"
          @click="loadMore"
        >
          {{ t('message.loadMore') }}
        </button>
      </div>
      <p
        v-if="!messages.length"
        class="text-center text-[14px] py-8"
        style="color: var(--kv-text-muted);"
      >
        {{ t('dm.empty') }}
      </p>
      <MessageItem v-for="msg in messages" :key="msg.id" :message="msg" />
    </div>

    <div class="px-4 pb-6 pt-2 shrink-0">
      <div
        class="flex items-end gap-2 px-4 rounded-[var(--kv-radius-md)] border"
        style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); min-height: 44px;"
      >
        <textarea
          v-model="content"
          rows="1"
          :placeholder="t('dm.placeholder', { user: otherUser.username })"
          class="flex-1 py-3 bg-transparent text-[15px] resize-none outline-none"
          style="max-height: 50vh; font-family: var(--kv-font-ui); color: var(--kv-text-primary);"
          @keydown="onKeydown"
          @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
        />
      </div>
    </div>
  </div>
</template>
