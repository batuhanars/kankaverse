<script setup lang="ts">
/**
 * ForwardMessageModal — bir mesajı başka bir DM'e/gruba ilet.
 * DM listesinden hedef seç → mesaj içeriğini o kanala gönder. (Görsel ek iletme MVP'de yok;
 * içeriksiz mesajda ek dosya adı metni iletilir.)
 */
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDmStore } from '@/stores/dm'
import { useToastStore } from '@/stores/toast'
import { messagesApi } from '@/api/messages'
import KvModal from '@/components/ui/KvModal.vue'
import type { MessageDto, DmChannelDto } from '@/types'

const props = defineProps<{ message: MessageDto }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const dmStore = useDmStore()
const toast = useToastStore()

const query = ref('')
const sendingId = ref<string | null>(null)
const sentIds = ref<Set<string>>(new Set())

// İletilecek metin: içerik; yoksa ilk ek dosya adı
const forwardText = computed(() => {
  const c = props.message.content?.trim()
  if (c) return c
  return props.message.attachments?.[0]?.filename ?? ''
})

function channelName(c: DmChannelDto): string {
  if (c.type === 'DM') return c.otherUser.username
  return c.name || c.members.map((m) => m.username).join(', ')
}
function channelAvatar(c: DmChannelDto): string | null {
  return c.type === 'DM' ? c.otherUser.avatarUrl : null
}
function channelInitial(c: DmChannelDto): string {
  return channelName(c).charAt(0).toUpperCase()
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return dmStore.channels.filter((c) => !q || channelName(c).toLowerCase().includes(q))
})

async function forwardTo(c: DmChannelDto) {
  if (sendingId.value || sentIds.value.has(c.id) || !forwardText.value) return
  sendingId.value = c.id
  try {
    await messagesApi.send(c.id, forwardText.value)
    sentIds.value = new Set([...sentIds.value, c.id])
    toast.success(t('message.forwarded'))
  } catch {
    toast.error(t('toast.saveError'))
  } finally {
    sendingId.value = null
  }
}

onMounted(() => {
  if (!dmStore.channels.length) dmStore.fetchChannels().catch(() => {})
})
</script>

<template>
  <KvModal :title="t('message.forwardTitle')" @close="emit('close')">
    <div class="flex flex-col gap-3 min-w-0" style="width: 360px; max-width: 100%;">
      <!-- İletilecek mesaj önizlemesi -->
      <div
        class="px-3 py-2 rounded-[var(--kv-radius-md)] text-[13px] line-clamp-2"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
      >
        {{ forwardText || t('message.forwardEmpty') }}
      </div>

      <!-- Arama -->
      <input
        v-model="query"
        type="text"
        class="w-full px-3 py-2 rounded-[var(--kv-radius-md)] text-[14px] outline-none border"
        style="background-color: var(--kv-bg-content); color: var(--kv-text-primary); border-color: var(--kv-border-strong);"
        :placeholder="t('message.forwardSearch')"
      />

      <!-- DM listesi -->
      <div class="max-h-72 overflow-y-auto flex flex-col -mx-1">
        <button
          v-for="c in filtered"
          :key="c.id"
          class="flex items-center gap-2.5 px-2 py-2 rounded-[var(--kv-radius-md)] text-left transition-colors hover:bg-[var(--kv-accent-subtle)]"
          :disabled="!forwardText || sendingId === c.id"
          @click="forwardTo(c)"
        >
          <div
            class="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-semibold text-white"
            style="background-color: var(--kv-accent-500);"
          >
            <img v-if="channelAvatar(c)" :src="channelAvatar(c)!" :alt="channelName(c)" class="w-full h-full object-cover" />
            <span v-else>{{ channelInitial(c) }}</span>
          </div>
          <span class="flex-1 truncate text-[14px]" style="color: var(--kv-text-primary);">{{ channelName(c) }}</span>
          <span
            v-if="sentIds.has(c.id)"
            class="shrink-0 text-[12px] font-medium"
            style="color: var(--kv-online, #3DB46E);"
          >{{ t('message.forwardedShort') }}</span>
          <span v-else-if="sendingId === c.id" class="shrink-0 text-[12px]" style="color: var(--kv-text-muted);">…</span>
        </button>

        <p v-if="!filtered.length" class="px-2 py-4 text-[13px]" style="color: var(--kv-text-muted);">
          {{ t('message.forwardNoChannels') }}
        </p>
      </div>
    </div>
  </KvModal>
</template>
