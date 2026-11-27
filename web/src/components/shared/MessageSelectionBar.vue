<script setup lang="ts">
/**
 * MessageSelectionBar: seçim modunda mesaj yazma kutusunun YERİNE çizilir (C82). Sol: ✕ + "{n} mesaj seçildi".
 * Sağ: Kopyala · Sil · İlet · İndir. Koşul yoksa düğme soluk ve tıklanamaz (gizlenmez). Şikâyet bilerek toplu değil.
 * Yetki kapıları sunucuda; burada yalnız yetkisi olmayan eylem etkin çizilmez.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { messagesApi } from '@/api/messages'
import { useMessagesStore } from '@/stores/messages'
import { useE2eeStore } from '@/stores/e2ee'
import { useToastStore } from '@/stores/toast'
import { formatMentionsPlain } from '@/utils/mentions'
import ConfirmDialog from './ConfirmDialog.vue'
import ForwardMessageModal from './ForwardMessageModal.vue'
import { downloadAttachments, isDownloadable } from '@/utils/downloadAttachment'
import type { MessageDto } from '@/types'

/** Tek seferde en çok bu kadar mesaj iletilir. */
const FORWARD_MAX = 20

const props = defineProps<{
  /** Seçili mesajlar, kronolojik sırada. */
  selected: MessageDto[]
  /** Salt okunur (ayrıldığım grup): Sil ve İlet kapalı. */
  readOnly: boolean
  /** Bu mesajı silme yetkim var mı? (kendi mesajım ya da MANAGE_MESSAGES) */
  canDelete: (message: MessageDto) => boolean
  mentionResolver: (userId: string) => string | undefined
  roleResolver?: (roleId: string) => { name: string } | undefined
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const toast = useToastStore()
const messagesStore = useMessagesStore()
const e2eeStore = useE2eeStore()

const showDelete = ref(false)
const deleting = ref(false)
const showForward = ref(false)

const messageText = (m: MessageDto) =>
  formatMentionsPlain(
    m.content,
    props.mentionResolver,
    t('mention.unknown'),
    (id) => props.roleResolver?.(id)?.name,
  )

/**
 * Rev.2 (WhatsApp): İndir her zaman görünür, yalnız seçilenlerin HEPSİ indirilebilir ek taşıyorsa etkin.
 * Araya düz metin mesajı karışırsa pasif. Ek altı açıklama metni etkinliği bozmaz.
 */
const downloadIds = computed(() =>
  props.selected.flatMap((m) => (m.attachments ?? []).filter(isDownloadable).map((a) => ({ id: a.id, filename: a.filename }))),
)
const canDownload = computed(
  () => props.selected.length > 0 && props.selected.every((m) => (m.attachments ?? []).some(isDownloadable)),
)
const canCopy = computed(() => props.selected.some((m) => !!m.content))
const canDeleteAll = computed(() => !props.readOnly && props.selected.every(props.canDelete))
const canForward = computed(() => !props.readOnly && props.selected.length <= FORWARD_MAX)

/** Tek mesajda yalnız metin; çokta kronolojik "ad: metin" satırları. */
async function copy() {
  const withText = props.selected.filter((m) => !!m.content)
  const text =
    withText.length === 1 && props.selected.length === 1
      ? messageText(withText[0])
      : withText.map((m) => `${m.author.username}: ${messageText(m)}`).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('select.copied'))
    emit('close')
  } catch {
    toast.error(t('common.error'))
  }
}

/** Sırayla mevcut DELETE ucu; iyimser güncelleme yok, kısmi hatada kalanlar seçili kalır. */
async function confirmDelete() {
  deleting.value = true
  const targets = [...props.selected]
  let ok = 0
  for (const m of targets) {
    try {
      await messagesApi.deleteMessage(m.channelId, m.id)
      messagesStore.removeMessage(m.channelId, m.id)
      void e2eeStore.forgetMessage(m.channelId, m.id) // E5a §4.1
      ok++
    } catch {
      // Bu mesaj silinemedi (yetki/ağ); kalanlara devam.
    }
  }
  deleting.value = false
  showDelete.value = false
  if (ok === targets.length) emit('close')
  else toast.error(t('select.deletedPartial', { n: targets.length, ok }))
}

async function download() {
  try {
    await downloadAttachments(downloadIds.value)
  } catch {
    toast.error(t('toast.saveError'))
  }
}

// Esc modu kapatır; açık bir pencere (silme onayı / ilet) varsa o pencere kapanır, mod değil.
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !showDelete.value && !showForward.value) emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

const BTN =
  'w-9 h-9 shrink-0 flex items-center justify-center rounded-[var(--kv-radius-md)] transition-colors cursor-pointer hover:bg-[var(--kv-bg-sidebar)]'
</script>

<template>
  <div>
    <div
      class="flex items-center gap-1 min-h-[44px] px-2 rounded-[var(--kv-radius-md)] border"
      style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
    >
      <button :class="BTN" style="color: var(--kv-text-secondary);" :title="t('select.close')" @click="emit('close')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <span class="flex-1 min-w-0 truncate text-[14px]" style="color: var(--kv-text-primary);">
        {{ t('select.count', { n: selected.length }) }}
      </span>
      <button v-if="canCopy" :class="BTN" style="color: var(--kv-text-secondary);" :title="t('message.copy')" @click="copy">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button v-if="canForward" :class="BTN" style="color: var(--kv-text-secondary);" :title="t('message.forward')" @click="showForward = true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
      </button>
      <button
        :class="BTN"
        class="disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        style="color: var(--kv-text-secondary);"
        :disabled="!canDownload"
        :title="t('select.download')"
        @click="download"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
      <button v-if="canDeleteAll" :class="BTN" style="color: var(--kv-danger);" :title="t('message.delete')" @click="showDelete = true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>

    <ConfirmDialog
      v-if="showDelete"
      :message="t('select.deleteConfirm', { n: selected.length })"
      :confirm-label="t('message.delete')"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="showDelete = false"
    />
    <ForwardMessageModal v-if="showForward" :messages="selected" @close="showForward = false" />
  </div>
</template>
