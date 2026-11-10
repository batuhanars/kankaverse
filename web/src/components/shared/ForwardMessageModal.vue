<script setup lang="ts">
/**
 * ForwardMessageModal — bir mesajı başka bir DM'e/gruba ilet.
 * DM listesinden hedef seç → mesajın metni + her eki o kanala gönderilir.
 *
 * C30: ekler sunucuda KOPYALANIR (`POST /attachments/:id/forward` → yeni ek kimliği), sonra normal
 * mesaj gönderimiyle (`attachmentIds`) hedefe bağlanır. İstemci dosyayı indirip yeniden yüklemez.
 * Kapılar (kaynak kanal erişimi, tarama, hedef kanal kuralları) sunucuda; ret mesajı toast'ta.
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast'
import { messagesApi } from '@/api/messages'
import { attachmentsApi } from '@/api/attachments'
import KvModal from '@/components/ui/KvModal.vue'
import DmTargetList from '@/components/shared/DmTargetList.vue'
import { useAttachmentThumb } from '@/composables/useAttachmentThumb'
import type { MessageDto, DmChannelDto } from '@/types'

const props = defineProps<{ message: MessageDto }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const toast = useToastStore()

const sendingId = ref<string | null>(null)
const sentIds = ref<Set<string>>(new Set())

const forwardText = computed(() => props.message.content?.trim() ?? '')
const attachments = computed(() => props.message.attachments ?? [])
// Metin de ek de yoksa iletilecek bir şey yok (bugünkü boş durum)
const hasContent = computed(() => !!forwardText.value || attachments.value.length > 0)

// Önizleme: ilk ek (birden fazlaysa "+N dosya" sayacı). Görsel için küçük resim adresi sunucudan,
// video için mesajdaki kare; diğerleri dosya simgesi + adı.
const firstAttachment = computed(() => attachments.value[0] ?? null)
const previewThumb = useAttachmentThumb(() => firstAttachment.value)

async function forwardTo(c: DmChannelDto) {
  if (sendingId.value || sentIds.value.has(c.id) || !hasContent.value) return
  sendingId.value = c.id
  try {
    // Her hedef kendi kopyalarını alır (ek tek mesaja bağlanır). Paralel kopya; biri reddedilirse
    // hedef "gönderildi" işaretlenmez (kopyalanıp bağlanmayan ek sahipsiz kalır, presign'daki gibi).
    const copies = await Promise.all(attachments.value.map((a) => attachmentsApi.forward(a.id)))
    const attachmentIds = copies.map((r) => r.data.attachmentId)
    await messagesApi.send(c.id, forwardText.value, undefined, attachmentIds)
    sentIds.value = new Set([...sentIds.value, c.id])
    toast.success(t('message.forwarded'))
  } catch (e: unknown) {
    const serverMessage = (e as { response?: { data?: { message?: string } } }).response?.data?.message
    toast.error(serverMessage ?? t('toast.saveError'))
  } finally {
    sendingId.value = null
  }
}
</script>

<template>
  <KvModal :title="t('message.forwardTitle')" @close="emit('close')">
    <div class="flex flex-col gap-3 min-w-0" style="width: 360px; max-width: 100%;">
      <!-- İletilecek mesaj önizlemesi -->
      <div
        class="flex flex-col gap-2 px-3 py-2 rounded-[var(--kv-radius-md)] text-[13px]"
        style="background-color: var(--kv-bg-elevated); color: var(--kv-text-secondary);"
      >
        <p v-if="forwardText" class="line-clamp-2 break-words">{{ forwardText }}</p>
        <div v-if="firstAttachment" class="flex items-center gap-2 min-w-0">
          <div
            class="w-10 h-10 shrink-0 rounded-[var(--kv-radius-sm)] overflow-hidden flex items-center justify-center"
            style="background-color: var(--kv-bg-content); color: var(--kv-text-muted);"
          >
            <img v-if="previewThumb" :src="previewThumb" alt="" class="w-full h-full object-cover" />
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <span class="truncate min-w-0">{{ firstAttachment.filename }}</span>
          <span v-if="attachments.length > 1" class="shrink-0 text-[12px]" style="color: var(--kv-text-muted);">
            {{ t('message.forwardMoreFiles', { n: attachments.length - 1 }) }}
          </span>
        </div>
        <p v-if="!hasContent">{{ t('message.forwardEmpty') }}</p>
      </div>

      <DmTargetList
        :disabled="!hasContent"
        :sending-id="sendingId"
        :sent-ids="sentIds"
        :sent-label="t('message.forwardedShort')"
        @pick="forwardTo"
      />
    </div>
  </KvModal>
</template>
