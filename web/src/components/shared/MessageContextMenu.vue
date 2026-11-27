<script setup lang="ts">
/**
 * MessageContextMenu: mesajın TEK menüsü (C82). Sağ tık da hover çubuğundaki ⋯ da bunu açar; sıra WhatsApp
 * düzeni: Yanıtla · Kopyala · İlet · Sabitle · Düzenle · Tepkileri gör | Seç | Farklı kaydet | Şikâyet et · Sil.
 * Hangi öğenin görüneceğine MessageRow karar verir (bayraklar); bu bileşen yalnız çizer. Tepki emojisi yok:
 * hover çubuğunda zaten görünür.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ContextMenuShell from './ContextMenuShell.vue'
import PinIcon from './PinIcon.vue'

const props = defineProps<{
  x: number
  y: number
  messageId: string
  canReply: boolean
  canCopy: boolean
  canForward: boolean
  canPin: boolean
  isPinned: boolean
  canEdit: boolean
  canViewReactions: boolean
  canSelect: boolean
  /** Mesajda ek varsa: tek ek (ya da üstünde sağ tıklanan ek) → 'one', birden çok → 'all'. */
  saveMode: 'one' | 'all' | null
  canDelete: boolean
  canReport: boolean
}>()

type Action =
  | 'reply' | 'copy' | 'forward' | 'pin' | 'unpin' | 'edit'
  | 'viewReactions' | 'select' | 'save' | 'delete' | 'report'

const emit = defineEmits<{
  close: []
  reply: []
  copy: []
  forward: []
  pin: []
  unpin: []
  edit: []
  viewReactions: []
  select: []
  save: []
  delete: []
  report: []
}>()

const { t } = useI18n()

const hasGroup1 = computed(
  () => props.canReply || props.canCopy || props.canForward || props.canPin || props.canEdit || props.canViewReactions,
)
const hasGroup4 = computed(() => props.canReport || props.canDelete)

function pick(action: Action) {
  // Önce eylem: çağıran seçim bilgisini menü kapanmadan okur.
  if (action === 'reply') emit('reply')
  else if (action === 'copy') emit('copy')
  else if (action === 'forward') emit('forward')
  else if (action === 'pin') emit('pin')
  else if (action === 'unpin') emit('unpin')
  else if (action === 'edit') emit('edit')
  else if (action === 'viewReactions') emit('viewReactions')
  else if (action === 'select') emit('select')
  else if (action === 'save') emit('save')
  else if (action === 'report') emit('report')
  else emit('delete')
  emit('close')
}
</script>

<template>
  <ContextMenuShell :x="x" :y="y" :menu-id="`msg-ctx:${messageId}`" @close="emit('close')">
    <button v-if="canReply" class="kv-ctx__item" role="menuitem" @click="pick('reply')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
      <span>{{ t('reply.button') }}</span>
    </button>
    <button v-if="canCopy" class="kv-ctx__item" role="menuitem" @click="pick('copy')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      <span>{{ t('message.copy') }}</span>
    </button>
    <button v-if="canForward" class="kv-ctx__item" role="menuitem" @click="pick('forward')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
      <span>{{ t('message.forward') }}</span>
    </button>
    <button v-if="canPin" class="kv-ctx__item" role="menuitem" @click="pick(isPinned ? 'unpin' : 'pin')">
      <PinIcon :size="15" class="kv-ctx__icon" />
      <span>{{ isPinned ? t('message.unpin') : t('message.pin') }}</span>
    </button>
    <button v-if="canEdit" class="kv-ctx__item" role="menuitem" @click="pick('edit')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      <span>{{ t('message.edit') }}</span>
    </button>
    <button v-if="canViewReactions" class="kv-ctx__item" role="menuitem" @click="pick('viewReactions')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
      <span>{{ t('reaction.viewReactions') }}</span>
    </button>

    <template v-if="canSelect">
      <div v-if="hasGroup1" class="kv-ctx__divider" role="separator" />
      <button class="kv-ctx__item" role="menuitem" @click="pick('select')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><rect x="3" y="3" width="18" height="18" rx="3"/><polyline points="8 12 11 15 16 9"/></svg>
        <span>{{ t('select.start') }}</span>
      </button>
    </template>

    <template v-if="saveMode">
      <div v-if="hasGroup1 || canSelect" class="kv-ctx__divider" role="separator" />
      <button class="kv-ctx__item" role="menuitem" @click="pick('save')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>{{ saveMode === 'all' ? t('message.saveAll') : t('message.saveAs') }}</span>
      </button>
    </template>

    <div v-if="hasGroup4 && (hasGroup1 || canSelect || saveMode)" class="kv-ctx__divider" role="separator" />
    <button v-if="canReport" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="pick('report')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
      <span>{{ t('report.reportMessage') }}</span>
    </button>
    <button v-if="canDelete" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="pick('delete')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      <span>{{ t('message.delete') }}</span>
    </button>
  </ContextMenuShell>
</template>
