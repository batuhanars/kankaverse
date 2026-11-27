<script lang="ts">
/**
 * Modül-seviyesi singleton: hangi mesajın emoji picker'ı açık?
 * Tüm MessageActionsMenu örnekleri bu ref'i paylaşır → aynı anda yalnız BİR picker açık olur.
 */
import { ref as moduleRef } from 'vue'
const openPickerMessageId = moduleRef<string | null>(null)
</script>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuickReactions } from '@/composables/useQuickReactions'
import EmojiPicker from './EmojiPicker.vue'
import { recordEmojiUse } from '@/utils/frequentEmojis'
import EmojiFaceIcon from './EmojiFaceIcon.vue'

defineOptions({ name: 'MessageActionsMenu' })

const props = withDefaults(defineProps<{
  messageId: string
  // C57: salt okunur kanalda yazamayan üyede false
  canReply?: boolean
  // C62: salt okunur (ayrıldığım grup): tepki/yanıt/ilet yok. Varsayılan false.
  readOnly?: boolean
  // C82: bu mesajın menüsü (⋯) açık mı? Düğme vurgusu için; menüyü MessageRow tutar.
  moreOpen?: boolean
}>(), { readOnly: false, moreOpen: false })

const emit = defineEmits<{
  reply: []
  forward: []
  addReaction: [emoji: string]
  /** ⋯ tıklandı: menünün açılacağı nokta (düğmenin sol-alt köşesi). */
  more: [x: number, y: number]
}>()

const { t } = useI18n()

// Hızlı reaksiyon şeridi (C24): hesaba bağlı, sunucu etkin listeyi (her zaman 5) oturum kullanıcısında döner.
const quickEmojis = useQuickReactions()

// Emoji picker açık mı? — modül singleton'a göre türetilir
const showEmojiPicker = computed(() => openPickerMessageId.value === props.messageId)

const emojiEl = ref<HTMLElement | null>(null)
// Emoji picker tetikleyici butonu (Teleport konumlandırması için)
const emojiTriggerEl = ref<HTMLElement | null>(null)

// Parent'ın araç çubuğunu görünür tutması için: emoji picker açıkken true
const menuOpen = computed(() => showEmojiPicker.value)

function closeAll() {
  // Yalnız kendi picker'ımızı kapat (diğer mesajların picker'ına dokunma)
  if (openPickerMessageId.value === props.messageId) {
    openPickerMessageId.value = null
  }
}
defineExpose({ menuOpen, closeAll })

function onReply() {
  closeAll()
  emit('reply')
}

function onForward() {
  closeAll()
  emit('forward')
}

function onMore(e: MouseEvent) {
  closeAll()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  emit('more', r.left, r.bottom + 4)
}

function toggleEmojiPicker(e: MouseEvent) {
  e.stopPropagation()
  // Singleton: açıksa kapat, kapalıysa bu mesajı aktif yap (önceki otomatik kapanır)
  if (openPickerMessageId.value === props.messageId) {
    openPickerMessageId.value = null
  } else {
    openPickerMessageId.value = props.messageId
  }
}

function pickEmoji(emoji: string) {
  closeAll()
  emit('addReaction', emoji)
}

// Şerit dokunuşu seçiciden geçmez; kullanım burada sayılır (seçici kendi seçimini kendisi yazar).
function pickQuick(emoji: string) {
  recordEmojiUse(emoji)
  pickEmoji(emoji)
}

function onDocClick(e: MouseEvent) {
  // Picker body'e Teleport edildiği için emojiEl.contains yetmez; .v3-emoji-picker ile de kontrol et.
  const emojiOpen =
    (emojiEl.value && emojiEl.value.contains(e.target as Node)) ||
    !!(e.target as Element)?.closest?.('.v3-emoji-picker')
  if (!emojiOpen) closeAll()
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeAll()
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKeydown)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKeydown)
})
</script>

<template>
  <!--
    Yatay hover araç çubuğu (Discord stili).
    Konum: üst bileşen tarafından absolute -top-3 right-4 ile konumlandırılır.
    Kap: kv-bg-elevated + 1px kv-border-subtle kenarlık + kv-radius-md, gölge yok.
  -->
  <div
    class="flex items-center rounded-[var(--kv-radius-md)] border"
    style="background-color: var(--kv-bg-elevated); border-color: var(--kv-border-subtle);"
    @click.stop
  >
    <!-- Hızlı reaksiyon emoji'leri -->
    <button
      v-for="emoji in readOnly ? [] : quickEmojis"
      :key="emoji"
      class="w-8 h-8 flex items-center justify-center text-[16px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      :title="emoji"
      @click="pickQuick(emoji)"
    >
      {{ emoji }}
    </button>

    <!-- Reaksiyon ekle (tam picker) — gri outline SVG ikon, renkli emojilerle karışmaz -->
    <div v-if="!readOnly" ref="emojiEl" class="relative">
      <button
        ref="emojiTriggerEl"
        class="w-8 h-8 flex items-center justify-center cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
        :class="showEmojiPicker ? 'bg-[var(--kv-bg-sidebar)]' : ''"
        :style="showEmojiPicker ? 'color: var(--kv-text-secondary)' : 'color: var(--kv-text-muted)'"
        :title="t('reaction.addReaction')"
        @click="toggleEmojiPicker"
      >
        <EmojiFaceIcon />
      </button>
      <!-- Tam emoji picker — Teleport to body ile viewport-farkındalıklı konumlandırma -->
      <EmojiPicker
        v-if="showEmojiPicker"
        :anchor-el="emojiTriggerEl"
        @select="pickEmoji"
      />
    </div>

    <!-- ↩ Yanıtla -->
    <button
      v-if="canReply !== false && !readOnly"
      class="w-8 h-8 flex items-center justify-center text-[15px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      style="color: var(--kv-text-muted);"
      :title="t('reply.button')"
      @click="onReply"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
    </button>

    <!-- ↪ İlet (forward — başka bir DM'e gönder) -->
    <button
      v-if="!readOnly"
      class="w-8 h-8 flex items-center justify-center text-[15px] cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      style="color: var(--kv-text-muted);"
      :title="t('message.forward')"
      @click="onForward"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
    </button>

    <!-- ⋯ Daha fazla: sağ tıkla AYNI menüyü (MessageContextMenu) düğmenin altında açar -->
    <button
      class="w-8 h-8 flex items-center justify-center text-[16px] font-bold cursor-pointer rounded-[var(--kv-radius-md)] transition-colors hover:bg-[var(--kv-bg-sidebar)]"
      :class="moreOpen ? 'bg-[var(--kv-bg-sidebar)]' : ''"
      style="color: var(--kv-text-secondary); line-height: 1;"
      :title="t('message.actions')"
      @click="onMore"
    >
      ⋯
    </button>
  </div>
</template>
