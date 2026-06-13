<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useSocket } from '@/composables/useSocket'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { messagesApi } from '@/api/messages'
import { dmApi } from '@/api/dm'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import AttachmentView from '@/components/shared/AttachmentView.vue'
import AttachmentComposeModal from '@/components/shared/AttachmentComposeModal.vue'
import ReportModal from '@/components/shared/ReportModal.vue'
import GroupManagePanel from './GroupManagePanel.vue'
import type { DmChannelDto, MessageDto } from '@/types'

// Sprint 6.2: mesaj düzenleme / silme state
interface EditState {
  messageId: string
  content: string
  loading: boolean
  error: string
}

const editState = ref<EditState | null>(null)
const editTextareaEl = ref<HTMLTextAreaElement | null>(null)
const showDeleteConfirm = ref(false)
const deleteTargetId = ref<string | null>(null)
const deleteLoading = ref(false)

// Sprint V2: reaksiyon emoji seti + picker state
const EMOJI_SET = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👀']
const activeEmojiPickerId = ref<string | null>(null)

function toggleDmEmojiPicker(msgId: string, e: MouseEvent) {
  e.stopPropagation()
  activeEmojiPickerId.value = activeEmojiPickerId.value === msgId ? null : msgId
}

async function pickDmEmoji(msg: MessageDto, emoji: string) {
  activeEmojiPickerId.value = null
  try {
    await messagesApi.addReaction(props.channel.id, msg.id, emoji)
    // Store güncellemesi useSocket reaction.added handler'ından gelir (çift-sayım önleme)
  } catch {
    // sessizce yut
  }
}

async function toggleDmReaction(msg: MessageDto, emoji: string, reactedByMe: boolean) {
  try {
    if (reactedByMe) {
      await messagesApi.removeReaction(props.channel.id, msg.id, emoji)
    } else {
      await messagesApi.addReaction(props.channel.id, msg.id, emoji)
    }
    // Store güncellemesi useSocket reaction.added/reaction.removed handler'ından gelir (çift-sayım önleme)
  } catch {
    // sessizce yut
  }
}

const props = defineProps<{
  channel: DmChannelDto
}>()
const emit = defineEmits<{ cleared: []; left: []; deleted: [] }>()

const { t } = useI18n()
const messagesStore = useMessagesStore()
const dmStore = useDmStore()
const authStore = useAuthStore()
const friendsStore = useFriendsStore()
const { joinChannel, leaveChannel } = useSocket()
const { onInput: onTypingInput, stopTyping } = useTyping(() => props.channel.id)
const { label: typingLabel } = useTypingLabel(() => props.channel.id, t, { named: false })

// Tip yardımcıları
const isGroup = computed(() => props.channel.type === 'GROUP_DM')
const dmChannel = computed(() => props.channel.type === 'DM' ? props.channel : null)
const groupChannel = computed(() => props.channel.type === 'GROUP_DM' ? props.channel : null)

// Grup adı: verilen ad yoksa üye adlarından üretilir
const groupDisplayName = computed(() => {
  const g = groupChannel.value
  if (!g) return ''
  if (g.name) return g.name
  const names = g.members.map((m) => m.username)
  if (names.length <= 3) return names.join(', ')
  return names.slice(0, 2).join(', ') + ` +${names.length - 2}`
})

const content = ref('')
const sending = ref(false)
const sendError = ref('')
const listEl = ref<HTMLElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const realtimeError = ref(false)
const showClearConfirm = ref(false)
const clearing = ref(false)
const unblocking = ref(false)
const reportTargetId = ref<string | null>(null)
const reportTargetType = ref<'MESSAGE' | 'USER'>('MESSAGE')
const showGroupPanel = ref(false)

// Sprint 5 R1 — modal akışı
const composeFile = ref<File | null>(null)

function openReportMessage(msgId: string) {
  reportTargetType.value = 'MESSAGE'
  reportTargetId.value = msgId
}

