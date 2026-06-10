<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useChannelsStore } from '@/stores/channels'
import { messagesApi } from '@/api/messages'
import MessageItem from '@/components/shared/MessageItem.vue'

const { t } = useI18n()
const messagesStore = useMessagesStore()
const channelsStore = useChannelsStore()

const content = ref('')
const sending = ref(false)
const listEl = ref<HTMLElement | null>(null)

const channelId = computed(() => channelsStore.activeChannelId)
const messages = computed(() =>
  channelId.value ? messagesStore.messagesForChannel(channelId.value) : [],
)
const hasMore = computed(() =>
  channelId.value ? (messagesStore.hasMoreByChannel[channelId.value] ?? false) : false,
)
const channelName = computed(() => channelsStore.activeChannel()?.name ?? '')

watch(channelId, async (id) => {
  if (!id) return
  await messagesStore.fetchMessages(id)
  scrollToBottom()
})

watch(
  messages,
  async () => {
    await nextTick()
    scrollToBottom()
  },
  { flush: 'post' },
)

function scrollToBottom() {
  if (listEl.value) {
    listEl.value.scrollTop = listEl.value.scrollHeight
  }
}

async function loadMore() {
  if (!channelId.value || !messages.value.length) return
  const oldest = messages.value[0].id
  await messagesStore.fetchMessages(channelId.value, oldest)
}

async function send() {
  if (!content.value.trim() || !channelId.value || sending.value) return
  sending.value = true
  const text = content.value.trim()
  content.value = ''
  try {
    await messagesApi.send(channelId.value, text)
    // WS broadcast message.created store'a yazacak, ek işlem yok
  } catch {
    content.value = text // Geri koy
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
  <div class="flex flex-col flex-1 min-w-0" style="background-color: var(--kv-bg-content);">
    <!-- Mesaj listesi -->
    <div ref="listEl" class="flex-1 overflow-y-auto py-4 flex flex-col gap-0.5">
      <div v-if="!channelId" class="flex-1 flex items-center justify-center">
        <p class="text-[var(--kv-text-muted)]">Bir kanal seç</p>
      </div>

      <template v-else>
        <div v-if="hasMore" class="flex justify-center py-2">
          <button
            class="text-[13px] text-[var(--kv-info)] hover:underline cursor-pointer"
            @click="loadMore"
          >
            {{ t('message.loadMore') }}
          </button>
        </div>

        <p
          v-if="!messages.length"
          class="text-center text-[var(--kv-text-muted)] text-[14px] py-8"
        >
          {{ t('message.noMessages') }}
        </p>

        <MessageItem v-for="msg in messages" :key="msg.id" :message="msg" />
      </template>
    </div>

    <!-- Input -->
    <div v-if="channelId" class="px-4 pb-6 pt-2">
      <div
        class="flex items-end gap-2 px-4 rounded-[var(--kv-radius-md)] border"
        style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); min-height: 44px;"
      >
        <textarea
          v-model="content"
          rows="1"
          :placeholder="t('message.inputPlaceholder', { channel: channelName })"
          class="flex-1 py-3 bg-transparent text-[15px] text-[var(--kv-text-primary)] placeholder:text-[var(--kv-text-muted)] resize-none outline-none"
          style="max-height: 50vh; font-family: var(--kv-font-ui);"
          @keydown="onKeydown"
          @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
        />
      </div>
    </div>
  </div>
</template>
