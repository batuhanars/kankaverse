<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessagesStore } from '@/stores/messages'
import { useDmStore } from '@/stores/dm'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useSocket } from '@/composables/useSocket'
import { messagesApi } from '@/api/messages'
import { dmApi } from '@/api/dm'
import ConfirmDialog from '@/components/shared/ConfirmDialog.vue'
import type { FriendCodeUserDto, MessageDto } from '@/types'

const props = defineProps<{
  channelId: string
  otherUser: FriendCodeUserDto
  canMessage: boolean
  selfBlocked: boolean
}>()
const emit = defineEmits<{ cleared: [] }>()

const { t } = useI18n()
const messagesStore = useMessagesStore()
const dmStore = useDmStore()
const authStore = useAuthStore()
const friendsStore = useFriendsStore()
const { joinChannel, leaveChannel } = useSocket()

const content = ref('')
const sending = ref(false)
const listEl = ref<HTMLElement | null>(null)
const realtimeError = ref(false)
const showClearConfirm = ref(false)
const clearing = ref(false)
const unblocking = ref(false)

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
  if (!content.value.trim() || sending.value || !props.canMessage) return
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

function isMine(msg: MessageDto): boolean {
  return msg.author.id === authStore.user?.id
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

async function clearConversation() {
  clearing.value = true
  try {
    await dmApi.clearChannel(props.channelId)
    dmStore.removeChannel(props.channelId)
    emit('cleared')
  } finally {
    clearing.value = false
    showClearConfirm.value = false
  }
}

async function unblockUser() {
  unblocking.value = true
  try {
    await friendsStore.unblockUser(props.otherUser.id)
    await dmStore.fetchChannels()
  } finally {
    unblocking.value = false
  }
}
</script>

<template>
  <div
    class="flex flex-col flex-1 min-w-0 overflow-hidden mb-4 rounded-[var(--kv-radius-lg)]"
    style="background-color: var(--kv-bg-content);"
  >
    <!-- Başlık çubuğu: 64px -->
    <div
      class="h-16 flex items-center px-4 gap-3 shrink-0 border-b rounded-t-[var(--kv-radius-lg)]"
      style="border-color: var(--kv-border-subtle); background-color: var(--kv-bg-content);"
    >
      <div
        class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-bold text-white"
        style="background-color: var(--kv-accent-500);"
      >
        <img
          v-if="otherUser.avatarUrl"
          :src="otherUser.avatarUrl"
          :alt="otherUser.username"
          class="w-full h-full object-cover"
        />
        <span v-else>{{ otherUser.username[0].toUpperCase() }}</span>
      </div>
      <span class="flex-1 text-[15px] font-semibold truncate" style="color: var(--kv-text-primary);">
        {{ otherUser.username }}
      </span>
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
    </div>

    <!-- Gerçek zamanlı hata bandı -->
    <div
      v-if="realtimeError"
      class="shrink-0 px-4 py-2 text-[13px] text-center"
      style="background-color: var(--kv-warning); color: var(--kv-bg-rail);"
    >
      {{ t('message.realtimeError') }}
    </div>

    <!-- Mesaj listesi: DM baloncukları -->
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
        class="flex items-end gap-2 px-4 py-0.5"
        :class="isMine(msg) ? 'flex-row-reverse' : 'flex-row'"
      >
        <!-- Karşı tarafın küçük avatarı -->
        <div
          v-if="!isMine(msg)"
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

        <!-- Baloncuk -->
        <div class="flex flex-col max-w-[70%]" :class="isMine(msg) ? 'items-end' : 'items-start'">
          <div
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
          <span class="text-[11px] mt-1 px-1" style="color: var(--kv-text-muted);">
            {{ formatTime(msg.createdAt) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Mesaj input / Engel bandı -->
    <div class="px-4 pb-4 pt-2 shrink-0">
      <!-- canMessage=false bandı -->
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
      <div
        v-else
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

  <!-- Sohbeti temizle onayı -->
  <ConfirmDialog
    v-if="showClearConfirm"
    :message="t('dm.clearConfirmMsg')"
    :confirm-label="t('dm.clearButton')"
    :loading="clearing"
    @confirm="clearConversation"
    @cancel="showClearConfirm = false"
  />
</template>