// Sprint 6.2: düzenleme fonksiyonları
function startEdit(msg: MessageDto) {
  editState.value = { messageId: msg.id, content: msg.content, loading: false, error: '' }
  nextTick(() => {
    if (editTextareaEl.value) {
      editTextareaEl.value.focus()
      editTextareaEl.value.style.height = 'auto'
      editTextareaEl.value.style.height = editTextareaEl.value.scrollHeight + 'px'
    }
  })
}

function cancelEdit() {
  editState.value = null
}

async function saveEdit() {
  if (!editState.value || editState.value.loading) return
  const state = editState.value
  const trimmed = state.content.trim()
  if (!trimmed) return
  state.loading = true
  state.error = ''
  try {
    const { data } = await messagesApi.editMessage(props.channel.id, state.messageId, trimmed)
    messagesStore.updateMessage(data)
    editState.value = null
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    const code = err.response?.data?.error
    state.error = code === 'MESSAGE_BLOCKED'
      ? t('message.errors.MESSAGE_BLOCKED')
      : t('common.error')
    state.loading = false
  }
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    saveEdit()
  }
  if (e.key === 'Escape') {
    cancelEdit()
  }
}

function openDeleteConfirm(msgId: string) {
  deleteTargetId.value = msgId
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (!deleteTargetId.value) return
  deleteLoading.value = true
  try {
    await messagesApi.deleteMessage(props.channel.id, deleteTargetId.value)
    messagesStore.removeMessage(props.channel.id, deleteTargetId.value)
  } catch {
    // WS zaten kaldıracak; sessizce yut
  } finally {
    deleteLoading.value = false
    showDeleteConfirm.value = false
    deleteTargetId.value = null
  }
}

function openReportUser() {
  if (dmChannel.value) {
    reportTargetType.value = 'USER'
    reportTargetId.value = dmChannel.value.otherUser.id
  }
}

const messages = computed(() => messagesStore.messagesForChannel(props.channel.id))
const hasMore = computed(() => messagesStore.hasMoreByChannel[props.channel.id] ?? false)

watch(
  () => props.channel.id,
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
  await messagesStore.fetchMessages(props.channel.id, messages.value[0].id)
}

function openFilePicker() {
  fileInputEl.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!input) return
  input.value = ''
  if (!file) return
  composeFile.value = file
}

async function onAttachmentSent({ attachmentId, caption }: { attachmentId: string; caption: string }) {
  composeFile.value = null
  try {
    const { data } = await messagesApi.send(props.channel.id, caption, undefined, [attachmentId])
    messagesStore.appendMessage(data)
  } catch {
    // hata sessizce yutulur — modal zaten kapandı
  }
}

