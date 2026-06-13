<script setup lang="ts">
/**
 * PinsPopover — "Sabitlenen Mesajlar" popover/panel (§7 contract).
 * TopBar veya DM başlığındaki 📌 butonuna tıklanınca açılır.
 * GET /channels/:id/pins ile liste çeker; WS güncellemesi parent tarafından triggerlanır.
 * Gölge yok, --kv-bg-elevated + ince kenarlık + --kv-radius-md.
 * Dışına tıkla / Esc kapat.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { messagesApi } from '@/api/messages'
import { useMessagesStore } from '@/stores/messages'
import type { MessageDto } from '@/types'

defineOptions({ name: 'PinsPopover' })

const props = defineProps<{
  channelId: string
  open: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const messagesStore = useMessagesStore()

const pins = ref<MessageDto[]>([])
const loading = ref(false)
const error = ref('')

async function loadPins() {
  if (!props.channelId) return
  loading.value = true
  error.value = ''
  try {
    const res = await messagesApi.fetchPins(props.channelId)
    pins.value = res.data
  } catch {
    error.value = t('common.error')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) loadPins()
  },
  { immediate: true },
)

// WS pin/unpin gelince (store güncellendi) → açık popover'ı tazele
watch(
  () => messagesStore.messagesByChannel[props.channelId],
  () => {
    if (props.open) loadPins()
  },
  { deep: true },
)

// Dışına tıkla / Esc kapat
const popoverEl = ref<HTMLElement | null>(null)

function onDocClick(e: MouseEvent) {
  if (popoverEl.value && !popoverEl.value.contains(e.target as Node)) {
    emit('close')
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      document.addEventListener('click', onDocClick)
      document.addEventListener('keydown', onDocKeydown)
    } else {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onDocKeydown)
    }
  },
)

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
}

// Parent, WS pin/unpin geldiğinde bunu çağırır (expose ile)
function refresh() {
  if (props.open) loadPins()
}
defineExpose({ refresh })
</script>

<template>
  <div
    v-if="open"
    ref="popoverEl"
    class="absolute top-full right-0 mt-2 z-50 w-[340px] max-h-[480px] flex flex-col overflow-hidden rounded-[var(--kv-radius-md)]"
    style="background-color: var(--kv-bg-elevated); border: 1px solid var(--kv-border-subtle);"
    @click.stop
  >
    <!-- Başlık -->
    <div
      class="flex items-center justify-between px-4 py-3 shrink-0 border-b"
      style="border-color: var(--kv-border-subtle);"
    >
      <span class="text-[14px] font-semibold" style="color: var(--kv-text-primary);">
        📌 {{ t('message.pinnedMessages') }}
      </span>
      <button
        class="w-6 h-6 flex items-center justify-center rounded text-[14px] cursor-pointer transition-colors"
        style="color: var(--kv-text-muted);"
        :title="t('common.close')"
        @mouseenter="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-primary)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.color = 'var(--kv-text-muted)'"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- İçerik -->
    <div class="flex-1 overflow-y-auto py-2">
      <!-- Yükleniyor -->
      <p
        v-if="loading"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('common.loading') }}
      </p>

      <!-- Hata -->
      <p
        v-else-if="error"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-danger);"
      >
        {{ error }}
      </p>

      <!-- Boş durum -->
      <p
        v-else-if="!pins.length"
        class="px-4 py-3 text-[13px]"
        style="color: var(--kv-text-muted);"
      >
        {{ t('message.pinnedMessagesEmpty') }}
      </p>

      <!-- Sabit mesajlar listesi -->
      <template v-else>
        <div
          v-for="pin in pins"
          :key="pin.id"
          class="flex gap-3 px-4 py-2.5 border-b last:border-b-0"
          style="border-color: var(--kv-border-subtle);"
        >
          <!-- Yazar avatarı (daire) -->
          <div
            class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold text-white"
            style="background-color: var(--kv-accent-500);"
          >
            <img
              v-if="pin.author.avatarUrl"
              :src="pin.author.avatarUrl"
              :alt="pin.author.username"
              class="w-full h-full object-cover"
            />
            <span v-else>{{ pin.author.username[0].toUpperCase() }}</span>
          </div>

          <!-- İçerik -->
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline gap-2 mb-0.5">
              <span class="text-[13px] font-semibold truncate" style="color: var(--kv-text-primary);">
                {{ pin.author.username }}
              </span>
              <span class="text-[11px] shrink-0" style="color: var(--kv-text-muted);">
                {{ formatDate(pin.createdAt) }}
              </span>
            </div>
            <p
              v-if="pin.content"
              class="text-[13px] break-words line-clamp-3"
              style="color: var(--kv-text-body);"
            >
              {{ pin.content }}
            </p>
            <p
              v-else-if="pin.attachments?.length"
              class="text-[13px] italic"
              style="color: var(--kv-text-muted);"
            >
              {{ pin.attachments[0].filename }}
            </p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
