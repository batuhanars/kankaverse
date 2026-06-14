<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useChannelsStore } from '@/stores/channels'
import { useGuildsStore } from '@/stores/guilds'
import { useAuthStore } from '@/stores/auth'
import { useSocket } from '@/composables/useSocket'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'
import { useJumpToMessage } from '@/composables/useMessageJump'
import { messagesApi } from '@/api/messages'
import { guildsApi } from '@/api/guilds'
import MessageItem from '@/components/shared/MessageItem.vue'
import AttachmentComposeModal from '@/components/shared/AttachmentComposeModal.vue'
import EmojiPicker from '@/components/shared/EmojiPicker.vue'
import type { MessageDto, GuildMemberDto } from '@/types'

const { t } = useI18n()
const messagesStore = useMessagesStore()
const channelsStore = useChannelsStore()
const guildsStore = useGuildsStore()
const authStore = useAuthStore()
const { joinChannel, leaveChannel } = useSocket()

// Sprint V2 Pins: guild kanalında yalnız OWNER/ADMIN sabitleyebilir (§2)
const canPin = computed(() => guildsStore.isAdminInActiveGuild(authStore.user?.id ?? ''))
const { onInput: onTypingInput, stopTyping } = useTyping(() => channelId.value)
const { label: typingLabel } = useTypingLabel(() => channelId.value, t)

const content = ref('')
const sending = ref(false)
const listEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const textareaEl = ref<HTMLTextAreaElement | null>(null)
const showEmojiPicker = ref(false)
// Compose emoji picker tetikleyici butonu (Teleport konumlandırması için)
const composeEmojiTriggerEl = ref<HTMLElement | null>(null)
// Room'a join başarısızsa realtime çalışmaz; kullanıcıyı sessiz bırakmıyoruz
const realtimeError = ref(false)
const sendError = ref('')
const slowModeSeconds = ref<number | null>(null)

// Sprint 5 R1 — modal akışı (inline çentik kaldırıldı)
const composeFile = ref<File | null>(null)

// Yanıt state
const replyingTo = ref<MessageDto | null>(null)

// Sprint V2: guild üyeleri (mention autocomplete + resolver için)
const guildMembers = ref<GuildMemberDto[]>([])

function setReplyingTo(msg: MessageDto) {
  replyingTo.value = msg
  nextTick(() => textareaEl.value?.focus())
}

function cancelReply() {
  replyingTo.value = null
}

const channelId = computed(() => channelsStore.activeChannelId)
const messages = computed(() =>
  channelId.value ? messagesStore.messagesForChannel(channelId.value) : [],
)

// Gruplama: mesaj grup başı mı?
// Kural: ilk mesaj VEYA önceki yazarı farklı VEYA öncekinden > 7 dakika geçmişse → grup başı.
function isGroupStart(index: number): boolean {
  if (index === 0) return true
  const cur = messages.value[index]
  const prev = messages.value[index - 1]
  if (cur.author.id !== prev.author.id) return true
  const diffMs = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime()
  return diffMs > 7 * 60 * 1000
}
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
  // Tetikleyici buton veya picker'ın içine tıklanmadıysa kapat.
  // Picker body'e Teleport edildiği için DOM'da .v3-emoji-picker sınıfından tanıyoruz.
  if (!composeEmojiTriggerEl.value?.contains(e.target as Node)) {
    const pickerInDom = (e.target as Element)?.closest?.('.v3-emoji-picker')
    if (!pickerInDom) {
      showEmojiPicker.value = false
    }
  }
}

onMounted(() => document.addEventListener('click', onComposePickerDocClick))
onUnmounted(() => document.removeEventListener('click', onComposePickerDocClick))

// Sprint V2: guild değişince üyeleri yükle (mention autocomplete için)
watch(
  () => guildsStore.activeGuildId,
  async (guildId) => {
    if (!guildId) { guildMembers.value = []; return }
    try {
      const res = await guildsApi.getMembers(guildId)
      guildMembers.value = res.data
    } catch {
      guildMembers.value = []
    }
  },
  { immediate: true },
)

// Sprint V2: mention autocomplete (guild kanalı → guild üyeleri)
const mentionMembers = computed(() =>
  guildMembers.value.map((m) => ({ id: m.userId, username: m.username, avatarUrl: m.avatarUrl }))
)

const mention = useMentionAutocomplete(
  mentionMembers,
  () => content.value,
  (v) => { content.value = v },
  () => textareaEl.value?.selectionStart ?? 0,
  (pos) => { nextTick(() => { textareaEl.value?.setSelectionRange(pos, pos) }) },
)

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

// Mesaja zıpla (pins/arama) — zıplama sırasında alta kaymayı bastır
const { isJumping } = useJumpToMessage(listEl, () => channelId.value)