async function send() {
  const hasText = content.value.trim()
  // Grup kanallarında canMessage kontrolü yok (backend kontrol eder)
  const canSend = isGroup.value || dmChannel.value?.canMessage
  if (!hasText || sending.value || !canSend) return
  stopTyping()
  sendError.value = ''
  sending.value = true
  const text = content.value.trim()
  content.value = ''
  try {
    const { data } = await messagesApi.send(props.channel.id, text)
    messagesStore.appendMessage(data)
  } catch (e: unknown) {
    content.value = text
    const err = e as { response?: { data?: { error?: string; message?: string } } }
    const errCode = err.response?.data?.error
    sendError.value = errCode
      ? (t(`message.errors.${errCode}`) !== `message.errors.${errCode}` ? t(`message.errors.${errCode}`) : (err.response?.data?.message ?? t('common.error')))
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

function isMine(msg: MessageDto): boolean {
  return msg.author.id === authStore.user?.id
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// 1-1 DM: sohbeti temizle
async function clearConversation() {
  clearing.value = true
  try {
    await dmApi.clearChannel(props.channel.id)
    dmStore.removeChannel(props.channel.id)
    emit('cleared')
  } finally {
    clearing.value = false
    showClearConfirm.value = false
  }
}

async function unblockUser() {
  if (!dmChannel.value) return
  unblocking.value = true
  try {
    await friendsStore.unblockUser(dmChannel.value.otherUser.id)
    await dmStore.fetchChannels()
  } finally {
    unblocking.value = false
  }
}

// Mesaj inputu için placeholder
const inputPlaceholder = computed(() => {
  if (isGroup.value) {
    const name = groupDisplayName.value || t('group.noName')
    return t('dm.groupPlaceholder', { name })
  }
  return t('dm.placeholder', { user: dmChannel.value?.otherUser.username ?? '' })
})

// 1-1 DM: mesaj gönderme aktif mi?
const canMessage = computed(() => isGroup.value || (dmChannel.value?.canMessage ?? false))
const selfBlocked = computed(() => dmChannel.value?.selfBlocked ?? false)

// Emoji picker dışı tıklamada kapat
function onDmPickerDocClick() {
  activeEmojiPickerId.value = null
}

onMounted(() => {
  document.addEventListener('click', onDmPickerDocClick)
})
onUnmounted(() => {
  document.removeEventListener('click', onDmPickerDocClick)
})
</script>

<template>
  <div class="flex flex-1 min-w-0 overflow-hidden gap-4">
    <!-- Ana sohbet alanı -->
    <div
      class="flex flex-col flex-1 min-w-0 overflow-hidden mb-4 rounded-[var(--kv-radius-lg)]"
      style="background-color: var(--kv-bg-content);"
    >
      <!-- Başlık çubuğu -->
      <div
        class="flex items-center px-4 gap-3 shrink-0 border-b rounded-t-[var(--kv-radius-lg)]"
        style="height: var(--kv-header-height); border-color: var(--kv-border-subtle); background-color: var(--kv-bg-content);"
      >
        <!-- 1-1 DM başlığı -->
        <template v-if="dmChannel">
          <div
            class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-bold text-white"
            style="background-color: var(--kv-accent-500);"
          >
            <img
              v-if="dmChannel.otherUser.avatarUrl"
              :src="dmChannel.otherUser.avatarUrl"
              :alt="dmChannel.otherUser.username"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ dmChannel.otherUser.username[0].toUpperCase() }}</span>
          </div>
          <span class="flex-1 text-[15px] font-semibold truncate" style="color: var(--kv-text-primary);">
            {{ dmChannel.otherUser.username }}
          </span>
          <!-- Kullanıcıyı şikâyet et -->
          <button
            class="text-[12px] px-2 py-1 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            style="color: var(--kv-text-muted);"
            @mouseenter="($event.target as HTMLElement).style.color = 'var(--kv-danger)'"
            @mouseleave="($event.target as HTMLElement).style.color = 'var(--kv-text-muted)'"
            @click="openReportUser"
          >
            {{ t('report.reportUser') }}
          </button>
          <!-- Sohbeti temizle -->
          <button
            class="text-[12px] px-2 py-1 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            style="color: var(--kv-text-muted);"
            @mouseenter="($event.target as HTMLElement).style.color = 'var(--kv-text-secondary)'"
            @mouseleave="($event.target as HTMLElement).style.color = 'var(--kv-text-muted)'"
            @click="showClearConfirm = true"
          >
            {{ t('dm.clearConversation') }}
          </button>
        </template>

        <!-- GROUP_DM başlığı -->
        <template v-else-if="groupChannel">
          <!-- Grup ikonu (küçük çoklu avatar, 2 çember) -->
          <div class="relative w-9 h-8 shrink-0">
            <div
              v-if="groupChannel.members[1]"
              class="absolute bottom-0 right-0 w-6 h-6 rounded-full overflow-hidden border-2 flex items-center justify-center text-[9px] font-semibold text-white"
              style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-content);"
            >
              <img v-if="groupChannel.members[1].avatarUrl" :src="groupChannel.members[1].avatarUrl" :alt="groupChannel.members[1].username" class="w-full h-full object-cover" />
              <span v-else>{{ groupChannel.members[1].username[0].toUpperCase() }}</span>
            </div>
            <div
              class="absolute top-0 left-0 w-6 h-6 rounded-full overflow-hidden border-2 flex items-center justify-center text-[9px] font-semibold text-white"
              style="background-color: var(--kv-accent-500); border-color: var(--kv-bg-content);"
            >
              <img v-if="groupChannel.members[0]?.avatarUrl" :src="groupChannel.members[0].avatarUrl" :alt="groupChannel.members[0].username" class="w-full h-full object-cover" />
              <span v-else>{{ (groupChannel.members[0]?.username ?? '?')[0].toUpperCase() }}</span>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[15px] font-semibold truncate" style="color: var(--kv-text-primary);">
              {{ groupDisplayName }}
            </p>
            <p class="text-[12px]" style="color: var(--kv-text-muted);">
              {{ t('group.memberCount', { n: groupChannel.members.length }) }}
            </p>
          </div>
          <!-- Üye panelini aç/kapat -->
          <button
            class="text-[12px] px-2 py-1 rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
            style="color: var(--kv-text-muted);"
            :style="showGroupPanel ? 'color: var(--kv-text-primary);' : ''"
            @mouseenter="($event.target as HTMLElement).style.color = 'var(--kv-text-primary)'"
            @mouseleave="!showGroupPanel && (($event.target as HTMLElement).style.color = 'var(--kv-text-muted)')"
            @click="showGroupPanel = !showGroupPanel"
          >
            👥 {{ t('group.members') }}
          </button>
        </template>
      </div>

      <!-- Gerçek zamanlı hata bandı -->
      <div
        v-if="realtimeError"
        class="shrink-0 px-4 py-2 text-[13px] text-center"
        style="background-color: var(--kv-warning); color: var(--kv-bg-rail);"
      >
        {{ t('message.realtimeError') }}
      </div>

      <!-- Mesaj listesi -->
      <div ref="listEl" class="flex-1 overflow-y-auto py-4 flex flex-col gap-1">
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

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="flex px-4 py-0.5 group"
          :class="isMine(msg) ? 'flex-row-reverse' : 'flex-row'"
        >
          <!-- Grup başkasının mesajı: avatar + ad header satırı -->
          <template v-if="isGroup && !isMine(msg)">
            <div class="flex flex-col max-w-[70%] items-start">
              <!-- Header: avatar + üye adı aynı satırda -->
              <div class="flex items-center gap-2 mb-1">
                <div
                  class="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white"
                  style="background-color: var(--kv-accent-500);"
                >
                  <img
                    v-if="msg.author.avatarUrl"
                    :src="msg.author.avatarUrl"
                    :alt="msg.author.username"
                    class="w-full h-full object-cover"
                  />
                  <span v-else>{{ msg.author.username[0].toUpperCase() }}</span>
                </div>
                <span
                  class="text-[14px] font-semibold"
                  style="color: var(--kv-text-secondary);"
                >
                  {{ msg.author.username }}
                </span>
              </div>
              <!-- Baloncuk + ekler (aynı flex col içinde) -->
              <!-- Ek+açıklama → tek birim; yalnız ek → sadece ek; yalnız metin → baloncuk -->
              <template v-if="msg.attachments?.length && msg.content">
                <!-- Birleşik: ek üstte, açıklama altında, tek kapsayıcı -->
                <div class="overflow-hidden rounded-2xl rounded-bl-[4px]" style="max-width: 320px; background-color: var(--kv-bg-elevated);">
                  <AttachmentView
                    v-for="att in msg.attachments"
                    :key="att.id"
                    :attachment="att"
                    class="!mt-0"
                  />
                  <p class="px-4 pb-3 pt-1.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap" style="color: var(--kv-text-primary);">
                    {{ msg.content }}
                  </p>
                </div>
              </template>
              <template v-else>
                <div
                  v-if="msg.content"
                  class="px-4 py-2.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap rounded-2xl rounded-bl-[4px]"
                  style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);"
                >
                  {{ msg.content }}
                </div>
                <AttachmentView
                  v-for="att in msg.attachments"
                  :key="att.id"
                  :attachment="att"
                />
              </template>
              <!-- Reaksiyon pill'leri (grup) -->
              <div v-if="msg.reactions?.length" class="flex flex-wrap gap-1 mt-1 px-1">
                <button
                  v-for="reaction in msg.reactions"
                  :key="reaction.emoji"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] cursor-pointer transition-colors border"
                  :style="reaction.reactedByMe
                    ? 'background-color: var(--kv-accent-subtle); border-color: var(--kv-accent-500); color: var(--kv-accent-500);'
                    : 'background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle); color: var(--kv-text-secondary);'"
                  :title="t('reaction.toggleTitle')"
                  @click.stop="toggleDmReaction(msg, reaction.emoji, reaction.reactedByMe)"
                >
                  <span>{{ reaction.emoji }}</span>
                  <span class="font-medium">{{ reaction.count }}</span>
                </button>
              </div>
              <div class="flex items-center gap-2 px-1 mt-1">
                <span class="text-[11px]" style="color: var(--kv-text-muted);">
                  {{ formatTime(msg.createdAt) }}
                </span>
                <span v-if="msg.editedAt" class="text-[11px]" style="color: var(--kv-text-muted);">
                  {{ t('message.edited') }}
                </span>
                <!-- Reaksiyon ekle butonu (grup) -->
                <div class="relative">
                  <button
                    class="opacity-0 group-hover:opacity-100 transition-opacity text-[13px] cursor-pointer"
                    style="color: var(--kv-text-muted);"
                    :title="t('reaction.addReaction')"
                    @click.stop="toggleDmEmojiPicker(msg.id, $event)"
                  >
                    🙂
                  </button>
                  <div
                    v-if="activeEmojiPickerId === msg.id"
                    class="absolute bottom-full left-0 mb-1 z-50 flex gap-1 p-1.5 rounded-[var(--kv-radius-md)]"
                    style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
                    @click.stop
                  >
                    <button
                      v-for="emoji in EMOJI_SET"
                      :key="emoji"
                      class="text-[16px] w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--kv-bg-sidebar)]"
                      @click="pickDmEmoji(msg, emoji)"
                    >
                      {{ emoji }}
                    </button>
                  </div>
                </div>
                <button
                  class="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] cursor-pointer"
                  style="color: var(--kv-text-muted);"
                  :title="t('report.reportMessage')"
                  @click="openReportMessage(msg.id)"
                >
                  {{ t('report.reportMessage') }}
                </button>
              </div>
            </div>
          </template>

          <!-- 1-1 DM veya kendi mesajı -->
          <template v-else>
          <!-- Karşı tarafın küçük avatarı (1-1 DM) -->
          <div
            v-if="!isMine(msg)"
            class="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white self-end"
            style="background-color: var(--kv-accent-500);"
          >
            <img
              v-if="msg.author.avatarUrl"
              :src="msg.author.avatarUrl"
              :alt="msg.author.username"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ msg.author.username[0].toUpperCase() }}</span>
          </div>

          <!-- Baloncuk + ekler -->
          <div class="flex flex-col max-w-[70%]" :class="isMine(msg) ? 'items-end' : 'items-start'">
            <!-- Inline düzenleme modu (kendi mesajı) -->
            <template v-if="isMine(msg) && editState?.messageId === msg.id">
              <textarea
                ref="editTextareaEl"
                v-model="editState.content"
                rows="1"
                class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] resize-none outline-none border"
                style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui); max-height: 200px; min-width: 200px;"
                :disabled="editState.loading"
                @keydown="onEditKeydown"
                @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
              />
              <p v-if="editState.error" class="text-[12px] mt-1" style="color: var(--kv-danger);">{{ editState.error }}</p>
              <div class="flex gap-2 mt-1 text-[12px]" style="color: var(--kv-text-muted);">
                <span>{{ t('message.editHint') }}</span>
                <button class="underline cursor-pointer hover:opacity-80" style="color: var(--kv-danger);" @click="cancelEdit">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </template>
            <template v-else>
              <!-- Ek+açıklama → tek birim; yalnız ek → sadece ek; yalnız metin → baloncuk -->
              <template v-if="msg.attachments?.length && msg.content">
                <!-- Birleşik: ek üstte, açıklama altında, tek kapsayıcı -->
                <div
                  class="overflow-hidden"
                  :class="isMine(msg) ? 'rounded-2xl rounded-br-[4px]' : 'rounded-2xl rounded-bl-[4px]'"
                  :style="isMine(msg)
                    ? 'max-width: 320px; background-color: var(--kv-accent-500);'
                    : 'max-width: 320px; background-color: var(--kv-bg-elevated);'"
                >
                  <AttachmentView
                    v-for="att in msg.attachments"
                    :key="att.id"
                    :attachment="att"
                    class="!mt-0"
                  />
                  <p
                    class="px-4 pb-3 pt-1.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap"
                    :style="isMine(msg) ? 'color: #fff;' : 'color: var(--kv-text-primary);'"
                  >
                    {{ msg.content }}
                  </p>
                </div>
              </template>
              <template v-else>
                <div
                  v-if="msg.content"
                  class="px-4 py-2.5 text-[14px] leading-relaxed break-words whitespace-pre-wrap"
                  :class="isMine(msg)
                    ? 'rounded-2xl rounded-br-[4px]'
                    : 'rounded-2xl rounded-bl-[4px]'"
                  :style="isMine(msg)
                    ? 'background-color: var(--kv-accent-500); color: #fff;'
                    : 'background-color: var(--kv-bg-elevated); color: var(--kv-text-primary);'"
                >
                  {{ msg.content }}
                </div>
                <!-- Yalnız ek (açıklamasız) -->
                <AttachmentView
                  v-for="att in msg.attachments"
                  :key="att.id"
                  :attachment="att"
                />
              </template>
              <!-- Reaksiyon pill'leri (DM / kendi mesajı) -->
              <div v-if="msg.reactions?.length" class="flex flex-wrap gap-1 mt-1 px-1">
                <button
                  v-for="reaction in msg.reactions"
                  :key="reaction.emoji"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] cursor-pointer transition-colors border"
                  :style="reaction.reactedByMe
                    ? 'background-color: var(--kv-accent-subtle); border-color: var(--kv-accent-500); color: var(--kv-accent-500);'
                    : 'background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle); color: var(--kv-text-secondary);'"
                  :title="t('reaction.toggleTitle')"
                  @click.stop="toggleDmReaction(msg, reaction.emoji, reaction.reactedByMe)"
                >
                  <span>{{ reaction.emoji }}</span>
                  <span class="font-medium">{{ reaction.count }}</span>
                </button>
              </div>
              <div class="flex items-center gap-2 px-1 mt-1">
                <span class="text-[11px]" style="color: var(--kv-text-muted);">
                  {{ formatTime(msg.createdAt) }}
                </span>
                <span v-if="msg.editedAt" class="text-[11px]" style="color: var(--kv-text-muted);">
                  {{ t('message.edited') }}
                </span>
                <!-- Reaksiyon ekle butonu (DM) -->
                <div class="relative">
                  <button
                    class="opacity-0 group-hover:opacity-100 transition-opacity text-[13px] cursor-pointer"
                    style="color: var(--kv-text-muted);"
                    :title="t('reaction.addReaction')"
                    @click.stop="toggleDmEmojiPicker(msg.id, $event)"
                  >
                    🙂
                  </button>
                  <div
                    v-if="activeEmojiPickerId === msg.id"
                    class="absolute bottom-full mb-1 z-50 flex gap-1 p-1.5 rounded-[var(--kv-radius-md)]"
                    :class="isMine(msg) ? 'right-0' : 'left-0'"
                    style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
                    @click.stop
                  >
                    <button
                      v-for="emoji in EMOJI_SET"
                      :key="emoji"
                      class="text-[16px] w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors hover:bg-[var(--kv-bg-sidebar)]"
                      @click="pickDmEmoji(msg, emoji)"
                    >
                      {{ emoji }}
                    </button>
                  </div>
                </div>
                <!-- Kendi mesajı: düzenle (metin varsa) + sil hover butonları -->
                <template v-if="isMine(msg)">
                  <button
                    v-if="msg.content"
                    class="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] cursor-pointer"
                    style="color: var(--kv-text-muted);"
                    :title="t('message.edit')"
                    @click="startEdit(msg)"
                  >
                    {{ t('message.edit') }}
                  </button>
                  <button
                    class="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] cursor-pointer"
                    style="color: var(--kv-danger);"
                    :title="t('message.delete')"
                    @click="openDeleteConfirm(msg.id)"
                  >
                    {{ t('message.delete') }}
                  </button>
                </template>
                <!-- Mesaj şikâyet butonu — kendi mesajı değilse hover'da görünür -->
                <button
                  v-else
                  class="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] cursor-pointer"
                  style="color: var(--kv-text-muted);"
                  :title="t('report.reportMessage')"
                  @click="openReportMessage(msg.id)"
                >
                  {{ t('report.reportMessage') }}
                </button>
              </div>
            </template>
          </div>
          </template>
        </div>
      </div>

      <!-- Mesaj input / Engel bandı -->
      <div class="px-4 pb-4 pt-2 shrink-0">
        <!-- Gönderme hatası -->
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

        <!-- 1-1 DM: canMessage=false bandı -->
        <div
          v-if="!canMessage"
          class="flex items-center justify-center gap-3 py-3 rounded-[var(--kv-radius-md)] text-[13px]"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-muted);"
        >
          <span v-if="selfBlocked">{{ t('dm.selfBlocked') }}</span>
          <span v-else>{{ t('dm.cannotMessage') }}</span>
          <button
            v-if="selfBlocked"
            class="text-[13px] font-medium underline cursor-pointer transition-opacity hover:opacity-80"
            :class="unblocking ? 'opacity-60 pointer-events-none' : ''"
            style="color: var(--kv-accent-500);"
            @click="unblockUser"
          >
            {{ t('dm.unblock') }}
          </button>
        </div>

        <!-- Normal input -->
        <div v-else>
          <!-- Gizli dosya input -->
          <input
            ref="fileInputEl"
            type="file"
            class="hidden"
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain"
            @change="onFileSelected"
          />

          <div
            class="flex items-end gap-2 px-4 rounded-[var(--kv-radius-md)] border"
            style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-strong); min-height: 44px;"
          >
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
              :placeholder="inputPlaceholder"
              class="flex-1 py-3 bg-transparent text-[15px] resize-none outline-none"
              style="max-height: 50vh; font-family: var(--kv-font-ui); color: var(--kv-text-primary);"
              @keydown="onKeydown"
              @input="sendError = ''; onTypingInput(); ($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
              @blur="stopTyping"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Grup yönetim paneli (sağ kenar) -->
    <GroupManagePanel
      v-if="isGroup && showGroupPanel && groupChannel"
      :group-id="groupChannel.id"
      :group-name="groupChannel.name"
      :owner-id="groupChannel.ownerId"
      :members="groupChannel.members"
      @close="showGroupPanel = false"
      @left="emit('left')"
      @deleted="emit('deleted')"
    />
  </div>

  <!-- Sohbeti temizle onayı (1-1 DM) -->
  <ConfirmDialog
    v-if="showClearConfirm"
    :message="t('dm.clearConfirmMsg')"
    :confirm-label="t('dm.clearButton')"
    :loading="clearing"
    @confirm="clearConversation"
    @cancel="showClearConfirm = false"
  />

  <!-- Mesaj silme onayı -->
  <ConfirmDialog
    v-if="showDeleteConfirm"
    :message="t('message.deleteConfirm')"
    :confirm-label="t('message.delete')"
    :loading="deleteLoading"
    @confirm="confirmDelete"
    @cancel="showDeleteConfirm = false"
  />

  <!-- Dosya compose modal -->
  <AttachmentComposeModal
    v-if="composeFile"
    :file="composeFile"
    :channel-id="channel.id"
    @sent="onAttachmentSent"
    @close="composeFile = null"
  />

  <!-- Şikâyet modalı (mesaj veya kullanıcı) -->
  <ReportModal
    v-if="reportTargetId"
    :target-type="reportTargetType"
    :target-id="reportTargetId"
    @close="reportTargetId = null"
  />
</template>
