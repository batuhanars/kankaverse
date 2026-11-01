<script setup lang="ts">
/**
 * MessageContextMenu: mesaja sağ tık menüsü (Kopyala · Düzenle · Sil). ⋯ menüsünün hızlı yolu;
 * hangi öğenin görüneceğine aynı kurallarla MessageRow karar verir. Tepki yok: hover çubuğunda zaten görünür.
 */
import { useI18n } from 'vue-i18n'
import ContextMenuShell from './ContextMenuShell.vue'

defineProps<{
  x: number
  y: number
  messageId: string
  canCopy: boolean
  canEdit: boolean
  canDelete: boolean
}>()

const emit = defineEmits<{ close: []; copy: []; edit: []; delete: [] }>()

const { t } = useI18n()

function pick(action: 'copy' | 'edit' | 'delete') {
  // Önce eylem: çağıran seçim bilgisini menü kapanmadan okur.
  if (action === 'copy') emit('copy')
  else if (action === 'edit') emit('edit')
  else emit('delete')
  emit('close')
}
</script>

<template>
  <ContextMenuShell :x="x" :y="y" :menu-id="`msg-ctx:${messageId}`" @close="emit('close')">
    <button v-if="canCopy" class="kv-ctx__item" role="menuitem" @click="pick('copy')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      <span>{{ t('message.copy') }}</span>
    </button>
    <button v-if="canEdit" class="kv-ctx__item" role="menuitem" @click="pick('edit')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      <span>{{ t('message.edit') }}</span>
    </button>
    <button v-if="canDelete" class="kv-ctx__item kv-ctx__item--danger" role="menuitem" @click="pick('delete')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kv-ctx__icon"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      <span>{{ t('message.delete') }}</span>
    </button>
  </ContextMenuShell>
</template>