watch(
  messages,
  async () => {
    if (isJumping.value) return
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
  const replyId = replyingTo.value?.id
  replyingTo.value = null
  try {
    const { data } = await messagesApi.send(channelId.value, caption, replyId, [attachmentId])
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
  // Sprint V2: @username → <@userId> dönüşümü gönderimden önce
  const text = mention.applyMentionTokens(content.value.trim())
  mention.clearPending()
  content.value = ''
  const replyId = replyingTo.value?.id
  replyingTo.value = null
  try {
    const { data } = await messagesApi.send(channelId.value, text, replyId)
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
  // Sprint V2: mention popover açıkken ↑/↓/Enter/Tab/Esc → autocomplete'e yönlendir
  if (mention.onKeydown(e)) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function onTextareaInput() {
  sendError.value = ''
  slowModeSeconds.value = null
  onTypingInput()
  const el = textareaEl.value
  if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  // Sprint V2: mention autocomplete tetikle
  mention.onInput()
}
</script>

<template>
  <div class="flex flex-col flex-1 min-w-0 min-h-0" style="background-color: var(--kv-bg-content);">
    <div
      v-if="channelId && realtimeError"
      class="shrink-0 px-4 py-2 text-[13px] text-center"
      style="background-color: var(--kv-warning); color: var(--kv-bg-rail);"
    >
      {{ t('message.realtimeError') }}
    </div>
    <div ref="listEl" class="flex-1 min-h-0 overflow-y-auto py-4 flex flex-col gap-0.5">
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

        <MessageItem
          v-for="(msg, index) in messages"
          :key="msg.id"
          :message="msg"
          :is-group-start="isGroupStart(index)"
          :guild-members="guildMembers"
          :can-pin="canPin"
          @reply="setReplyingTo"
        />
      </template>
    </div>

    <div v-if="channelId" class="shrink-0 px-4 pb-6 pt-2">
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

      <!-- Yanıt önizleme bandı -->
      <div
        v-if="replyingTo"
        class="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-t-[var(--kv-radius-sm)] text-[12px] truncate"
        style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); border-bottom: none;"
      >
        <span class="shrink-0" style="color: var(--kv-text-muted);">↩</span>
        <span class="font-semibold shrink-0" style="color: var(--kv-text-secondary);">{{ t('reply.to', { author: replyingTo.author.username }) }}</span>
        <span class="truncate" style="color: var(--kv-text-muted);">— {{ replyingTo.content }}</span>
        <button
          class="shrink-0 ml-auto cursor-pointer hover:opacity-80 transition-opacity"
          style="color: var(--kv-text-muted);"
          :title="t('reply.cancel')"
          @click="cancelReply"
        >
          ✕
        </button>
      </div>

      <div
        class="flex items-center gap-2 px-4 border"
        :class="replyingTo ? 'rounded-b-[var(--kv-radius-md)]' : 'rounded-[var(--kv-radius-md)]'"
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
        <!-- Ek (ataç) butonu -->
        <button
          type="button"
          class="shrink-0 w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors hover:opacity-100"
          style="color: var(--kv-text-secondary); align-self: center;"
          :aria-label="t('attachment.addFile')"
          :title="t('attachment.addFile')"
          @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-secondary)'"
          @click="openFilePicker"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <!-- Sprint V2: mention autocomplete — relative sarmalayıcı popover için -->
        <div class="relative flex-1 min-w-0">
          <div
            v-if="mention.showPopover.value"
            class="absolute bottom-full left-0 mb-1 z-50 min-w-[200px] max-w-[320px] overflow-hidden rounded-[var(--kv-radius-md)] border"
            style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
            @mousedown.prevent
          >
            <div
              v-for="(member, idx) in mention.suggestions.value"
              :key="member.id"
              class="flex items-center gap-2 px-3 py-2 cursor-pointer text-[14px]"
              :style="idx === mention.activeIndex.value
                ? 'background-color: var(--kv-accent-subtle); color: var(--kv-text-primary);'
                : 'color: var(--kv-text-secondary);'"
              @click="mention.selectSuggestion(member)"
            >
              <!-- Daire avatar -->
              <div
                class="w-6 h-6 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-semibold text-white"
                style="background-color: var(--kv-accent-500);"
              >
                <img v-if="member.avatarUrl" :src="member.avatarUrl" :alt="member.username" class="w-full h-full object-cover" />
                <span v-else>{{ member.username[0].toUpperCase() }}</span>
              </div>
              <span class="font-medium">@{{ member.username }}</span>
            </div>
          </div>
          <textarea
            ref="textareaEl"
            v-model="content"
            rows="1"
            :placeholder="inputPlaceholder()"
            class="w-full bg-transparent text-[15px] resize-none outline-none"
            style="max-height: 50vh; font-family: var(--kv-font-ui); color: var(--kv-text-primary); line-height: 1.5; padding-top: 10px; padding-bottom: 10px;"
            @keydown="onKeydown"
            @input="onTextareaInput"
            @blur="stopTyping"
          />
        </div>
        <!-- Emoji (😊) butonu -->
        <div class="relative shrink-0 self-center">
          <button
            ref="composeEmojiTriggerEl"
            type="button"
            class="py-1 px-1 cursor-pointer hover:opacity-80 transition-opacity"
            style="color: var(--kv-text-muted); font-size: 18px; line-height: 1;"
            :aria-label="t('message.emojiButton')"
            @click.stop="toggleEmojiPicker"
          >
            😊
          </button>
          <!-- Teleport to body ile viewport-farkındalıklı konumlandırma -->
          <EmojiPicker
            v-if="showEmojiPicker"
            :anchor-el="composeEmojiTriggerEl"
            @select="onComposeEmojiSelect"
          />
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
