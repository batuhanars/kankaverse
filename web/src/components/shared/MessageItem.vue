<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { messagesApi } from '@/api/messages'
import MessageRow from './MessageRow.vue'
import UserCardPopover from './UserCardPopover.vue'
import ReportModal from './ReportModal.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import type { MessageDto } from '@/types'

const props = defineProps<{
  message: MessageDto
  isGroupStart: boolean
}>()
const emit = defineEmits<{ reply: [message: MessageDto] }>()

const { t } = useI18n()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()

const isMine = computed(() => props.message.author.id === authStore.user?.id)

// Kullanıcı kartı popover (yazar adına tıklama — MessageRow gelecekte emit ile bağlanabilir)
const showCard = ref(false)
const cardX = ref(0)
const cardY = ref(0)

// Şikâyet modalı
const showReportModal = ref(false)

// Düzenleme durumu
const editing = ref(false)
const editContent = ref('')
const editLoading = ref(false)
const editError = ref('')
const editTextareaEl = ref<HTMLTextAreaElement | null>(null)

// Silme durumu
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)

// Reaksiyon
async function addReaction(_msgId: string, emoji: string) {
  try {
    await messagesApi.addReaction(props.message.channelId, props.message.id, emoji)
    // Store güncellemesi useSocket reaction.added handler'ından gelir
  } catch {
    // sessizce yut
  }
}

async function toggleReaction(emoji: string, reactedByMe: boolean) {
  try {
    if (reactedByMe) {
      await messagesApi.removeReaction(props.message.channelId, props.message.id, emoji)
    } else {
      await messagesApi.addReaction(props.message.channelId, props.message.id, emoji)
    }
    // Store güncellemesi useSocket reaction.added/reaction.removed handler'ından gelir
  } catch {
    // sessizce yut
  }
}

// Kullanıcı kartı
function closeCard() {
  showCard.value = false
}

// Düzenleme
function startEdit() {
  editContent.value = props.message.content
  editError.value = ''
  editing.value = true
  nextTick(() => {
    if (editTextareaEl.value) {
      editTextareaEl.value.focus()
      editTextareaEl.value.style.height = 'auto'
      editTextareaEl.value.style.height = editTextareaEl.value.scrollHeight + 'px'
    }
  })
}

function cancelEdit() {
  editing.value = false
  editError.value = ''
}

async function saveEdit() {
  const trimmed = editContent.value.trim()
  if (!trimmed || editLoading.value) return
  editLoading.value = true
  editError.value = ''
  try {
    const { data } = await messagesApi.editMessage(
      props.message.channelId,
      props.message.id,
      trimmed,
    )
    messagesStore.updateMessage(data)
    editing.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    const code = err.response?.data?.error
    editError.value =
      code === 'MESSAGE_BLOCKED' ? t('message.errors.MESSAGE_BLOCKED') : t('common.error')
  } finally {
    editLoading.value = false
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

// Silme
function openDeleteConfirm() {
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  deleteLoading.value = true
  try {
    await messagesApi.deleteMessage(props.message.channelId, props.message.id)
    messagesStore.removeMessage(props.message.channelId, props.message.id)
  } catch {
    // Sunucu hatası — WS zaten kaldıracak
  } finally {
    deleteLoading.value = false
    showDeleteConfirm.value = false
  }
}

onMounted(() => {
  window.addEventListener('kv:close-user-cards', closeCard)
})
onUnmounted(() => {
  window.removeEventListener('kv:close-user-cards', closeCard)
})
</script>

<template>
  <MessageRow
    :message="message"
    :is-mine="isMine"
    :is-group-start="isGroupStart"
    :is-editing="editing"
    @reply="emit('reply', $event)"
    @edit="startEdit"
    @delete="openDeleteConfirm"
    @report="showReportModal = true"
    @add-reaction="addReaction"
  >
    <!-- Düzenleme modu -->
    <template #editing>
      <div v-if="editing" class="mt-1">
        <textarea
          ref="editTextareaEl"
          v-model="editContent"
          rows="1"
          class="w-full px-3 py-2 rounded-[var(--kv-radius-sm)] text-[14px] resize-none outline-none border"
          style="background-color: var(--kv-bg-elevated); color: var(--kv-text-primary); border-color: var(--kv-border-strong); font-family: var(--kv-font-ui); max-height: 200px;"
          :disabled="editLoading"
          @keydown="onEditKeydown"
          @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
        />
        <p v-if="editError" class="text-[12px] mt-1" style="color: var(--kv-danger);">{{ editError }}</p>
        <div class="flex gap-2 mt-1 text-[12px]" style="color: var(--kv-text-muted);">
          <span>{{ t('message.editHint') }}</span>
          <button
            class="underline cursor-pointer hover:opacity-80"
            style="color: var(--kv-danger);"
            @click="cancelEdit"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </template>

    <!-- Reaksiyon pill'leri (guild kanalı) -->
    <template #reactions>
      <button
        v-for="reaction in message.reactions"
        :key="reaction.emoji"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] cursor-pointer transition-colors border"
        :style="reaction.reactedByMe
          ? 'background-color: var(--kv-accent-subtle); border-color: var(--kv-accent-500); color: var(--kv-accent-500);'
          : 'background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle); color: var(--kv-text-secondary);'"
        :title="t('reaction.toggleTitle')"
        @click.stop="toggleReaction(reaction.emoji, reaction.reactedByMe)"
      >
        <span>{{ reaction.emoji }}</span>
        <span class="text-[12px] font-medium">{{ reaction.count }}</span>
      </button>
    </template>
  </MessageRow>

  <!-- Kullanıcı kartı (yazar adına tıklama — yalnız grup başında görünür) -->
  <UserCardPopover
    v-if="showCard"
    :user-id="message.author.id"
    :x="cardX"
    :y="cardY"
    @close="showCard = false"
  />

  <!-- Mesaj şikâyet modalı -->
  <ReportModal
    v-if="showReportModal"
    target-type="MESSAGE"
    :target-id="message.id"
    @close="showReportModal = false"
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
</template>
