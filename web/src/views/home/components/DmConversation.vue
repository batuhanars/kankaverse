<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useSocket } from '@/composables/useSocket'
import { useTyping, useTypingLabel } from '@/composables/useTyping'
import { useMentionAutocomplete } from '@/composables/useMentionAutocomplete'
import { messagesApi } from '@/api/messages'
import { dmApi } from '@/api/dm'
import { formatMentionsPlain } from '@/utils/mentions'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import AttachmentComposeModal from '@/components/shared/AttachmentComposeModal.vue'
import ReportModal from '@/components/shared/ReportModal.vue'
import EmojiPicker from '@/components/shared/EmojiPicker.vue'
import MessageRow from '@/components/shared/MessageRow.vue'
import PinsPopover from '@/components/shared/PinsPopover.vue'
import GroupManagePanel from './GroupManagePanel.vue'
import type { DmChannelDto, MessageDto } from '@/types'

// Yanıt state
const replyingTo = ref<MessageDto | null>(null)

function startReply(msg: MessageDto) {
  replyingTo.value = msg
  nextTick(() => dmTextareaEl.value?.focus())
}

function cancelReply() {
  replyingTo.value = null
}

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

// Compose picker
const showComposeEmojiPicker = ref(false)
const dmTextareaEl = ref<HTMLTextAreaElement | null>(null)

