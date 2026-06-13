<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useChannelsStore } from '@/stores/channels'
import { useSocket } from '@/composables/useSocket'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { messagesApi } from '@/api/messages'
import MessageItem from '@/components/shared/MessageItem.vue'
import AttachmentComposeModal from '@/components/shared/AttachmentComposeModal.vue'
import EmojiPicker from '@/components/shared/EmojiPicker.vue'

const { t } = useI18n()
const messagesStore = useMessagesStore()
const channelsStore = useChannelsStore()
const { joinChannel, leaveChannel } = useSocket()
const { onInput: onTypingInput, stopTyping } = useTyping(() => channelId.value)
const { label: typingLabel } = useTypingLabel(() => channelId.value, t)

const content = ref('')
const sending = ref(false)
const listEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const showEmojiPicker = ref(false)
// Room'a join başarısızsa realtime çalışmaz; kullanıcıyı sessiz bırakmıyoruz
const realtimeError = ref(false)
const sendError = ref('')
const slowModeSeconds = ref<number | null>(null)

// Sprint 5 R1 — modal akışı (inline çentik kaldırıldı)
const composeFile = ref<File | null>(null)

const channelId = computed(() => channelsStore.activeChannelId)
const messages = computed(() =>
  channelId.value ? messagesStore.messagesForChannel(channelId.value) : [],
)
const hasMore = computed(() =>
  channelId.value ? (messagesStore.hasMoreByChannel[channelId.value] ?? false) : false,
)
const channelName = computed(() => channelsStore.activeChannel()?.name ?? '')
const channelSlowMode = computed(() => channelsStore.activeChannel()?.slowModeSeconds ?? 0)

function inputPlaceholder() {
  if (channelSlowMode.value > 0) {
    return t('channel.slowModeHint', { seconds: channelSlowMode.value })
  }
  return t('message.inputPlaceholder', { channel: channelName.value })
}

// Emoji compose picker
function toggleEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  showEmojiPicker.value = !showEmojiPicker.value
}

function onComposeEmojiSelect(emoji: string) {
  showEmojiPicker.value = false
  const el = textareaEl.value
  if (!el) {
    content.value += emoji
    return
  }
  const start = el.selectionStart ?? content.value.length
  const end = el.selectionEnd ?? content.value.length
  content.value = content.value.slice(0, start) + emoji + content.value.slice(end)
  nextTick(() => {
    el.focus()
    const pos = start + emoji.length
    el.setSelectionRange(pos, pos)
  })
}

function onComposePickerDocClick(e: MouseEvent) {
  const picker = document.getElementById('kv-compose-emoji-picker')
  if (picker && !picker.contains(e.target as Node)) {
    showEmojiPicker.value = false
  }
}

onMounted(() => document.addEventListener('click', onComposePickerDocClick))
onUnmounted(() => document.removeEventListener('click', onComposePickerDocClick))

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

// Dosya seçimi → modal aç
function openFilePicker() {
  fileInputEl.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!input) return
  input.value = '' // sıfırla, aynı dosyayı tekrar seçmeye izin ver
  if (!file) return
  composeFile.value = file
}

// Modal'dan gelen sent event'i → mesaj gönder
async function onAttachmentSent({ attachmentId, caption }: { attachmentId: string; caption: string }) {
  if (!channelId.value) return
  composeFile.value = null
  slowModeSeconds.value = null
  try {
    const { data } = await messagesApi.send(channelId.value, caption, undefined, [attachmentId])
    messagesStore.appendMessage(data)
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string; message?: string; retryAfter?: number } } }
    const errCode = err.response?.data?.error
    if (errCode === 'SLOW_MODE') {
      const retry = err.response?.data?.retryAfter
      slowModeSeconds.value = typeof retry === 'number' ? retry : null
      sendError.value = slowModeSeconds.value !== null
        ? t('message.errors.SLOW_MODE_RETRY', { seconds: slowModeSeconds.value })
        : t('message.errors.SLOW_MODE')
    } else {
      sendError.value = errCode
        ? (t(`message.errors.${errCode}`) || err.response?.data?.message || t('common.error'))
        : t('common.error')
    }
  }
}

async function send() {
  const hasText = content.value.trim()
  if (!hasText || !channelId.value || sending.value) return
  stopTyping()
  sendError.value = ''
  slowModeSeconds.value = null
  sending.value = true
  const text = content.value.trim()
  content.value = ''
  try {
    const { data } = await messagesApi.send(channelId.value, text)
    // Yerel eko: WS broadcast'i beklemeden gönderenin ekranına yaz. appendMessage
    // id'ye göre dedup yapar (messages.ts:35) → broadcast geldiğinde çiftlemez.
    messagesStore.appendMessage(data)
  } catch (e: unknown) {
    content.value = text
    const err = e as { response?: { data?: { error?: string; message?: string; retryAfter?: number } } }
    const errCode = err.response?.data?.error
    if (errCode === 'SLOW_MODE') {
      const retry = err.response?.data?.retryAfter
      slowModeSeconds.value = typeof retry === 'number' ? retry : null
      sendError.value = slowModeSeconds.value !== null
        ? t('message.errors.SLOW_MODE_RETRY', { seconds: slowModeSeconds.value })
        : t('message.errors.SLOW_MODE')
    } else {
      sendError.value = errCode
        ? (t(`message.errors.${errCode}`) || err.response?.data?.message || t('common.error'))
        : t('common.error')
    }
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
        <!-- Gizli dosya input -->
        <input
          ref="fileInputEl"
          type="file"
          class="hidden"
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
          @change="onFileSelected"
        />
        <!-- Ek (📎) butonu -->
        <button
          type="button"
          class="shrink-0 py-3 cursor-pointer hover:opacity-80 transition-opacity"
          style="color: var(--kv-text-muted);"
          :aria-label="t('attachment.addFile')"
          @click="openFilePicker"
        >
          📎
        </button>
        <textarea
          ref="textareaEl"
          v-model="content"
          rows="1"
          :placeholder="inputPlaceholder()"
          class="flex-1 py-3 bg-transparent text-[15px] resize-none outline-none"
          style="max-height: 50vh; font-family: var(--kv-font-ui); color: var(--kv-text-primary);"
          @keydown="onKeydown"
          @input="sendError = ''; slowModeSeconds = null; onTypingInput(); ($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
          @blur="stopTyping"
        />
        <!-- Emoji (😊) butonu -->
        <div class="relative shrink-0 self-center">
          <button
            type="button"
            class="py-1 px-1 cursor-pointer hover:opacity-80 transition-opacity"
            style="color: var(--kv-text-muted); font-size: 18px; line-height: 1;"
            :aria-label="t('message.emojiButton')"
            @click.stop="toggleEmojiPicker"
          >
            😊
          </button>
          <div
            v-if="showEmojiPicker"
            id="kv-compose-emoji-picker"
            class="absolute bottom-full right-0 mb-2 z-50"
            @click.stop
          >
            <EmojiPicker @select="onComposeEmojiSelect" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Dosya compose modal -->
  <AttachmentComposeModal
    v-if="composeFile && channelId"
    :file="composeFile"
    :channel-id="channelId"
    @sent="onAttachmentSent"
    @close="composeFile = null"
  />
</template>
