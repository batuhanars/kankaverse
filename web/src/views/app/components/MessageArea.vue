<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useChannelsStore } from '@/stores/channels'
import { useSocket } from '@/composables/useSocket'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { messagesApi } from '@/api/messages'
import MessageItem from '@/components/shared/MessageItem.vue'

const { t } = useI18n()
const messagesStore = useMessagesStore()
const channelsStore = useChannelsStore()
const { joinChannel, leaveChannel } = useSocket()
const { onInput: onTypingInput, stopTyping } = useTyping(() => channelId.value)
const { label: typingLabel } = useTypingLabel(() => channelId.value, t)

const content = ref('')
const sending = ref(false)
const listEl = ref<HTMLElement | null>(null)
// Room'a join başarısızsa realtime çalışmaz; kullanıcıyı sessiz bırakmıyoruz
const realtimeError = ref(false)
const sendError = ref('')

const channelId = computed(() => channelsStore.activeChannelId)
const messages = computed(() =>
  channelId.value ? messagesStore.messagesForChannel(channelId.value) : [],
)
const hasMore = computed(() =>
  channelId.value ? (messagesStore.hasMoreByChannel[channelId.value] ?? false) : false,
)
const channelName = computed(() => channelsStore.activeChannel()?.name ?? '')

watch(
  channelId,
  async (id, oldId) => {
    // Eski kanaldan ayrıl
    if (oldId) leaveChannel(oldId)
    if (!id) return

    // Önce room'a join et (§7: channel:join olmadan message.created gelmez)
    const ack = await joinChannel(id)
    // Ack yok sayılırsa join sessizce başarısız olur → realtime ölü, kullanıcı bilmez
    realtimeError.value = !ack.ok
    // Sonra REST'ten geçmiş yükle
    await messagesStore.fetchMessages(id)
    scrollToBottom()
  },
  { immediate: true },
)

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
  stopTyping()
  sendError.value = ''
  sending.value = true
  const text = content.value.trim()
  content.value = ''
  try {
    const { data } = await messagesApi.send(channelId.value, text)
    // Yerel eko: WS broadcast'i beklemeden gönderenin ekranına yaz. appendMessage
    // id'ye göre dedup yapar (messages.ts:35) → broadcast geldiğinde çiftlemez.
    // WS kopukken bile gönderen kendi mesajını görür.
    messagesStore.appendMessage(data)
  } catch (e: unknown) {
    content.value = text
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const errCode = err.response?.data?.error
    sendError.value = errCode
      ? (t(`message.errors.${errCode}`) || err.response?.data?.message || t('common.error'))
      : t('common.error')
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
    <div
      v-if="channelId && realtimeError"
      class="shrink-0 px-4 py-2 text-[13px] text-center"
      style="background-color: var(--kv-warning); color: var(--kv-bg-rail);"
    >
      {{ t('message.realtimeError') }}
    </div>
    <div ref="listEl" class="flex-1 overflow-y-auto py-4 flex flex-col gap-0.5">
      <div v-if="!channelId" class="flex-1 flex items-center justify-center">
        <p style="color: var(--kv-text-muted);">{{ t('channel.selectChannel') }}</p>
      </div>

      <template v-else>
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
          {{ t('message.noMessages') }}
        </p>

        <MessageItem v-for="msg in messages" :key="msg.id" :message="msg" />
      </template>
    </div>

    <div v-if="channelId" class="px-4 pb-6 pt-2">
      <!-- Gönderme hatası (örn. MESSAGE_BLOCKED) -->
      <div
        v-if="sendError"
        class="px-1 mb-1 text-[13px]"
        style="color: var(--kv-danger);"
      >
        {{ sendError }}
      </div>
      <!-- Yazıyor göstergesi -->
      <div
        v-if="typingLabel"
        class="h-5 px-1 mb-1 text-[12px] italic"
        style="color: var(--kv-text-muted);"
      >
        {{ typingLabel }}
      </div>
      <div
        class="flex items-end gap-2 px-4 rounded-[var(--kv-radius-md)] border"
        style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); min-height: 44px;"
      >
        <textarea
          v-model="content"
          rows="1"
          :placeholder="t('message.inputPlaceholder', { channel: channelName })"
          class="flex-1 py-3 bg-transparent text-[15px] resize-none outline-none"
          style="max-height: 50vh; font-family: var(--kv-font-ui); color: var(--kv-text-primary);"
          @keydown="onKeydown"
          @input="sendError = ''; onTypingInput(); ($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
          @blur="stopTyping"
        />
      </div>
    </div>
  </div>
</template>