async function pickDmEmoji(msg: MessageDto, emoji: string) {
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

// Sprint V2: mention üye kaynağı — DM bağlamına göre
// 1-1 DM: karşı kullanıcı; GROUP_DM: grup üyeleri
const dmMentionMembers = computed(() => {
  if (props.channel.type === 'DM') {
    return [{ id: props.channel.otherUser.id, username: props.channel.otherUser.username, avatarUrl: props.channel.otherUser.avatarUrl }]
  }
  // GROUP_DM
  return props.channel.members.map((m) => ({ id: m.id, username: m.username, avatarUrl: m.avatarUrl }))
})

// Sprint V2: mention çözücü — userId → username (DM katılımcıları)
function dmMentionResolver(userId: string): string {
  const member = dmMentionMembers.value.find((m) => m.id === userId)
  if (member) return member.username
  // Gönderen kendisi de olabilir
  if (userId === authStore.user?.id) return authStore.user.username
  return t('mention.unknown')
}

// Sprint V2: kendi-bahsedilme vurgusu (DM bağlamı)
function isDmMentioned(msg: MessageDto): boolean {
  return !!(msg.mentions?.includes(authStore.user?.id ?? ''))
}

// Sprint V2: mention autocomplete
const mention = useMentionAutocomplete(
  dmMentionMembers,
  () => content.value,
  (v) => { content.value = v },
  () => dmTextareaEl.value?.selectionStart ?? 0,
  (pos) => { nextTick(() => { dmTextareaEl.value?.setSelectionRange(pos, pos) }) },
)

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
  const replyId = replyingTo.value?.id
  replyingTo.value = null
  try {
    const { data } = await messagesApi.send(props.channel.id, caption, replyId, [attachmentId])
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
  // Sprint V2: @username → <@userId> dönüşümü gönderimden önce
  const text = mention.applyMentionTokens(content.value.trim())
  mention.clearPending()
  content.value = ''
  const replyId = replyingTo.value?.id
  replyingTo.value = null
  try {
    const { data } = await messagesApi.send(props.channel.id, text, replyId)
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
  // Sprint V2: mention popover açıkken ↑/↓/Enter/Tab/Esc → autocomplete'e yönlendir
  if (mention.onKeydown(e)) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function onDmTextareaInput() {
  sendError.value = ''
  onTypingInput()
  const el = dmTextareaEl.value
  if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  // Sprint V2: mention autocomplete tetikle
  mention.onInput()
}

function isMine(msg: MessageDto): boolean {
  return msg.author.id === authStore.user?.id
}

// Sprint V2 Pins: DM/grup DM'de herkes sabitleyebilir (§2)
const showDmPins = ref(false)

function toggleDmPins(e: MouseEvent) {
  e.stopPropagation()
  showDmPins.value = !showDmPins.value
}

async function onPinMessage(messageId: string) {
  try {
    await messagesApi.pinMessage(props.channel.id, messageId)
    // State güncellemesi WS message.pinned ile gelir; popover da WS refresh ile tazelenir
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    if (err.response?.data?.error === 'PIN_LIMIT') {
      // PIN_LIMIT hatasını kullanıcıya gösterecek bir mekanizma yok şimdi;
      // WS echo gelmediği için store değişmez — kullanıcı zaten menüyü açar ve sabitleme olmaz.
      // Geliştirme notu: sonraki dalga — toast/snackbar ile göster.
    }
  }
}

async function onUnpinMessage(messageId: string) {
  try {
    await messagesApi.unpinMessage(props.channel.id, messageId)
  } catch {
    // sessizce yut — WS echo gelmezse state değişmez
  }
}

// formatTime: DM input bandında hâlâ kullanılmıyor ama MessageRow içinde kendi formatTime'ı var.
// Silmek yerine kullanılmayan olarak işaretle — TypeScript strict modunda kaldır.
// function formatTime(iso: string): string {
//   return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
// }

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

// Compose emoji picker
function toggleComposeEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  showComposeEmojiPicker.value = !showComposeEmojiPicker.value
}

function onDmComposeEmojiSelect(emoji: string) {
  showComposeEmojiPicker.value = false
  const el = dmTextareaEl.value
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

// Compose emoji picker dışı tıklamada kapat
function onDmPickerDocClick(e: MouseEvent) {
  const composePicker = document.getElementById('kv-dm-compose-emoji-picker')
  if (composePicker && composePicker.contains(e.target as Node)) return
  showComposeEmojiPicker.value = false
}

onMounted(() => {
  document.addEventListener('click', onDmPickerDocClick)
})
onUnmounted(() => {
  document.removeEventListener('click', onDmPickerDocClick)
})

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
          <!-- Sabitlenen mesajlar butonu -->
          <div class="relative">
            <button
              class="w-8 h-8 flex items-center justify-center text-[16px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              :class="showDmPins ? 'bg-[var(--kv-accent-subtle)]' : ''"
              :style="showDmPins ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
              :title="t('message.pinnedMessages')"
              @mouseenter="!showDmPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)')"
              @mouseleave="!showDmPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)')"
              @click="toggleDmPins"
            >
              📌
            </button>
            <PinsPopover
              :channel-id="channel.id"
              :open="showDmPins"
              @close="showDmPins = false"
            />
          </div>
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
          <!-- Sabitlenen mesajlar butonu (GROUP_DM) -->
          <div class="relative">
            <button
              class="w-8 h-8 flex items-center justify-center text-[16px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer"
              :class="showDmPins ? 'bg-[var(--kv-accent-subtle)]' : ''"
              :style="showDmPins ? 'color: var(--kv-accent-500);' : 'color: var(--kv-text-muted);'"
              :title="t('message.pinnedMessages')"
              @mouseenter="!showDmPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)')"
              @mouseleave="!showDmPins && (($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)')"
              @click="toggleDmPins"
            >
              📌
            </button>
            <PinsPopover
              :channel-id="channel.id"
              :open="showDmPins"
              @close="showDmPins = false"
            />
          </div>
          <!-- Üye panelini aç/kapat -->
          <button
            :class="[
              'px-3 py-1 text-[13px] rounded-[var(--kv-radius-sm)] transition-colors cursor-pointer',
              showGroupPanel
                ? 'bg-[var(--kv-accent-subtle)] text-[var(--kv-accent-500)]'
                : 'text-[var(--kv-text-secondary)] hover:text-[var(--kv-text-body)]',
            ]"
            @click="showGroupPanel = !showGroupPanel"
          >
            {{ t('group.members') }}
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

      <!-- Mesaj listesi (Discord stili — baloncuk yok, sola yaslı düz liste) -->
      <div ref="listEl" class="flex-1 overflow-y-auto py-4 flex flex-col">
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

        <MessageRow
          v-for="(msg, index) in messages"
          :key="msg.id"
          :message="msg"
          :is-mine="isMine(msg)"
          :is-group-start="isGroupStart(index)"
          :is-editing="isMine(msg) && editState?.messageId === msg.id"
          :mention-resolver="dmMentionResolver"
          :is-mentioned="isDmMentioned(msg)"
          :can-pin="true"
          @reply="startReply"
          @edit="startEdit"
          @delete="openDeleteConfirm"
          @report="openReportMessage"
          @add-reaction="(_msgId, emoji) => pickDmEmoji(msg, emoji)"
          @pin="onPinMessage"
          @unpin="onUnpinMessage"
        >
          <!-- Inline düzenleme modu (kendi mesajı) -->
          <template #editing>
            <div v-if="isMine(msg) && editState?.messageId === msg.id" class="mt-1">
              <textarea
                ref="editTextareaEl"
                v-model="editState!.content"
                rows="1"
                class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] resize-none outline-none border"
                style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui); max-height: 200px;"
                :disabled="editState!.loading"
                @keydown="onEditKeydown"
                @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
              />
              <p v-if="editState!.error" class="text-[12px] mt-1" style="color: var(--kv-danger);">{{ editState!.error }}</p>
              <div class="flex gap-2 mt-1 text-[12px]" style="color: var(--kv-text-muted);">
                <span>{{ t('message.editHint') }}</span>
                <button class="underline cursor-pointer hover:opacity-80" style="color: var(--kv-danger);" @click="cancelEdit">
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
          </template>

          <!-- Reaksiyon pill'leri -->
          <template #reactions>
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
          </template>
        </MessageRow>
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

          <!-- Yanıt önizleme bandı -->
          <div
            v-if="replyingTo"
            class="flex items-center gap-2 px-3 py-1.5 rounded-t-[var(--kv-radius-sm)] text-[12px] truncate"
            style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle); border-bottom: none;"
          >
            <span class="shrink-0" style="color: var(--kv-text-muted);">↩</span>
            <span class="font-semibold shrink-0" style="color: var(--kv-text-secondary);">{{ t('reply.to', { author: replyingTo.author.username }) }}</span>
            <span class="truncate" style="color: var(--kv-text-muted);">— {{ formatMentionsPlain(replyingTo.content, dmMentionResolver, t('mention.unknown')) }}</span>
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
            <button
              type="button"
              class="shrink-0 w-8 h-8 flex items-center justify-center rounded-[var(--kv-radius-sm)] cursor-pointer transition-colors"
              style="color: var(--kv-text-secondary);"
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
                ref="dmTextareaEl"
                v-model="content"
                rows="1"
                :placeholder="inputPlaceholder"
                class="w-full bg-transparent text-[15px] resize-none outline-none"
                style="max-height: 50vh; font-family: var(--kv-font-ui); color: var(--kv-text-primary); line-height: 1.5; padding-top: 10px; padding-bottom: 10px;"
                @keydown="onKeydown"
                @input="onDmTextareaInput"
                @blur="stopTyping"
              />
            </div>
            <!-- Emoji (😊) butonu -->
            <div class="relative shrink-0 self-center">
              <button
                type="button"
                class="py-1 px-1 cursor-pointer hover:opacity-80 transition-opacity"
                style="color: var(--kv-text-muted); font-size: 18px; line-height: 1;"
                :aria-label="t('message.emojiButton')"
                @click.stop="toggleComposeEmojiPicker"
              >
                😊
              </button>
              <div
                v-if="showComposeEmojiPicker"
                id="kv-dm-compose-emoji-picker"
                class="absolute bottom-full right-0 mb-2 z-50"
                @click.stop
              >
                <EmojiPicker @select="onDmComposeEmojiSelect" />
              </div>
            </div>
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
