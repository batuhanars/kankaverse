<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useChannelsStore } from '@/stores/channels'
import { useSocket } from '@/composables/useSocket'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { messagesApi } from '@/api/messages'
import { attachmentsApi } from '@/api/attachments'
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
const fileInputEl = ref<HTMLInputElement | null>(null)
// Room'a join başarısızsa realtime çalışmaz; kullanıcıyı sessiz bırakmıyoruz
const realtimeError = ref(false)
const sendError = ref('')

// Sprint 5 §7 — bekleyen ek
interface PendingAttachment {
  attachmentId: string
  filename: string
  size: number
  contentType: string
  uploadProgress: number // 0-100
  uploading: boolean
  error: string | null
}
const pendingAttachments = ref<PendingAttachment[]>([])
const uploadError = ref('')

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

// Sprint 5 §7 — dosya seçimi
function openFilePicker() {
  fileInputEl.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!input) return
  input.value = '' // sıfırla, aynı dosyayı tekrar seçmeye izin ver
  if (!file) return

  uploadError.value = ''

  // 1. Presign
  let presignResult: { attachmentId: string; uploadUrl: string; storageKey: string }
  try {
    const res = await attachmentsApi.presign({
      filename: file.name,
      contentType: file.type,
      size: file.size,
    })
    presignResult = res.data
  } catch (err: unknown) {
    const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error
    uploadError.value = code
      ? t(`attachment.errors.${code}`, t('attachment.errors.default'))
      : t('attachment.errors.default')
    return
  }

  const pending: PendingAttachment = {
    attachmentId: presignResult.attachmentId,
    filename: file.name,
    size: file.size,
    contentType: file.type,
    uploadProgress: 0,
    uploading: true,
    error: null,
  }
  pendingAttachments.value.push(pending)

  // 2. S3'e ham PUT
  try {
    await attachmentsApi.uploadToS3(presignResult.uploadUrl, file, (pct) => {
      pending.uploadProgress = pct
    })
    pending.uploading = false
    pending.uploadProgress = 100
  } catch {
    pending.uploading = false
    pending.error = t('attachment.uploadFailed')
  }
}

function removePending(attachmentId: string) {
  pendingAttachments.value = pendingAttachments.value.filter(
    (a) => a.attachmentId !== attachmentId,
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function send() {
  const hasText = content.value.trim()
  const readyAttachments = pendingAttachments.value.filter((a) => !a.uploading && !a.error)
  if ((!hasText && !readyAttachments.length) || !channelId.value || sending.value) return
  stopTyping()
  sendError.value = ''
  sending.value = true
  const text = content.value.trim()
  content.value = ''
  const attachmentIds = readyAttachments.map((a) => a.attachmentId)
  pendingAttachments.value = pendingAttachments.value.filter((a) => a.uploading || a.error)
  try {
    const { data } = await messagesApi.send(channelId.value, text, undefined, attachmentIds)
    // Yerel eko: WS broadcast'i beklemeden gönderenin ekranına yaz. appendMessage
    // id'ye göre dedup yapar (messages.ts:35) → broadcast geldiğinde çiftlemez.
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
      <!-- Yükleme hatası -->
      <div
        v-if="uploadError"
        class="px-1 mb-1 text-[13px]"
        style="color: var(--kv-danger);"
      >
        {{ uploadError }}
      </div>
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

      <!-- Bekleyen ekler -->
      <div
        v-if="pendingAttachments.length"
        class="flex flex-wrap gap-2 mb-2"
      >
        <div
          v-for="att in pendingAttachments"
          :key="att.attachmentId"
          class="flex items-center gap-2 px-2 py-1 rounded-[var(--kv-radius-sm)] text-[12px]"
          style="background-color: var(--kv-bg-elevated);"
        >
          <span
            class="truncate max-w-[140px]"
            :style="att.error ? 'color: var(--kv-danger);' : 'color: var(--kv-text-secondary);'"
          >
            {{ att.filename }}
          </span>
          <span style="color: var(--kv-text-muted);">{{ formatBytes(att.size) }}</span>
          <!-- Yükleme ilerleme -->
          <span v-if="att.uploading" style="color: var(--kv-text-muted);">
            {{ att.uploadProgress }}%
          </span>
          <span v-else-if="att.error" style="color: var(--kv-danger);">
            {{ t('attachment.uploadFailed') }}
          </span>
          <span v-else style="color: var(--kv-success);">✓</span>
          <!-- Kaldır -->
          <button
            class="ml-1 cursor-pointer hover:opacity-80"
            style="color: var(--kv-text-muted);"
            :aria-label="t('attachment.remove')"
            @click="removePending(att.attachmentId)"
          >
            ✕
          </button>
        </div>
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
        <!-- Ek (📎) butonu — Sprint 4A'da gizliydi, Sprint 5'te açıldı -->
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
