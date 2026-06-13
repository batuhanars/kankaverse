<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { messagesApi } from '@/api/messages'
import UserAvatar from './UserAvatar.vue'
import UserCardPopover from './UserCardPopover.vue'
import AttachmentView from './AttachmentView.vue'
import ReportModal from './ReportModal.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import type { MessageDto } from '@/types'

const props = defineProps<{ message: MessageDto }>()

const { t } = useI18n()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()

const timeStr = computed(() => {
  const d = new Date(props.message.createdAt)
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
})

const showCard = ref(false)
const cardX = ref(0)
const cardY = ref(0)
const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
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

// Kendi mesajını şikayet etme
const isMine = computed(() => props.message.author.id === authStore.user?.id)

function closeCard() {
  showCard.value = false
}

function onAuthorClick(e: MouseEvent) {
  window.dispatchEvent(new CustomEvent('kv:close-user-cards'))
  cardX.value = e.clientX
  cardY.value = e.clientY
  showCard.value = true
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  showMenu.value = true
  menuX.value = e.clientX
  menuY.value = e.clientY
}

function openReportModal() {
  showMenu.value = false
  showReportModal.value = true
}

function startEdit() {
  showMenu.value = false
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
    const { data } = await messagesApi.editMessage(props.message.channelId, props.message.id, trimmed)
    messagesStore.updateMessage(data)
    editing.value = false
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: string } } }
    const code = err.response?.data?.error
    editError.value = code === 'MESSAGE_BLOCKED'
      ? t('message.errors.MESSAGE_BLOCKED')
      : t('common.error')
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

function openDeleteConfirm() {
  showMenu.value = false
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  deleteLoading.value = true
  try {
    await messagesApi.deleteMessage(props.message.channelId, props.message.id)
    messagesStore.removeMessage(props.message.channelId, props.message.id)
  } catch {
    // Sunucu hatası — WS zaten kaldıracak; sessizce yut
  } finally {
    deleteLoading.value = false
    showDeleteConfirm.value = false
  }
}

function onDocClick(e: MouseEvent) {
  const menu = document.getElementById('kv-msg-ctx-menu')
  if (menu && !menu.contains(e.target as Node)) {
    showMenu.value = false
  }
}

onMounted(() => {
  window.addEventListener('kv:close-user-cards', closeCard)
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => {
  window.removeEventListener('kv:close-user-cards', closeCard)
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div
    class="flex gap-3 px-4 py-1 hover:bg-[var(--kv-bg-elevated)] rounded group"
    @contextmenu="onContextMenu"
  >
    <button class="shrink-0 cursor-pointer" @click="onAuthorClick">
      <UserAvatar :username="message.author.username" :avatar-url="message.author.avatarUrl" />
    </button>
    <div class="flex flex-col min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <button
          class="text-[14px] font-semibold hover:underline cursor-pointer text-left"
          style="color:var(--kv-text-primary);"
          @click="onAuthorClick"
        >
          {{ message.author.username }}
        </button>
        <span class="text-[11px] text-[var(--kv-text-muted)]">{{ timeStr }}</span>
        <!-- "(düzenlendi)" etiketi -->
        <span
          v-if="message.editedAt"
          class="text-[11px]"
          style="color: var(--kv-text-muted);"
        >
          {{ t('message.edited') }}
        </span>
        <!-- Şikâyet hover butonu (kendi mesajı değilse) -->
        <button
          v-if="!isMine"
          class="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[12px] cursor-pointer px-2 py-0.5 rounded"
          style="color: var(--kv-text-muted);"
          :title="t('report.reportMessage')"
          @click.stop="openReportModal"
        >
          {{ t('report.reportMessage') }}
        </button>
        <!-- Düzenle / Sil hover butonları (kendi mesajı) -->
        <template v-if="isMine && !editing">
          <button
            class="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[12px] cursor-pointer px-2 py-0.5 rounded"
            style="color: var(--kv-text-muted);"
            :title="t('message.edit')"
            @click.stop="startEdit"
          >
            {{ t('message.edit') }}
          </button>
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity text-[12px] cursor-pointer px-2 py-0.5 rounded"
            style="color: var(--kv-danger);"
            :title="t('message.delete')"
            @click.stop="openDeleteConfirm"
          >
            {{ t('message.delete') }}
          </button>
        </template>
      </div>

      <!-- Inline düzenleme modu -->
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

      <!-- Normal mesaj içeriği -->
      <template v-else>
        <p
          v-if="message.content"
          class="text-[14px] text-[var(--kv-text-body)] break-words whitespace-pre-wrap"
        >
          {{ message.content }}
        </p>
        <!-- Sprint 5 §7: Attachment'lar -->
        <AttachmentView
          v-for="att in message.attachments"
          :key="att.id"
          :attachment="att"
        />
      </template>
    </div>
  </div>

  <!-- Sağ tık bağlam menüsü -->
  <Teleport v-if="showMenu" to="body">
    <div
      id="kv-msg-ctx-menu"
      class="fixed z-50 rounded-[var(--kv-radius-md)] py-1 min-w-[160px]"
      :style="`top:${menuY}px;left:${menuX}px;background-color:var(--kv-bg-elevated);border:1px solid var(--kv-border-subtle);`"
    >
      <!-- Kendi mesajı: düzenle + sil -->
      <template v-if="isMine">
        <button
          class="w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-bg-sidebar)]"
          style="color: var(--kv-text-primary);"
          @click="startEdit"
        >
          {{ t('message.edit') }}
        </button>
        <button
          class="w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-bg-sidebar)]"
          style="color: var(--kv-danger);"
          @click="openDeleteConfirm"
        >
          {{ t('message.delete') }}
        </button>
      </template>
      <!-- Başkasının mesajı: şikâyet -->
      <button
        v-else
        class="w-full text-left px-3 py-2 text-[13px] cursor-pointer transition-colors hover:bg-[var(--kv-bg-sidebar)]"
        style="color: var(--kv-danger);"
        @click="openReportModal"
      >
        {{ t('report.reportMessage') }}
      </button>
    </div>
  </Teleport>

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
