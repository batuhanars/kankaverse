<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import UserAvatar from './UserAvatar.vue'
import UserCardPopover from './UserCardPopover.vue'
import AttachmentView from './AttachmentView.vue'
import ReportModal from './ReportModal.vue'
import type { MessageDto } from '@/types'

const props = defineProps<{ message: MessageDto }>()

const { t } = useI18n()
const authStore = useAuthStore()

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
  if (isMine.value) return
  e.preventDefault()
  showMenu.value = true
  menuX.value = e.clientX
  menuY.value = e.clientY
}

function openReportModal() {
  showMenu.value = false
  showReportModal.value = true
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
      </div>
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
    </div>
  </div>

  <!-- Sağ tık bağlam menüsü -->
  <Teleport v-if="showMenu && !isMine" to="body">
    <div
      id="kv-msg-ctx-menu"
      class="fixed z-50 rounded-[var(--kv-radius-md)] py-1 min-w-[160px]"
      :style="`top:${menuY}px;left:${menuX}px;background-color:var(--kv-bg-elevated);border:1px solid var(--kv-border-subtle);`"
    >
      <button
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
</template>
