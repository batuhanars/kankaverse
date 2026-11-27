<script setup lang="ts">
/**
 * ForwardMessageModal: bir ya da birden çok mesajı (C82) başka bir DM'e, gruba ya da ortam metin kanalına ilet (kanallar sahip isteği
 * 2026-11-24). Listeden hedef seç → mesajın metni + her eki o kanala gönderilir. Şifreli DM'den ortam kanalına
 * iletilen içerik orada düz gider: `useE2eeStore().send` kanal türüne göre yolu kendisi seçer.
 *
 * C30: ekler sunucuda KOPYALANIR (`POST /attachments/:id/forward` → yeni ek kimliği), sonra normal
 * mesaj gönderimiyle (`attachmentIds`) hedefe bağlanır. İstemci dosyayı indirip yeniden yüklemez.
 * Kapılar (kaynak kanal erişimi, tarama, hedef kanal kuralları) sunucuda; ret mesajı toast'ta.
 * C82: çok mesajda her hedefe mesajlar kronolojik sırayla TEK TEK gönderilir (`messages` listesi sıralı gelir).
 */
import { ref, computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useToastStore } from '@/stores/toast'
import { useE2eeStore } from '@/stores/e2ee'
import { attachmentsApi } from '@/api/attachments'
import KvModal from '@/components/ui/KvModal.vue'
import DmTargetList from '@/components/shared/DmTargetList.vue'
import { useAttachmentThumb } from '@/composables/useAttachmentThumb'
import KvButton from '@/components/ui/KvButton.vue'
import type { MessageDto } from '@/types'

const MAX_TARGETS = 5

const props = defineProps<{ messages: MessageDto[] }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const toast = useToastStore()

const router = useRouter()
const targetList = useTemplateRef<{ guildIdOf: (channelId: string) => string | null }>('targetList')
const sending = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const sentIds = ref<Set<string>>(new Set())

const isMulti = computed(() => props.messages.length > 1)
// Önizleme (tek mesaj): metin + ilk ek. Çok mesajda yalnız sayaç gösterilir.
const first = computed(() => props.messages[0])
const forwardText = computed(() => first.value?.content?.trim() ?? '')
const attachments = computed(() => first.value?.attachments ?? [])
const itemsOf = (m: MessageDto) => ({ text: m.content?.trim() ?? '', atts: m.attachments ?? [] })
// Metin de ek de yoksa iletilecek bir şey yok (bugünkü boş durum); çokta en az biri doluysa yeter
const hasContent = computed(() =>
  props.messages.some((m) => {
    const { text, atts } = itemsOf(m)
    return !!text || atts.length > 0
  }),
)

// Önizleme: ilk ek (birden fazlaysa "+N dosya" sayacı). Görsel için küçük resim adresi sunucudan,
// video için mesajdaki kare; diğerleri dosya simgesi + adı.
const firstAttachment = computed(() => attachments.value[0] ?? null)
const previewThumb = useAttachmentThumb(() => firstAttachment.value)

/** Hedef başına gönderim: mesajlar sırayla; her ek sunucuda kopyalanır, sonra normal (E2EE) mesaj gönderimiyle bağlanır. */
async function forwardTo(channelId: string) {
  for (const m of props.messages) {
    const { text, atts } = itemsOf(m)
    if (!text && !atts.length) continue
    const copies = await Promise.all(atts.map((a) => attachmentsApi.forward(a.id)))
    const attachmentIds = copies.map((r) => r.data.attachmentId)
    await useE2eeStore().send(channelId, text, undefined, attachmentIds)
  }
}

function onLimit() {
  toast.info(t('message.forwardLimit'))
}

/** C68 §2: hedefler paralel; kısmi hatada pencere açık kalır, başarılılar işaretlenir ve seçimden düşer. */
async function sendSelected() {
  if (sending.value || !selectedIds.value.size || !hasContent.value) return
  sending.value = true
  const ids = [...selectedIds.value]
  try {
    const results = await Promise.allSettled(ids.map((id) => forwardTo(id)))
    const okIds = ids.filter((_, i) => results[i].status === 'fulfilled')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (!failed.length) {
      finish(okIds)
      return
    }
    sentIds.value = new Set([...sentIds.value, ...okIds])
    selectedIds.value = new Set(ids.filter((id) => !okIds.includes(id)))
    const serverMessage = (failed[0].reason as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.error(serverMessage ?? t('toast.saveError'))
  } finally {
    sending.value = false
  }
}

/** §3: tek hedef o sohbete/kanala gider (DM: 'dm' rotası, ortam kanalı: 'channel'); zaten açıksa yalnız kapat. */
function finish(okIds: string[]) {
  emit('close')
  if (okIds.length > 1) {
    toast.success(t('message.forwardedMany', { n: okIds.length }))
    return
  }
  const channelId = okIds[0]
  const route = router.currentRoute.value
  if (route.params.channelId === channelId) return
  const guildId = targetList.value?.guildIdOf(channelId)
  if (guildId) void router.push({ name: 'channel', params: { guildId, channelId } })
  else void router.push({ name: 'dm', params: { channelId } })
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
        <p v-if="isMulti">{{ t('message.forwardCount', { n: messages.length }) }}</p>
        <p v-if="!isMulti && forwardText" class="line-clamp-2 break-words">{{ forwardText }}</p>
        <div v-if="!isMulti && firstAttachment" class="flex items-center gap-2 min-w-0">
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
        ref="targetList"
        v-model:selected-ids="selectedIds"
        selectable
        with-guild-channels
        :max="MAX_TARGETS"
        :disabled="!hasContent || sending"
        :sent-ids="sentIds"
        :sent-label="t('message.forwardedShort')"
        @limit="onLimit"
      />

      <KvButton
        class="w-full"
        :disabled="!hasContent || !selectedIds.size"
        :loading="sending"
        @click="sendSelected"
      >
        {{ selectedIds.size > 1 ? t('message.forwardSendCount', { n: selectedIds.size }) : t('message.forwardSend') }}
      </KvButton>
    </div>
  </KvModal>
</template>
